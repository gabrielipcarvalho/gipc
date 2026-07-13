// Package config loads the core service configuration from the environment (12-factor).
// No secrets live here — the webhook HMAC (P5) and any creds come from k8s Secrets at that time.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config is the resolved runtime configuration.
type Config struct {
	Port            string        // HTTP listen port (default 8080)
	CORSOrigin      string        // allowed Origin for /api/* (default https://gipc.dev)
	RateLimitRPS    float64       // per-client token-bucket refill rate (default 10)
	RateLimitBurst  int           // per-client bucket size (default 20)
	PrometheusURL   string        // Prometheus base URL (used from P3; default in-cluster svc)
	LokiURL         string        // Loki base URL (P6 log surface; default in-cluster svc)
	ShutdownTimeout time.Duration // graceful shutdown budget (< pod terminationGracePeriod)
	StreamInterval  time.Duration // SSE metric tick cadence (P4)
	MaxStreams      int           // concurrent SSE connection cap (P4)
	DeployHookKey   string        // HMAC key for POST /api/hooks/deploy (P5; empty ⇒ endpoint 503)
}

// Load reads the environment and applies defaults. It never returns an error today, but keeps the
// (Config, error) shape so future required/validated fields can fail fast.
func Load() (Config, error) {
	return Config{
		Port:            env("PORT", "8080"),
		CORSOrigin:      env("CORS_ORIGIN", "https://gipc.dev"),
		RateLimitRPS:    envFloat("RATE_LIMIT_RPS", 10),
		RateLimitBurst:  envInt("RATE_LIMIT_BURST", 20),
		PrometheusURL:   env("PROMETHEUS_URL", "http://prometheus.observability:9090"),
		LokiURL:         env("LOKI_URL", "http://loki.observability:3100"),
		ShutdownTimeout: envDuration("SHUTDOWN_TIMEOUT", 25*time.Second),
		StreamInterval:  envDuration("STREAM_INTERVAL", 5*time.Second),
		MaxStreams:      envInt("MAX_STREAMS", 64),
		DeployHookKey:   env("DEPLOY_HOOK_KEY", ""),
	}, nil
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
