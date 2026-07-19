package server

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
)

func demoCfg() config.Config { return config.Config{LabEnabled: true, DemoTokenTTL: 5 * time.Minute} }

func enc(n int) string { return base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(n))) }

// serveDemo drives a handler in isolation (no limiter/global chain).
func serveDemo(h http.HandlerFunc, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func bearer(tok string) map[string]string { return map[string]string{"Authorization": "Bearer " + tok} }

func mustSigner(t *testing.T, ttl time.Duration) *demoTokenSigner {
	t.Helper()
	s, err := newDemoTokenSigner(ttl)
	if err != nil {
		t.Fatalf("newDemoTokenSigner: %v", err)
	}
	return s
}

// --- token signer ---

func TestDemoTokenMintVerifyRoundtrip(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	if !s.verify(tok, time.Now()) {
		t.Fatal("freshly minted token must verify")
	}
}

func TestDemoEventsRequiresToken(t *testing.T) {
	rec := serveDemo(demoEventsHandler(demoCfg(), mustSigner(t, time.Minute)), "GET", "/api/lab/demo/events", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no token: code=%d want 401", rec.Code)
	}
}

func TestDemoTokenHeaderPrecedence(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	// the X-Demo-Token fallback (no Authorization) must be accepted
	if rec := serveDemo(demoEventsHandler(demoCfg(), s), "GET", "/api/lab/demo/events?limit=5", map[string]string{"X-Demo-Token": tok}); rec.Code != http.StatusOK {
		t.Fatalf("X-Demo-Token fallback: code=%d want 200", rec.Code)
	}
	// Authorization: Bearer takes precedence over a garbage X-Demo-Token
	if rec := serveDemo(demoEventsHandler(demoCfg(), s), "GET", "/api/lab/demo/events", map[string]string{"Authorization": "Bearer " + tok, "X-Demo-Token": "garbage"}); rec.Code != http.StatusOK {
		t.Fatalf("Authorization precedence: code=%d want 200", rec.Code)
	}
}

func TestDemoEventsRejectsTamperedToken(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	// flip the last char of the HMAC tag
	last := tok[len(tok)-1]
	flip := byte('a')
	if last == 'a' {
		flip = 'b'
	}
	tampered := tok[:len(tok)-1] + string(flip)
	rec := serveDemo(demoEventsHandler(demoCfg(), s), "GET", "/api/lab/demo/events", bearer(tampered))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("tampered token: code=%d want 401", rec.Code)
	}
}

func TestDemoEventsRejectsExpiredToken(t *testing.T) {
	s := mustSigner(t, -time.Second) // already expired at mint
	tok, _ := s.mint(time.Now())
	rec := serveDemo(demoEventsHandler(demoCfg(), s), "GET", "/api/lab/demo/events", bearer(tok))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expired token: code=%d want 401", rec.Code)
	}
}

func TestDemoEventsRejectsForeignKeyToken(t *testing.T) {
	s1 := mustSigner(t, time.Minute)
	s2 := mustSigner(t, time.Minute) // different random key
	tok, _ := s1.mint(time.Now())
	rec := serveDemo(demoEventsHandler(demoCfg(), s2), "GET", "/api/lab/demo/events", bearer(tok))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("foreign-key token: code=%d want 401", rec.Code)
	}
}

func TestDemoVerifyNonIntegerExpNoPanic(t *testing.T) {
	s := mustSigner(t, time.Minute)
	// a well-formed 3-part token whose exp isn't numeric — must return false, never panic. Build it
	// with a real HMAC over the (bogus) msg so we exercise the post-compare ParseInt path.
	msg := "notanumber.deadbeef"
	tok := msg + "." + s.sign(msg)
	if s.verify(tok, time.Now()) {
		t.Fatal("non-integer exp must not verify")
	}
}

// --- pagination ---

func fetchPage(t *testing.T, h http.HandlerFunc, tok, query string) demoEventsPage {
	t.Helper()
	rec := serveDemo(h, "GET", "/api/lab/demo/events?"+query, bearer(tok))
	if rec.Code != http.StatusOK {
		t.Fatalf("query %q: code=%d want 200 (body=%s)", query, rec.Code, rec.Body.String())
	}
	var pg demoEventsPage
	if err := json.Unmarshal(rec.Body.Bytes(), &pg); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return pg
}

