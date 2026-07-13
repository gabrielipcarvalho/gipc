package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func sign(secret, body string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(body))
	return "sha256=" + hex.EncodeToString(m.Sum(nil))
}

func post(t *testing.T, h http.HandlerFunc, body, sig string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/hooks/deploy", strings.NewReader(body))
	if sig != "" {
		req.Header.Set("X-Signature", sig)
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

func TestDeployHookGoodSig(t *testing.T) {
	store := newDeployStore()
	h := deployHookHandler([]byte("k"), store, newHub())
	body := `{"sha":"abc","subject":"x","stage":"released","status":"success","ts":"2026-07-13T00:00:00Z"}`
	if rec := post(t, h, body, sign("k", body)); rec.Code != http.StatusAccepted {
		t.Fatalf("good sig = %d, want 202", rec.Code)
	}
	if len(store.recent()) != 1 {
		t.Fatalf("want 1 stored, got %d", len(store.recent()))
	}
}

func TestDeployHookBadSig(t *testing.T) {
	store := newDeployStore()
	h := deployHookHandler([]byte("k"), store, newHub())
	body := `{"sha":"abc","stage":"released","status":"success","ts":"2026-07-13T00:00:00Z"}`
	if rec := post(t, h, body, "sha256=deadbeef"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad sig = %d, want 401", rec.Code)
	}
	if len(store.recent()) != 0 {
		t.Fatal("bad sig must not store")
	}
}

func TestDeployHookUnconfigured(t *testing.T) {
	if rec := post(t, deployHookHandler(nil, newDeployStore(), newHub()), `{}`, ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured = %d, want 503", rec.Code)
	}
}

func TestDeployHookBadJSON(t *testing.T) {
	h := deployHookHandler([]byte("k"), newDeployStore(), newHub())
	body := `{"stage":"released"}` // missing sha
	if rec := post(t, h, body, sign("k", body)); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing sha = %d, want 400", rec.Code)
	}
}

func TestStoreIdempotentAndReplaySafe(t *testing.T) {
	s := newDeployStore()
	e1 := DeployEvent{SHA: "a", Stage: "build", Status: "start", TS: "2026-07-13T00:00:01Z"}
	e2 := DeployEvent{SHA: "a", Stage: "build", Status: "success", TS: "2026-07-13T00:00:02Z"}
	if !s.add(e1) {
		t.Fatal("first add should change")
	}
	if !s.add(e2) {
		t.Fatal("forward transition should change")
	}
	if s.add(e2) {
		t.Fatal("exact replay should not change")
	}
	if s.add(e1) {
		t.Fatal("stale replay (older ts) should not change / regress")
	}
	got := s.recent()
	if len(got) != 1 || got[0].Status != "success" {
		t.Fatalf("want 1 entry status=success, got %+v", got)
	}
}

func TestHubBroadcastAndNonBlocking(t *testing.T) {
	h := newHub()
	sub := h.subscribe()
	h.publish(sseMsg{event: "deploy", data: []byte("x")})
	select {
	case m := <-sub:
		if m.event != "deploy" || string(m.data) != "x" {
			t.Fatalf("got %+v", m)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber did not receive")
	}
	// overflow the buffer — publish must not block (drops)
	for i := 0; i < 20; i++ {
		h.publish(sseMsg{event: "deploy", data: []byte("y")})
	}
	h.unsubscribe(sub)
}
