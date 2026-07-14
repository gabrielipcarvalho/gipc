package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
)

// bucketEdges are the histogram upper edges in ms (+ an implicit overflow bucket).
var bucketEdges = []float64{1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500}

// histogram accumulates request latencies from the load workers. All access is mu-guarded.
type histogram struct {
	mu      sync.Mutex
	buckets []int64 // len(bucketEdges)+1 (last = overflow)
	total   int64
	errors  int64
	sumMs   float64
}

func newHistogram() *histogram { return &histogram{buckets: make([]int64, len(bucketEdges)+1)} }

func (h *histogram) record(ms float64, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.total++
	if !ok {
		h.errors++
	}
	h.sumMs += ms
	for i, edge := range bucketEdges {
		if ms <= edge {
			h.buckets[i]++
			return
		}
	}
	h.buckets[len(h.buckets)-1]++ // overflow
}

// LoadBucket / LoadHistogram are the JSON contract (mirrored in apps/web data/lab.ts).
type LoadBucket struct {
	Ms    float64 `json:"ms"`
	Count int64   `json:"count"`
}
type LoadHistogram struct {
	Buckets   []LoadBucket `json:"buckets"`
	Total     int64        `json:"total"`
	Errors    int64        `json:"errors"`
	P50       float64      `json:"p50"`
	P95       float64      `json:"p95"`
	P99       float64      `json:"p99"`
	RPS       float64      `json:"rps"`
	ElapsedMs int64        `json:"elapsedMs"`
}

// snapshot copies counters under the lock, then computes percentiles/rps outside it.
func (h *histogram) snapshot(elapsed time.Duration) LoadHistogram {
	h.mu.Lock()
	counts := make([]int64, len(h.buckets))
	copy(counts, h.buckets)
	total, errors := h.total, h.errors
	h.mu.Unlock()

	out := LoadHistogram{Total: total, Errors: errors, ElapsedMs: elapsed.Milliseconds()}
	out.Buckets = make([]LoadBucket, len(bucketEdges))
	for i, edge := range bucketEdges {
		out.Buckets[i] = LoadBucket{Ms: edge, Count: counts[i]}
	}
	secs := elapsed.Seconds()
	if secs > 0.001 {
		out.RPS = float64(total) / secs
	}
	out.P50 = percentile(counts, total, 0.50)
	out.P95 = percentile(counts, total, 0.95)
	out.P99 = percentile(counts, total, 0.99)
	return out
}

// percentile: nearest-rank over cumulative bucket counts; the bucket's upper edge is the estimate.
func percentile(counts []int64, total int64, p float64) float64 {
	if total == 0 {
		return 0
	}
	rank := int64(p*float64(total) + 0.999999)
	if rank < 1 {
		rank = 1
	}
	var cum int64
	for i, c := range counts {
		cum += c
		if cum >= rank {
			if i < len(bucketEdges) {
				return bucketEdges[i]
			}
			return bucketEdges[len(bucketEdges)-1] * 4 // overflow estimate
		}
	}
	return bucketEdges[len(bucketEdges)-1] * 4
}

// runLoad fires `concurrency` workers at the fixed target until ctx is done, recording into h. Every worker
// exits on ctx cancel; the WaitGroup join means the caller can bound the run's lifetime by ctx alone.
func runLoad(ctx context.Context, target string, concurrency int, h *histogram) {
	// dedicated transport so the run's keep-alive connections are OURS to close at the end — otherwise
	// idle persistConn goroutines linger ~90s (IdleConnTimeout) past the run.
	tr := &http.Transport{MaxIdleConns: concurrency, MaxIdleConnsPerHost: concurrency}
	client := &http.Client{
		Timeout:   2 * time.Second,
		Transport: tr,
		// never follow redirects — keeps the "target is fixed" guarantee even if the target ever 3xx'd
		// somewhere else (defense-in-depth against SSRF via a redirect).
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	defer tr.CloseIdleConnections()
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ctx.Err() == nil {
				start := time.Now()
				req, _ := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
				resp, err := client.Do(req)
				ms := float64(time.Since(start).Microseconds()) / 1000.0
				ok := err == nil && resp != nil && resp.StatusCode < 500
				if resp != nil {
					resp.Body.Close()
				}
				if ctx.Err() != nil {
					return // don't record a request cut short by cancellation
				}
				h.record(ms, ok)
			}
		}()
	}
	wg.Wait()
}

func atoiOr(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

// loadTestHandler runs a bounded load test against the FIXED demo target and streams a live histogram (SSE).
// The run lives exactly as long as the connection (bounded by the duration cap) — disconnect cancels it.
func loadTestHandler(cfg config.Config, srvCtx context.Context, labHub *hub, log *slog.Logger) http.HandlerFunc {
	var activeRuns atomic.Int64
	var inflight sync.Map // per-IP single-flight
	maxRuns := int64(cfg.LoadMaxRuns)

	return func(w http.ResponseWriter, r *http.Request) {
		if !cfg.LabEnabled {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		c := clamp(atoiOr(r.URL.Query().Get("c"), 0), 1, cfg.LoadMaxConcurrency)
		s := clamp(atoiOr(r.URL.Query().Get("s"), 0), 1, cfg.LoadMaxSeconds)

		if activeRuns.Add(1) > maxRuns { // global concurrent-run cap FIRST (mirror streamHandler)
			activeRuns.Add(-1)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "too many load tests"})
			return
		}
		defer activeRuns.Add(-1)

		ip := middleware.ClientIP(r)
		if _, loaded := inflight.LoadOrStore(ip, true); loaded { // per-IP single-flight
			writeJSON(w, http.StatusConflict, map[string]string{"error": "a load test is already running from your address"})
			return // do NOT delete the in-progress runner's key
		}
		defer inflight.Delete(ip)

		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(s)*time.Second)
		defer cancel()
		// end on server shutdown too — AfterFunc (not a parked goroutine) so it's deregistered on return
		// and can't leak per request.
		defer context.AfterFunc(srvCtx, cancel)()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		rc := http.NewResponseController(w)
		writeFrame := func(event string, data []byte) bool {
			_ = rc.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
				return false
			}
			return rc.Flush() == nil
		}

		h := newHistogram()
		start := time.Now()
		log.Info("loadtest_start", "c", c, "s", s) // audit: params only — no ip, no content, no token (parity with chaos_kill)
		publishLabEvent(labHub, "loadtest", fmt.Sprintf("start c=%d s=%d", c, s))
		// done fires on EVERY termination path (ctx.Done + client-gone) — a CLOSURE so the snapshot is read
		// at defer-time, not at registration (a direct defer would capture total=0).
		defer func() {
			publishLabEvent(labHub, "loadtest", fmt.Sprintf("done total=%d", h.snapshot(time.Since(start)).Total))
		}()
		var runWG sync.WaitGroup
		runWG.Add(1)
		go func() { defer runWG.Done(); runLoad(ctx, cfg.LoadTargetURL, c, h) }()

		ticker := time.NewTicker(250 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				runWG.Wait() // fully contain the run before returning
				writeJSONFrame(writeFrame, "done", h.snapshot(time.Since(start)))
				return
			case <-ticker.C:
				if !writeJSONFrame(writeFrame, "histogram", h.snapshot(time.Since(start))) {
					return // client gone → defers cancel the run
				}
			}
		}
	}
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func writeJSONFrame(writeFrame func(string, []byte) bool, event string, v any) bool {
	b, err := json.Marshal(v)
	if err != nil {
		return true
	}
	return writeFrame(event, b)
}
