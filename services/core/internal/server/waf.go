package server

import (
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/waf"
)

// Sprint M P4 — the app-layer WAF wiring: a MONITOR-mode middleware over the core /api/* stream, an
// aggregate stats snapshot, and a pure-preview probe. Safety invariants (see plans/phase-4-waf.md):
// monitor never blocks/wraps the ResponseWriter (SSE-safe); an exempt allowlist (health/webhook/SSE/self)
// is never inspected; ZERO client IP or UA is ever stored or emitted (the ring keeps the path only); the
// probe is a pure engine preview that never mutates the live counters.

// wafRecent is one redacted entry in the recent-findings ring — path only, NEVER the query, IP, or UA.
type wafRecent struct {
	RuleID   string       `json:"ruleId"`
	Category waf.Category `json:"category"`
	Method   string       `json:"method"`
	Path     string       `json:"path"`
	TS       string       `json:"ts"`
}

// wafSnapshot is the aggregate dashboard view — no per-request identity, no IP.
type wafSnapshot struct {
	Inspected  int64                  `json:"inspected"`
	Flagged    int64                  `json:"flagged"`
	Blocked    int64                  `json:"blocked"`
	ByCategory map[waf.Category]int64 `json:"byCategory"`
	Recent     []wafRecent            `json:"recent"`
	RateDenied int64                  `json:"rateDenied"` // the global limiter's aggregate 429 count — the honest "rate" signal
}

// wafState holds the aggregate counters + a bounded ring of recent redacted findings.
type wafState struct {
	inspected atomic.Int64
	flagged   atomic.Int64
	blocked   atomic.Int64
	mu        sync.Mutex
	byCat     map[waf.Category]int64
	ring      []wafRecent
	pos       int // next write index
	n         int // valid entries (≤ len(ring))
}

// newWAFState builds the state with a bounded ring. The size is floored ≥1 defensively (config already
// clamps it, but a direct caller must never produce a size-0 modulo panic).
func newWAFState(size int) *wafState {
	if size < 1 {
		size = 1
	}
	return &wafState{byCat: make(map[waf.Category]int64), ring: make([]wafRecent, size)}
}

func (s *wafState) record(method, path string, findings []waf.Finding, blocked bool) {
	s.inspected.Add(1)
	if len(findings) == 0 {
		return
	}
	s.flagged.Add(1)
	if blocked {
		s.blocked.Add(1)
	}
	entry := wafRecent{
		RuleID:   findings[0].RuleID,
		Category: findings[0].Category,
		Method:   method,
		Path:     truncPath(path),
		TS:       time.Now().UTC().Format(time.RFC3339),
	}
	s.mu.Lock()
	for _, f := range findings {
		s.byCat[f.Category]++
	}
	s.ring[s.pos] = entry
	s.pos = (s.pos + 1) % len(s.ring)
	if s.n < len(s.ring) {
		s.n++
	}
	s.mu.Unlock()
}

// Snapshot returns the aggregate view with recent findings newest-first. rateDenied is injected by the
// caller from the global limiter (kept out of wafState so no rate/IP state lives here).
func (s *wafState) Snapshot(rateDenied int64) wafSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	byCat := make(map[waf.Category]int64, len(s.byCat))
	for k, v := range s.byCat {
		byCat[k] = v
	}
	recent := make([]wafRecent, 0, s.n)
	size := len(s.ring)
	for i := 0; i < s.n; i++ {
		idx := (s.pos - 1 - i + size*2) % size // newest-first
		recent = append(recent, s.ring[idx])
	}
	return wafSnapshot{
		Inspected:  s.inspected.Load(),
		Flagged:    s.flagged.Load(),
		Blocked:    s.blocked.Load(),
		ByCategory: byCat,
		Recent:     recent,
		RateDenied: rateDenied,
	}
}

func truncPath(p string) string {
	if len(p) > 80 {
		return p[:80]
	}
	return p
}

// wafExempt is the never-inspect/never-block allowlist: health probes, the signed deploy webhook, the three
// core SSE streams, and the WAF's own endpoints (so the probe is a pure preview, never self-counted/blocked).
func wafExempt(path string) bool {
	if middleware.IsHealthPath(path) {
		return true
	}
	switch path {
	case "/api/hooks/deploy",
		"/api/stream", "/api/lab/events", "/api/lab/loadtest",
		"/api/lab/waf", "/api/lab/waf/probe":
		return true
	}
	return false
}

// wafMiddleware inspects non-exempt /api/* requests in MONITOR mode. It only READS the request then calls
// next (never wraps the ResponseWriter → SSE Flush preserved); the ONLY write path is the opt-in soft-block
// 403, reachable solely when WAF_BLOCK=true and a Block-eligible rule matches a non-exempt request.
func wafMiddleware(engine *waf.Engine, state *wafState, cfg config.Config, labHub *hub) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !cfg.WAFEnabled || wafExempt(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			findings := engine.Inspect(waf.Request{
				Method:    r.Method,
				Path:      r.URL.Path,
				Query:     r.URL.RawQuery,
				UserAgent: r.UserAgent(),
			})
			block := false
			if cfg.WAFBlock {
				for _, f := range findings {
					if f.Block {
						block = true
						break
					}
				}
			}
			state.record(r.Method, r.URL.Path, findings, block)
			if len(findings) > 0 {
				publishLabEvent(labHub, "waf", string(findings[0].Category)) // redacted: category only, never IP/path
			}
			if block {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "request blocked by WAF"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// wafStatsHandler serves the aggregate dashboard snapshot. LabEnabled-gated. rateDenied comes from the
// global limiter's aggregate Snapshot (no IP).
func wafStatsHandler(cfg config.Config, state *wafState, limiter *middleware.Limiter) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		if !cfg.LabEnabled {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		writeJSON(w, http.StatusOK, state.Snapshot(limiter.Snapshot().Denied))
	}
}

// wafProbeHandler is a PURE PREVIEW: it runs the engine on a visitor-chosen sample and echoes the verdict
// WITHOUT mutating the live counters (the route is exempt, so the middleware never touches it either). This
// keeps the dashboard's counters reflecting only real organic traffic.
func wafProbeHandler(cfg config.Config, engine *waf.Engine) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !cfg.LabEnabled {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		sample := r.URL.Query().Get("sample")
		if len(sample) > 200 {
			sample = sample[:200]
		}
		findings := engine.Inspect(waf.Request{Method: "GET", Query: sample})
		if findings == nil {
			findings = []waf.Finding{} // always a JSON array, never null
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"sample":      sample,
			"findings":    findings,
			"monitorOnly": !cfg.WAFBlock,
			"note":        "preview only — does not affect the live counters; monitor mode flags, does not block",
		})
	}
}
