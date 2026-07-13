package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

// The uptime surface (P7): a background loop probes core + its key deps, stores a bounded in-memory ring
// per target, and records incidents on up→down / down→up transitions. GET /api/uptime serves a snapshot.
//
// SAFETY (QA HIGH): this is the codebase's first always-on background goroutine, on the one path
// middleware.Recover can't protect — a panic here would crash-loop the single-replica core and 502 ALL
// /api/*. So (a) probes write ONLY their own preallocated slot; the maps/slices are mutated solely in a
// single-threaded fold under mu after wg.Wait() (a concurrent map write is FATAL, unrecoverable); and
// (b) each tick + each probe goroutine is wrapped in recover() so a transient panic degrades one tick.
// Storage is in-memory (accepted, like deployStore): a restart resets history; it self-heals.

type Sample struct {
	TS int64 `json:"ts"` // unix seconds
	Up bool  `json:"up"`
	MS int64 `json:"ms"`
}

// Incident is one down window. End/DurationS are nil while ongoing. snapshot() copies these as NEW
// pointers so a reader can never race the loop through shared backing memory.
type Incident struct {
	Target    string  `json:"target"`
	Start     string  `json:"start"`
	End       *string `json:"end"`
	DurationS *int64  `json:"durationS"`
}

type probe struct {
	name, url, kind string // kind: "self" | "http"
}

type uptimeMonitor struct {
	probes   []probe
	interval time.Duration
	http     *http.Client

	mu        sync.Mutex
	samples   map[string][]Sample
	last      map[string]bool // last observed up-state (transition detection)
	seen      map[string]bool // have we observed this target at least once
	incidents []Incident
}

const (
	uptimeRingCap    = 2880 // ~24h @ 30s
	uptimeStripLen   = 40   // bar-strip length for the UI
	uptimeMinSamples = 3    // below this a target reads "collecting", not a false 100%
	maxIncidents     = 50
)

func newUptimeMonitor(cfg config.Config) *uptimeMonitor {
	return &uptimeMonitor{
		probes: []probe{
			{name: "core", kind: "self"},
			{name: "prometheus", url: cfg.PrometheusURL + "/-/healthy", kind: "http"},
			{name: "loki", url: cfg.LokiURL + "/ready", kind: "http"},
			{name: "web", url: cfg.WebURL + "/", kind: "http"},
		},
		interval: cfg.UptimeInterval,
		http:     &http.Client{Timeout: 3 * time.Second},
		samples:  make(map[string][]Sample),
		last:     make(map[string]bool),
		seen:     make(map[string]bool),
	}
}

