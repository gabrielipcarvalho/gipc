// Package middleware holds the core HTTP middleware: recover, request-id, access logging,
// CORS, and the per-client rate limiter (ratelimit.go). All stdlib.
package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"
)

type ctxKey int

const requestIDKey ctxKey = 0

// Chain composes middlewares so Chain(a, b, c)(h) executes a → b → c → h.
func Chain(mw ...func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(h http.Handler) http.Handler {
		for i := len(mw) - 1; i >= 0; i-- {
			h = mw[i](h)
		}
		return h
	}
}

// IsHealthPath reports whether p is a liveness/readiness endpoint — exempt from the rate limiter
// (kubelet probes carry no CF-Connecting-IP → would share a node-IP bucket and could 429 into a
// CrashLoop) and from the access log (probe noise).
func IsHealthPath(p string) bool {
	return p == "/api/healthz" || p == "/api/readyz"
}

// Recover turns a handler panic into a 500 + error log instead of a dropped connection.
func Recover(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					log.Error("panic recovered", "panic", v, "path", r.URL.Path, "request_id", RequestID(r.Context()))
					http.Error(w, "internal error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// RequestIDMiddleware attaches a short random request id to the context + X-Request-Id header.
func RequestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := newID()
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

// RequestID returns the request id from ctx, or "" if absent.
func RequestID(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

func newID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "req"
	}
	return hex.EncodeToString(b[:])
}

// statusRecorder captures the response status for the access log.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

// Flush + Unwrap forward streaming/hijack through the wrapper so P4's SSE handler
// (w.(http.Flusher) / http.ResponseController) works even behind the access-log middleware.
func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// Logging emits one structured access-log line per request.
func Logging(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			if IsHealthPath(r.URL.Path) {
				return // no access-log noise for kubelet probes
			}
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			log.Info("request",
				"method", r.Method, "path", r.URL.Path, "status", rec.status,
				"dur_ms", time.Since(start).Milliseconds(),
				"ip", ClientIP(r), "request_id", RequestID(r.Context()))
		})
	}
}

// CORS locks cross-origin access to `allowed`. A request carrying a DIFFERENT Origin is rejected
// 403; requests with no Origin (same-origin, server-side fetch, curl) pass through untouched.
func CORS(allowed string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Vary", "Origin") // always — a shared cache must not serve a no-Origin response to a browser
			if origin := r.Header.Get("Origin"); origin != "" {
				if origin != allowed {
					http.Error(w, "forbidden origin", http.StatusForbidden)
					return
				}
				w.Header().Set("Access-Control-Allow-Origin", allowed)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
