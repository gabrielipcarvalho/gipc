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
	WebURL          string        // web app base URL (P7 uptime probe target; default in-cluster svc)
	UptimeInterval  time.Duration // P7 uptime probe cadence
	ShutdownTimeout time.Duration // graceful shutdown budget (< pod terminationGracePeriod)
	StreamInterval  time.Duration // SSE metric tick cadence (P4)
	MaxStreams      int           // concurrent SSE connection cap (P4)
	DeployHookKey   string        // HMAC key for POST /api/hooks/deploy (P5; empty ⇒ endpoint 503)
	// M5 Lab
	LabEnabled          bool    // master switch — false ⇒ lab handlers 503 (chaos killer stays nil)
	LabNamespace        string  // the namespace the LAB mutates (default demo) — never widened
	TopologyEnabled     bool    // /api/topology reads (multi-ns, read-only); independent of the Lab
	ChaosTargetSelector string  // label selector for the chaos target (default app=chaos-target)
	ChaosRPS            float64 // chaos-kill per-IP cooldown refill (default 0.1 ⇒ ~1 kill / 10s)
	ChaosBurst          int     // chaos-kill per-IP bucket (default 1 ⇒ single-flight)
	// load test — the target is FIXED (never request-derived); caps are CODE-CLAMPED so no env can exceed them
	LoadTargetURL      string        // the ONLY load target (default the demo echo)
	LoadMaxConcurrency int           // absolute ceiling 50
	LoadMaxSeconds     int           // absolute ceiling 10
	LoadMaxRuns        int           // absolute ceiling 4 (global concurrent runs)
	LoadRPS            float64       // per-IP cooldown refill (default 0.2 ⇒ ~1 run / 5s)
	LoadBurst          int           // per-IP bucket (default 1)
	LabEventHeartbeat  time.Duration // /api/lab/events heartbeat cadence (default 10s)
	// Sprint H Lab DB explorer — the DSN comes from an optional k8s Secret; empty ⇒ handlers 503
	DemoDBURL  string  // demo-ns toy postgres DSN (SELECT-only role; NEVER the ns-data prod DB)
	DBRunRPS   float64 // /api/lab/db/run per-IP cooldown refill (default 0.5 ⇒ ~1 run / 2s)
	DBRunBurst int     // /api/lab/db/run per-IP bucket (default 2)
	// Sprint M safe sandbox shell — /api/lab/shell (in-memory, no exec; cheaper than the others)
	ShellRPS   float64 // per-IP refill (default 2 ⇒ ~2 cmds/s)
	ShellBurst int     // per-IP bucket (default 8)
	// Sprint M P3 — API-playground demo-token + pagination (/api/lab/demo/*). The HMAC signing key is
	// minted per-process from crypto/rand (never env) — no secret to configure; tokens die on restart.
	DemoTokenTTL time.Duration // ephemeral demo-token lifetime (default 5m — short)
	DemoRPS      float64       // /api/lab/demo/* per-IP refill (default 1)
	DemoBurst    int           // /api/lab/demo/* per-IP bucket (default 5; raw ⇒ DEMO_BURST=0 disables, for the wiring test)
}

// clampInt bounds v to [1, hi] — used so a misconfigured env cap can neither exceed the invariant nor drop below 1.
func clampInt(v, hi int) int {
	if v < 1 {
		return 1
	}
	if v > hi {
		return hi
	}
	return v
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
		WebURL:          env("WEB_URL", "http://web:80"),
		UptimeInterval:  envDuration("UPTIME_INTERVAL", 30*time.Second),
		ShutdownTimeout: envDuration("SHUTDOWN_TIMEOUT", 25*time.Second),
		StreamInterval:  envDuration("STREAM_INTERVAL", 5*time.Second),
		MaxStreams:      envInt("MAX_STREAMS", 64),
		DeployHookKey:   env("DEPLOY_HOOK_KEY", ""),

		LabEnabled:          envBool("LAB_ENABLED", false),
		LabNamespace:        env("LAB_NAMESPACE", "demo"),
		TopologyEnabled:     envBool("TOPOLOGY_ENABLED", true),
		ChaosTargetSelector: env("CHAOS_TARGET_SELECTOR", "app=chaos-target"),
		ChaosRPS:            envFloat("CHAOS_RPS", 0.1),
		ChaosBurst:          envInt("CHAOS_BURST", 1),

		LoadTargetURL:      env("LOAD_TARGET_URL", "http://chaos-target.demo"),
		LoadMaxConcurrency: clampInt(envInt("LOAD_MAX_CONCURRENCY", 50), 50),
		LoadMaxSeconds:     clampInt(envInt("LOAD_MAX_SECONDS", 10), 10),
		LoadMaxRuns:        clampInt(envInt("LOAD_MAX_RUNS", 4), 4),
		LoadRPS:            envFloat("LOAD_RPS", 0.2),
		LoadBurst:          envInt("LOAD_BURST", 1),
		LabEventHeartbeat:  envDuration("LAB_EVENT_HEARTBEAT", 10*time.Second),

		DemoDBURL:  env("DEMO_DB_URL", ""),
		DBRunRPS:   envFloat("DB_RPS", 0.5),
		DBRunBurst: envInt("DB_BURST", 2),
		ShellRPS:   envFloat("SHELL_RPS", 2),
		ShellBurst: envInt("SHELL_BURST", 8),

		DemoTokenTTL: envDuration("DEMO_TOKEN_TTL", 5*time.Minute),
		DemoRPS:      envFloat("DEMO_RPS", 1),
		DemoBurst:    envInt("DEMO_BURST", 5),
	}, nil
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
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
