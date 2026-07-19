package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

// Sprint M P3 — the API-playground's demo-token + pagination surface (/api/lab/demo/*).
//
// SAFE-BY-CONSTRUCTION: the demo token gates ONLY the static synthetic `demoEvents` slice — there is zero
// real capability, real data, PII, exec, DB, or cluster reach behind it. It is deliberately NOT real user
// auth (the site is auth-free); it exists to demonstrate an honest auth-header + 401/429 flow and real
// cursor pagination over a clearly-labeled synthetic dataset (the same honesty posture as the Lab DB
// explorer's synthetic postgres). The signing key is minted per-process from crypto/rand — never from env
// — so tokens are genuinely ephemeral (they die on restart, plus a short TTL) and no secret is ever
// configured or returned.

// demoEvent is one synthetic demo record. The Note self-labels it as not-real-data.
type demoEvent struct {
	ID   int    `json:"id"`
	Ref  string `json:"ref"`
	Kind string `json:"kind"`
	Note string `json:"note"`
	TS   string `json:"ts"`
}

// demoEventsPage is the paginated response. NextCursor is a *string so it marshals to JSON `null` (never
// "") when there is no next page — the web client hides "Load more" exactly on null. Plain tag (no
// omitempty) so nil emits `null` rather than being omitted.
type demoEventsPage struct {
	Items      []demoEvent `json:"items"`
	NextCursor *string     `json:"nextCursor"`
	Total      int         `json:"total"`
	Limit      int         `json:"limit"`
}

// buildDemoEvents returns a fixed 40-record synthetic dataset. Deterministic — the timestamps derive from a
// constant base (never time.Now), so the corpus is byte-stable across calls and process lifetimes.
func buildDemoEvents() []demoEvent {
	kinds := []string{"deploy", "scale", "probe", "config", "rollback"}
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	out := make([]demoEvent, 40)
	for i := range out {
		out[i] = demoEvent{
			ID:   i + 1,
			Ref:  fmt.Sprintf("evt-%04d", i+1),
			Kind: kinds[i%len(kinds)],
			Note: "synthetic demo record — not real platform data",
			TS:   base.Add(time.Duration(i) * time.Minute).Format(time.RFC3339),
		}
	}
	return out
}

var demoEvents = buildDemoEvents()

// demoTokenSigner mints + verifies ephemeral HMAC-SHA256 demo tokens. Token form: "exp.nonce.hextag" where
// tag = HMAC(key, "exp.nonce"). The key is a per-process 32-byte crypto/rand secret.
type demoTokenSigner struct {
	key []byte
	ttl time.Duration
}

// newDemoTokenSigner mints the per-process signing key. A crypto/rand failure (near-unreachable on Linux)
// returns an error; the caller then sets the signer nil and both handlers degrade to 503.
func newDemoTokenSigner(ttl time.Duration) (*demoTokenSigner, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	return &demoTokenSigner{key: key, ttl: ttl}, nil
}

func (s *demoTokenSigner) sign(msg string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(msg))
	return hex.EncodeToString(m.Sum(nil))
}

// mint returns a token valid until now+ttl. The nonce only adds uniqueness; a zero nonce (rand failure) is
// still a valid HMAC-bound token, so the read is best-effort.
func (s *demoTokenSigner) mint(now time.Time) (token string, exp int64) {
	exp = now.Add(s.ttl).Unix()
	nonceB := make([]byte, 8)
	_, _ = rand.Read(nonceB)
	msg := strconv.FormatInt(exp, 10) + "." + hex.EncodeToString(nonceB)
	return msg + "." + s.sign(msg), exp
}

// verify reports whether token is a well-signed, unexpired demo token. The constant-time HMAC compare runs
// FIRST (no validity/timing oracle); the exp parse is reached only after the tag matches and never panics
// on a non-integer exp (returns false).
func (s *demoTokenSigner) verify(token string, now time.Time) bool {
	if len(token) > 512 {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	msg := parts[0] + "." + parts[1]
	if !hmac.Equal([]byte(parts[2]), []byte(s.sign(msg))) {
		return false
	}
	exp, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return false
	}
	return now.Unix() <= exp
}

// demoTokenFromRequest reads the demo token — Authorization: Bearer first, then X-Demo-Token.
func demoTokenFromRequest(r *http.Request) string {
	if a := r.Header.Get("Authorization"); strings.HasPrefix(a, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(a, "Bearer "))
	}
	return strings.TrimSpace(r.Header.Get("X-Demo-Token"))
}

// demoTokenHandler mints an ephemeral demo token. LabEnabled-gated + 503 when the signer failed to init.
func demoTokenHandler(cfg config.Config, signer *demoTokenSigner) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		if !cfg.LabEnabled || signer == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		token, exp := signer.mint(time.Now())
		writeJSON(w, http.StatusOK, map[string]any{
			"token":     token,
			"expiresAt": time.Unix(exp, 0).UTC().Format(time.RFC3339),
			"tokenType": "demo",
			"note":      fmt.Sprintf("ephemeral demo key — not real auth; expires in ~%d min", int(cfg.DemoTokenTTL.Minutes())),
		})
	}
}

// demoEventsHandler serves the demo-token-gated, cursor-paginated synthetic dataset. LabEnabled + signer
// gated (503); missing/invalid/expired token → 401; bad limit/cursor → 400 / clamped.
func demoEventsHandler(cfg config.Config, signer *demoTokenSigner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !cfg.LabEnabled || signer == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		if !signer.verify(demoTokenFromRequest(r), time.Now()) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "invalid or missing demo token",
				"hint":  "POST /api/lab/demo/token to mint one",
			})
			return
		}

		total := len(demoEvents)
		q := r.URL.Query()

		// limit: missing / non-numeric / <=0 → default 10; a valid positive value → clamp [1,25]. The
		// explicit n>0 gate is load-bearing: atoiOr("0")+clamp would collapse limit=0 to 1, not 10.
		limit := 10
		if s := q.Get("limit"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 {
				limit = clamp(n, 1, 25)
			}
		}

		// cursor: opaque base64url(offset). Length-capped BEFORE decode; decoded offset validated
		// 0 <= off <= total (== total is a valid "past the end" cursor → empty page).
		off := 0
		if c := q.Get("cursor"); c != "" {
			if len(c) > 32 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad cursor"})
				return
			}
			b, err := base64.RawURLEncoding.DecodeString(c)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad cursor"})
				return
			}
			n, err := strconv.Atoi(string(b))
			if err != nil || n < 0 || n > total {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad cursor"})
				return
			}
			off = n
		}

		// clamp the high bound — NEVER slice past len. off<=total and limit>=1, so off<=end<=total=len.
		end := off + limit
		if end > total {
			end = total
		}
		page := demoEvents[off:end]

		var nextCursor *string
		if end < total {
			c := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(end)))
			nextCursor = &c
		}

		writeJSON(w, http.StatusOK, demoEventsPage{Items: page, NextCursor: nextCursor, Total: total, Limit: limit})
	}
}
