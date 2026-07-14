package middleware

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// bucket is a single client's token bucket.
type bucket struct {
	tokens   float64
	last     time.Time
	lastSeen time.Time
}

// Limiter is a per-client token-bucket rate limiter (stdlib only — no external deps).
// Clients are keyed by CF-Connecting-IP (see ClientIP) so the limit is genuinely per-visitor
// behind the Cloudflare → cloudflared → Caddy → core proxy chain, not one global bucket.
type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rps     float64
	burst   float64
	ttl     time.Duration
	denied  atomic.Int64 // cumulative 429s since start (for the lab rate-limit visualizer — aggregate only)
}

// RateLimitSnapshot is the AGGREGATE-only view for the lab visualizer — never bucket keys (IPs) or tokens.
// Denied is cumulative since process start; the client renders a rate from successive-snapshot deltas.
type RateLimitSnapshot struct {
	RPS           float64 `json:"rps"`
	Burst         int     `json:"burst"`
	ActiveBuckets int     `json:"activeBuckets"`
	Denied        int64   `json:"denied"`
}

// Snapshot returns the limiter's live aggregate state. No per-IP data is exposed.
func (l *Limiter) Snapshot() RateLimitSnapshot {
	l.mu.Lock()
	n := len(l.buckets)
	l.mu.Unlock()
	return RateLimitSnapshot{RPS: l.rps, Burst: int(l.burst), ActiveBuckets: n, Denied: l.denied.Load()}
}

// NewLimiter builds a limiter refilling at rps tokens/sec with a bucket size of burst.
// It starts a background sweeper that evicts idle buckets to bound memory.
func NewLimiter(rps float64, burst int) *Limiter {
	l := &Limiter{
		buckets: make(map[string]*bucket),
		rps:     rps,
		burst:   float64(burst),
		ttl:     10 * time.Minute,
	}
	go l.sweepLoop()
	return l
}

// allow reports whether the client identified by key may proceed at time now.
// Split out (and now-injected) so tests are deterministic.
func (l *Limiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	// refill by elapsed time, capped at burst
	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens += elapsed * l.rps
		if b.tokens > l.burst {
			b.tokens = l.burst
		}
		b.last = now
	}
	b.lastSeen = now
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

func (l *Limiter) sweepLoop() {
	t := time.NewTicker(l.ttl / 2)
	defer t.Stop()
	for now := range t.C {
		l.mu.Lock()
		for k, b := range l.buckets {
			if now.Sub(b.lastSeen) > l.ttl {
				delete(l.buckets, k)
			}
		}
		l.mu.Unlock()
	}
}

// Middleware enforces the limit, returning 429 + Retry-After on refusal.
func (l *Limiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !IsHealthPath(r.URL.Path) && !l.allow(ClientIP(r), time.Now()) {
			l.denied.Add(1)
			retry := 1
			if l.rps > 0 {
				retry = int(1.0/l.rps) + 1
			}
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ClientIP resolves the real client address behind the proxy chain:
// CF-Connecting-IP (injected by Cloudflare, survives cloudflared→Caddy) → leftmost X-Forwarded-For → RemoteAddr.
func ClientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