// Run drives the probe loop until ctx (main's SIGTERM context) is cancelled. Started from main.go — NOT
// server.New — so handler-only test builds don't spawn a network-dialing loop.
func (m *uptimeMonitor) Run(ctx context.Context) {
	if m.interval <= 0 {
		m.interval = 30 * time.Second
	}
	m.tick(ctx) // immediate first probe so /api/uptime isn't empty for a full interval
	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			m.tick(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (m *uptimeMonitor) tick(ctx context.Context) {
	defer func() { _ = recover() }() // a panic degrades one tick, never kills core

	type res struct {
		up bool
		ms int64
	}
	results := make([]res, len(m.probes))
	var wg sync.WaitGroup
	for i, p := range m.probes {
		wg.Add(1)
		go func(i int, p probe) {
			defer wg.Done()
			defer func() { _ = recover() }() // slot stays {false,0} on a probe panic
			up, ms := m.probeOne(ctx, p)
			results[i] = res{up, ms}
		}(i, p)
	}
	wg.Wait()

	now := time.Now()
	nowUnix := now.Unix()
	nowRFC := now.UTC().Format(time.RFC3339)

	// single-threaded fold — the ONLY writer of samples/last/seen/incidents
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, p := range m.probes {
		m.applyResult(p.name, results[i].up, results[i].ms, nowUnix, nowRFC)
	}
}

// applyResult appends one target's sample + runs transition detection. Caller MUST hold m.mu (tick holds
// it for the whole fold). Split out so the incident logic is unit-testable without network probes.
func (m *uptimeMonitor) applyResult(name string, up bool, ms, nowUnix int64, nowRFC string) {
	s := append(m.samples[name], Sample{TS: nowUnix, Up: up, MS: ms})
	if len(s) > uptimeRingCap {
		s = s[len(s)-uptimeRingCap:]
	}
	m.samples[name] = s

	switch {
	case !m.seen[name]:
		if !up {
			m.openIncident(name, nowRFC) // first observation is DOWN → honest incident
		}
	case m.last[name] && !up:
		m.openIncident(name, nowRFC) // up → down
	case !m.last[name] && up:
		m.closeIncident(name, nowRFC, nowUnix) // down → up
	}
	m.last[name] = up
	m.seen[name] = true
}

// openIncident/closeIncident run under mu (called only from the fold).
func (m *uptimeMonitor) openIncident(target, startRFC string) {
	m.incidents = append(m.incidents, Incident{Target: target, Start: startRFC})
	if len(m.incidents) > maxIncidents {
		m.incidents = m.incidents[len(m.incidents)-maxIncidents:]
	}
}

func (m *uptimeMonitor) closeIncident(target, endRFC string, endUnix int64) {
	for j := len(m.incidents) - 1; j >= 0; j-- {
		if m.incidents[j].Target == target && m.incidents[j].End == nil {
			end := endRFC
			dur := endUnix - rfcToUnix(m.incidents[j].Start)
			if dur < 0 {
				dur = 0
			}
			m.incidents[j].End = &end
			m.incidents[j].DurationS = &dur
			return
		}
	}
}

func (m *uptimeMonitor) probeOne(ctx context.Context, p probe) (bool, int64) {
	if p.kind == "self" {
		return true, 0 // in-process: if this runs, core is up
	}
	pctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(pctx, http.MethodGet, p.url, nil)
	if err != nil {
		return false, 0
	}
	start := time.Now()
	resp, err := m.http.Do(req)
	ms := time.Since(start).Milliseconds()
	if err != nil {
		return false, ms
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 400, ms
}

// TargetStatus + Uptime mirror data/uptime.ts EXACTLY.
type TargetStatus struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"` // up | down | collecting
	UptimePct   float64 `json:"uptimePct"`
	LatencyMs   *int64  `json:"latencyMs"`
	LastChange  string  `json:"lastChange"`
	SampleCount int     `json:"sampleCount"`
	WindowStart string  `json:"windowStart"`
	Strip       []bool  `json:"strip"`
}

type Uptime struct {
	Targets   []TargetStatus `json:"targets"`
	Incidents []Incident     `json:"incidents"`
	TS        string         `json:"ts"`
}

func (m *uptimeMonitor) snapshot() Uptime {
	m.mu.Lock()
	defer m.mu.Unlock()

	targets := make([]TargetStatus, 0, len(m.probes))
	for _, p := range m.probes {
		ss := m.samples[p.name]
		n := len(ss)
		t := TargetStatus{Name: p.name, SampleCount: n, Strip: []bool{}}
		if n == 0 {
			t.Status = "collecting"
			targets = append(targets, t)
			continue
		}
		t.WindowStart = time.Unix(ss[0].TS, 0).UTC().Format(time.RFC3339)
		up := 0
		for _, s := range ss {
			if s.Up {
				up++
			}
		}
		t.UptimePct = float64(up) / float64(n) * 100
		last := ss[n-1]
		switch {
		case n < uptimeMinSamples:
			t.Status = "collecting"
		case last.Up:
			t.Status = "up"
			ms := last.MS
			t.LatencyMs = &ms // fresh pointer per target
		default:
			t.Status = "down"
		}
		t.LastChange = time.Unix(last.TS, 0).UTC().Format(time.RFC3339)
		for j := n - 1; j > 0; j-- {
			if ss[j].Up != ss[j-1].Up {
				t.LastChange = time.Unix(ss[j].TS, 0).UTC().Format(time.RFC3339)
				break
			}
		}
		from := 0
		if n > uptimeStripLen {
			from = n - uptimeStripLen
		}
		strip := make([]bool, 0, n-from)
		for _, s := range ss[from:] {
			strip = append(strip, s.Up)
		}
		t.Strip = strip
		targets = append(targets, t)
	}

	// deep-copy incidents (NEW pointers) newest-first — no shared backing memory escapes the lock
	inc := make([]Incident, 0, len(m.incidents))
	for i := len(m.incidents) - 1; i >= 0; i-- {
		in := m.incidents[i]
		c := Incident{Target: in.Target, Start: in.Start}
		if in.End != nil {
			e := *in.End
			c.End = &e
		}
		if in.DurationS != nil {
			d := *in.DurationS
			c.DurationS = &d
		}
		inc = append(inc, c)
	}
	return Uptime{Targets: targets, Incidents: inc, TS: time.Now().UTC().Format(time.RFC3339)}
}

func rfcToUnix(s string) int64 {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Unix()
	}
	return 0
}

func uptimeHandler(m *uptimeMonitor) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, m.snapshot())
	}
}
