package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// DeployEvent mirrors apps/web data/deploys.ts + the signed webhook body EXACTLY (lowercase keys).
type DeployEvent struct {
	SHA     string `json:"sha"`
	Subject string `json:"subject"`
	Stage   string `json:"stage"`  // commit|build|test|deploy|released
	Status  string `json:"status"` // start|success|failure
	TS      string `json:"ts"`
}

const maxDeploys = 24

// deployStore is a bounded in-memory ring of recent deploy events, idempotent + replay-safe per (sha,stage).
// In-memory only (accepted): a core self-deploy loses it; the feed self-heals on the next event.
type deployStore struct {
	mu     sync.Mutex
	events []DeployEvent
}

func newDeployStore() *deployStore { return &deployStore{} }

// add returns true if the feed changed (caller then broadcasts).
func (s *deployStore) add(ev DeployEvent) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.events {
		if s.events[i].SHA == ev.SHA && s.events[i].Stage == ev.Stage {
			if ev.TS < s.events[i].TS {
				return false // strictly-older replay — must not regress the stage
			}
			if s.events[i].Status == ev.Status {
				return false // exact replay / no real change
			}
			s.events[i].Status = ev.Status
			s.events[i].TS = ev.TS
			if ev.Subject != "" {
				s.events[i].Subject = ev.Subject
			}
			return true
		}
	}
	s.events = append(s.events, ev)
	if len(s.events) > maxDeploys {
		s.events = s.events[len(s.events)-maxDeploys:]
	}
	return true
}

// recent returns the events newest-first.
func (s *deployStore) recent() []DeployEvent {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]DeployEvent, len(s.events))
	for i, e := range s.events {
		out[len(s.events)-1-i] = e
	}
	return out
}

// deployHookHandler verifies the HMAC-signed webhook, stores the event, and broadcasts it over SSE.
// Fail-closed: 503 if the secret isn't configured (never accepts unsigned), 401 on a bad/missing signature.
func deployHookHandler(secret []byte, store *deployStore, h *hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if len(secret) == 0 {
			http.Error(w, "deploy hook not configured", http.StatusServiceUnavailable)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil {
			http.Error(w, "bad body", http.StatusBadRequest)
			return
		}
		got := strings.TrimPrefix(r.Header.Get("X-Signature"), "sha256=")
		mac := hmac.New(sha256.New, secret)
		mac.Write(body)
		want := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(got), []byte(want)) {
			http.Error(w, "bad signature", http.StatusUnauthorized)
			return
		}
		var ev DeployEvent
		if err := json.Unmarshal(body, &ev); err != nil || ev.SHA == "" || ev.Stage == "" {
			http.Error(w, "bad event", http.StatusBadRequest)
			return
		}
		if ev.TS == "" {
			ev.TS = time.Now().UTC().Format(time.RFC3339)
		}
		if store.add(ev) {
			if b, err := json.Marshal(ev); err == nil {
				h.publish(sseMsg{event: "deploy", data: b})
			}
		}
		w.WriteHeader(http.StatusAccepted)
	}
}

func deploysHandler(store *deployStore) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, store.recent())
	}
}
