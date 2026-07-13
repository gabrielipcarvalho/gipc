package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

// feed drives a synthetic up/down sequence for one target through applyResult (base ts + i seconds).
func feed(m *uptimeMonitor, name string, ups []bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	base := int64(1_700_000_000)
	for i, up := range ups {
		ts := base + int64(i)
		m.applyResult(name, up, 5, ts, time.Unix(ts, 0).UTC().Format(time.RFC3339))
	}
}

// TestIncidentOpenClose: up→down opens an incident, down→up closes it with a duration; a still-down
// target has an ongoing (End==nil) incident.
func TestIncidentOpenClose(t *testing.T) {
	m := newUptimeMonitor(config.Config{})
	feed(m, "web", []bool{true, true, false, false, true}) // down at idx2, back up at idx4
	feed(m, "loki", []bool{true, false})                   // still down → ongoing

	snap := m.snapshot()
	byName := map[string][]Incident{}
	for _, in := range snap.Incidents {
		byName[in.Target] = append(byName[in.Target], in)
	}
	if len(byName["web"]) != 1 {
		t.Fatalf("web: want 1 incident, got %d", len(byName["web"]))
	}
	w := byName["web"][0]
	if w.End == nil || w.DurationS == nil {
		t.Fatalf("web incident should be closed: %+v", w)
	}
	if *w.DurationS != 2 { // down at 1700000002, up at 1700000004
		t.Fatalf("web incident duration = %d, want 2", *w.DurationS)
	}
	if len(byName["loki"]) != 1 || byName["loki"][0].End != nil {
		t.Fatalf("loki incident should be ongoing (End nil): %+v", byName["loki"])
	}
}

// TestUptimePctAndStatus: 4/5 up → 80%; last sample up → status up; a fresh target with <3 samples reads
// "collecting" (never a false 100%).
func TestUptimePctAndStatus(t *testing.T) {
	m := newUptimeMonitor(config.Config{})
	feed(m, "web", []bool{true, false, true, true, true}) // 4/5 up, last up
	feed(m, "core", []bool{true})                         // 1 sample → collecting

	snap := m.snapshot()
	get := func(name string) TargetStatus {
		for _, ts := range snap.Targets {
			if ts.Name == name {
				return ts
			}
		}
		t.Fatalf("target %s missing", name)
		return TargetStatus{}
	}
	web := get("web")
	if web.UptimePct != 80 {
		t.Fatalf("web uptimePct = %v, want 80", web.UptimePct)
	}
	if web.Status != "up" || web.LatencyMs == nil {
		t.Fatalf("web status/latency wrong: %+v", web)
	}
	if c := get("core"); c.Status != "collecting" {
		t.Fatalf("core status = %q, want collecting (fresh, <3 samples)", c.Status)
	}
}

// TestSnapshotDeepCopy: mutating the returned snapshot must not affect internal state (no shared backing
// memory escapes the lock).
func TestSnapshotDeepCopy(t *testing.T) {
	m := newUptimeMonitor(config.Config{})
	feed(m, "web", []bool{true, false, true}) // one closed incident
	snap := m.snapshot()
	if len(snap.Incidents) != 1 || snap.Incidents[0].End == nil {
		t.Fatalf("setup: want 1 closed incident, got %+v", snap.Incidents)
	}
	*snap.Incidents[0].End = "TAMPERED" // mutate through the returned pointer
	snap.Incidents[0].Target = "TAMPERED"

	again := m.snapshot()
	if *again.Incidents[0].End == "TAMPERED" || again.Incidents[0].Target == "TAMPERED" {
		t.Fatal("snapshot shares incident backing memory with the monitor")
	}
}

// TestUptimeHandler: 200 + valid JSON with all probe targets present, even with no samples yet.
func TestUptimeHandler(t *testing.T) {
	m := newUptimeMonitor(config.Config{})
	rec := httptest.NewRecorder()
	uptimeHandler(m)(rec, httptest.NewRequest("GET", "/api/uptime", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code %d, want 200", rec.Code)
	}
	var u Uptime
	if err := json.Unmarshal(rec.Body.Bytes(), &u); err != nil {
		t.Fatal(err)
	}
	if len(u.Targets) != 4 { // core, prometheus, loki, web
		t.Fatalf("want 4 targets, got %d", len(u.Targets))
	}
	for _, ts := range u.Targets {
		if ts.Status != "collecting" {
			t.Fatalf("fresh target %s status = %q, want collecting", ts.Name, ts.Status)
		}
	}
}