func TestDemoPaginationChain(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	h := demoEventsHandler(demoCfg(), s)

	var got []demoEvent
	cursor, pages := "", 0
	for {
		q := "limit=10"
		if cursor != "" {
			q += "&cursor=" + cursor
		}
		pg := fetchPage(t, h, tok, q)
		if pg.Total != 40 {
			t.Fatalf("total=%d want 40", pg.Total)
		}
		got = append(got, pg.Items...)
		pages++
		if pg.NextCursor == nil {
			break
		}
		cursor = *pg.NextCursor
		if pages > 10 {
			t.Fatal("pagination did not terminate")
		}
	}
	if pages != 4 {
		t.Fatalf("pages=%d want 4", pages)
	}
	if len(got) != 40 {
		t.Fatalf("reassembled=%d want 40", len(got))
	}
	for i := range got {
		if got[i].ID != i+1 { // ordered, no dup, no skip
			t.Fatalf("got[%d].ID=%d want %d", i, got[i].ID, i+1)
		}
	}
}

// TestDemoPaginationPartialLastPage is the QA HIGH regression: limit=25 over 40 → 25 then 15, and the
// partial second page must NOT panic (the unclamped demoEvents[25:50] would have crashed).
func TestDemoPaginationPartialLastPage(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	h := demoEventsHandler(demoCfg(), s)

	p1 := fetchPage(t, h, tok, "limit=25")
	if len(p1.Items) != 25 || p1.NextCursor == nil {
		t.Fatalf("page1: items=%d nextCursor=%v want 25 + non-nil", len(p1.Items), p1.NextCursor)
	}
	p2 := fetchPage(t, h, tok, "limit=25&cursor="+*p1.NextCursor)
	if len(p2.Items) != 15 || p2.NextCursor != nil {
		t.Fatalf("page2: items=%d nextCursor=%v want 15 + nil", len(p2.Items), p2.NextCursor)
	}
	all := append(append([]demoEvent{}, p1.Items...), p2.Items...)
	if len(all) != 40 {
		t.Fatalf("reassembled=%d want 40", len(all))
	}
	for i := range all {
		if all[i].ID != i+1 {
			t.Fatalf("all[%d].ID=%d want %d", i, all[i].ID, i+1)
		}
	}
}

// TestDemoCraftedEndCursor is the QA HIGH regression for a crafted near/at-end cursor + max limit.
func TestDemoCraftedEndCursor(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	h := demoEventsHandler(demoCfg(), s)

	// off == total: empty page, no next, 200 (never a slice-bounds panic → 500).
	atEnd := fetchPage(t, h, tok, "limit=25&cursor="+enc(40))
	if len(atEnd.Items) != 0 || atEnd.NextCursor != nil {
		t.Fatalf("off==total: items=%d nextCursor=%v want 0 + nil", len(atEnd.Items), atEnd.NextCursor)
	}
	// off near end + max limit overshoots len → clamped to a 2-item final page.
	near := fetchPage(t, h, tok, "limit=25&cursor="+enc(38))
	if len(near.Items) != 2 || near.NextCursor != nil {
		t.Fatalf("off=38,limit=25: items=%d nextCursor=%v want 2 + nil", len(near.Items), near.NextCursor)
	}
}

