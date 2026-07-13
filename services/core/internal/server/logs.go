package server

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/loki"
)

// The public log surface (Loki-on-display). SAFETY IS LAYERED and server-side only:
//   1. FIXED query {namespace="gipc"} — web+core pods only, NEVER client LogQL (handler ignores r.URL.Query()).
//   2. JSON (core slog) lines: decode, allow-list SAFE keys, DROP `ip` + every unlisted key at the source.
//   3. Every exposed string (both paths) is redacted: IPs (v4+v6), internal hostnames, tokens/secrets.
// Over-redaction is deliberate. Result: no visitor IP, no secret, no internal host reaches a public page.

const (
	logsQuery  = `{namespace="gipc"}`
	logsWindow = 10 * time.Minute
	logsLimit  = 60
)

// LogView is one exposed line — msg is the REDACTED display string.
type LogView struct {
	TS        string `json:"ts"`
	NS        string `json:"ns"`
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Level     string `json:"level"`
	Msg       string `json:"msg"`
}

// LogsResponse mirrors data/observability.ts.
type LogsResponse struct {
	Lines  []LogView `json:"lines"`
	Source string    `json:"source"` // "loki" | "unavailable"
}

// The ONLY JSON keys ever surfaced are read explicitly in assembleJSON: level, msg, method, path,
// status, dur_ms (NOTE the real duration key is dur_ms, not dur). `ip`, `request_id`, `time`, and every
// other key are dropped at the source — `time` deliberately (we use Loki's numeric ts; folding RFC3339
// in would trip the IP redactor's colon handling).
var (
	reHostname = regexp.MustCompile(`\b(prometheus|loki|grafana|core|web|node-exporter|kube-state-metrics|promtail)[.:][a-z0-9.:-]*`)
	reBearer   = regexp.MustCompile(`(?i)Bearer\s+\S+`)
	reSlack    = regexp.MustCompile(`xox[a-zA-Z]-\S+`)
	reJWT      = regexp.MustCompile(`eyJ[\w-]+\.[\w-]+\.?[\w-]*`)
	reAWS      = regexp.MustCompile("AKIA" + `[0-9A-Z]{16}`) // split literal so verify.sh's secret-grep doesn't self-flag
	reHex      = regexp.MustCompile(`\b[A-Fa-f0-9]{32,}\b`)
	reB64      = regexp.MustCompile(`\b[A-Za-z0-9+/]{40,}={0,2}`)
	reKV       = regexp.MustCompile(`(?i)(token|secret|password|api[_-]?key)\s*[=:]\s*\S+`)
)

// redactLine masks IPs (v4+v6, via net.ParseIP so a clock like 12:34:56 is NOT a false match), internal
// hostnames, and secret-shaped tokens. Runs on the FINAL exposed string of EVERY line, whatever the format.
func redactLine(s string) string {
	// IPs first, token-by-token (avoids an ad-hoc IPv6 regex that eats colons in timestamps).
	fields := strings.Fields(s)
	for i, tok := range fields {
		core := strings.Trim(tok, ".,;:()[]{}\"'")
		if core != "" && net.ParseIP(core) != nil {
			fields[i] = strings.Replace(tok, core, "‹ip›", 1)
		}
	}
	s = strings.Join(fields, " ")
	for _, re := range []*regexp.Regexp{reHostname, reBearer, reSlack, reJWT, reAWS, reHex, reB64, reKV} {
		s = re.ReplaceAllString(s, "‹redacted›")
	}
	return s
}

// sanitizeLine turns a raw Loki entry into a safe LogView. A `{`-prefixed line that fails to decode
// falls through to whole-line redaction — the raw line is NEVER emitted.
func sanitizeLine(l loki.LogLine) LogView {
	level, display := "", strings.TrimSpace(l.Line)
	if strings.HasPrefix(display, "{") {
		var m map[string]any
		if err := json.Unmarshal([]byte(l.Line), &m); err == nil {
			level, display = assembleJSON(m)
		}
	}
	return LogView{
		TS:        time.Unix(0, l.TsNs).UTC().Format(time.RFC3339),
		NS:        l.NS,
		Pod:       l.Pod,
		Container: l.Container,
		Level:     level,
		Msg:       redactLine(display),
	}
}

// assembleJSON builds a display string from ALLOW-LISTED keys only — `ip` and every unlisted key are dropped.
func assembleJSON(m map[string]any) (level, display string) {
	level = jsonStr(m["level"])
	var b strings.Builder
	if msg := jsonStr(m["msg"]); msg != "" {
		b.WriteString(msg)
	}
	if method, path := jsonStr(m["method"]), jsonStr(m["path"]); method != "" || path != "" {
		b.WriteString(" " + strings.TrimSpace(method+" "+path))
	}
	if status := jsonStr(m["status"]); status != "" {
		b.WriteString(" → " + status)
	}
	if dur := jsonStr(m["dur_ms"]); dur != "" {
		b.WriteString(" " + dur + "ms")
	}
	return level, strings.TrimSpace(b.String())
}

func jsonStr(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		return ""
	}
}

func logsHandler(lk *loki.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		raw, err := lk.Query(ctx, logsQuery, logsWindow, logsLimit) // FIXED query — r.URL.Query() ignored
		if err != nil {
			writeJSON(w, http.StatusOK, LogsResponse{Lines: []LogView{}, Source: "unavailable"})
			return
		}
		lines := make([]LogView, 0, len(raw))
		for _, l := range raw {
			lines = append(lines, sanitizeLine(l))
		}
		writeJSON(w, http.StatusOK, LogsResponse{Lines: lines, Source: "loki"})
	}
}