// TestDemoNextCursorIsJSONNull asserts the *string marshals to JSON null (not "") on the last page.
func TestDemoNextCursorIsJSONNull(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	rec := serveDemo(demoEventsHandler(demoCfg(), s), "GET", "/api/lab/demo/events?limit=10&cursor="+enc(30), bearer(tok))
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"nextCursor":null`) {
		t.Fatalf("last-page body must contain \"nextCursor\":null, got %s", rec.Body.String())
	}
}

func TestDemoLimitClamp(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	h := demoEventsHandler(demoCfg(), s)
	cases := []struct {
		query string
		want  int
	}{
		{"limit=0", 10}, // the trap: must default to 10, NOT clamp to 1
		{"limit=abc", 10},
		{"", 10}, // missing
		{"limit=999", 25},
		{"limit=25", 25},
		{"limit=1", 1},
	}
	for _, c := range cases {
		pg := fetchPage(t, h, tok, c.query)
		if pg.Limit != c.want {
			t.Fatalf("query %q: limit=%d want %d", c.query, pg.Limit, c.want)
		}
	}
}

func TestDemoBadCursor400(t *testing.T) {
	s := mustSigner(t, time.Minute)
	tok, _ := s.mint(time.Now())
	h := demoEventsHandler(demoCfg(), s)
	for _, cursor := range []string{"!!!", strings.Repeat("A", 33), enc(41)} { // bad-b64, over-long, out-of-range
		rec := serveDemo(h, "GET", "/api/lab/demo/events?cursor="+cursor, bearer(tok))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("cursor %q: code=%d want 400", cursor, rec.Code)
		}
	}
}

// --- gating / wiring / honesty ---

func TestDemoLabDisabled503(t *testing.T) {
	cfg := config.Config{LabEnabled: false, DemoTokenTTL: time.Minute}
	s := mustSigner(t, time.Minute)
	if rec := serveDemo(demoTokenHandler(cfg, s), "POST", "/api/lab/demo/token", nil); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("token handler disabled: code=%d want 503", rec.Code)
	}
	if rec := serveDemo(demoEventsHandler(cfg, s), "GET", "/api/lab/demo/events", nil); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("events handler disabled: code=%d want 503", rec.Code)
	}
}

// TestDemoNilSigner503 covers the defensive crypto/rand-failure branch (signer==nil) on both handlers.
func TestDemoNilSigner503(t *testing.T) {
	cfg := demoCfg()
	if rec := serveDemo(demoTokenHandler(cfg, nil), "POST", "/api/lab/demo/token", nil); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("nil signer token handler: code=%d want 503", rec.Code)
	}
	if rec := serveDemo(demoEventsHandler(cfg, nil), "GET", "/api/lab/demo/events", nil); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("nil signer events handler: code=%d want 503", rec.Code)
	}
}

// TestDemoLimiterWired proves the per-IP demo limiter is actually on the routes (spec names 401/429).
func TestDemoLimiterWired(t *testing.T) {
	t.Setenv("DEMO_RPS", "0")
	t.Setenv("DEMO_BURST", "0")
	cfg, _ := config.Load()
	h, _ := New(cfg, discardLog(), context.Background())

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/lab/demo/events", nil))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("GET /demo/events with zero-token limiter: code=%d want 429", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/api/lab/demo/token", nil))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("POST /demo/token with zero-token limiter: code=%d want 429", rec.Code)
	}
	// a global-limiter-only route must NOT ride the demo limiter
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/version", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/version must not ride the demo limiter: code=%d", rec.Code)
	}
}

func TestDemoTokenIsDemoLabeled(t *testing.T) {
	s := mustSigner(t, 5*time.Minute)
	rec := serveDemo(demoTokenHandler(demoCfg(), s), "POST", "/api/lab/demo/token", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d want 200", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["tokenType"] != "demo" {
		t.Fatalf("tokenType=%v want demo", body["tokenType"])
	}
	// the signing key must NEVER appear in the response (the token carries only exp.nonce.HMAC-tag)
	if strings.Contains(rec.Body.String(), hex.EncodeToString(s.key)) {
		t.Fatal("signing key leaked in the token response")
	}
}

func TestDemoDatasetDeterministic(t *testing.T) {
	a, b := buildDemoEvents(), buildDemoEvents()
	if len(a) != 40 {
		t.Fatalf("len=%d want 40", len(a))
	}
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatal("buildDemoEvents must be deterministic (no time.Now leakage)")
	}
	if a[0].Ref != "evt-0001" || a[39].Ref != "evt-0040" {
		t.Fatalf("refs: first=%s last=%s", a[0].Ref, a[39].Ref)
	}
}
