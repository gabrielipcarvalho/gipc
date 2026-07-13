package server

import "sync"

// sseMsg is a named SSE event to broadcast to all connected streams.
type sseMsg struct {
	event string
	data  []byte
}

// hub fans one published message out to every subscribed stream. Non-blocking: a slow/full subscriber
// drops the message rather than blocking the publisher (the webhook path must never stall).
type hub struct {
	mu   sync.Mutex
	subs map[chan sseMsg]struct{}
}

func newHub() *hub {
	return &hub{subs: make(map[chan sseMsg]struct{})}
}

func (h *hub) subscribe() chan sseMsg {
	ch := make(chan sseMsg, 8)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// unsubscribe removes the channel from the map THEN closes it, both under mu. Called only from the
// stream handler's own defer (after its select loop exits), so nothing is selecting on ch when it closes.
func (h *hub) unsubscribe(ch chan sseMsg) {
	h.mu.Lock()
	if _, ok := h.subs[ch]; ok {
		delete(h.subs, ch)
		close(ch)
	}
	h.mu.Unlock()
}

// publish holds mu while ranging subs with non-blocking sends — never blocks under the lock, so it
// cannot race a concurrent unsubscribe into a send-on-closed panic.
func (h *hub) publish(m sseMsg) {
	h.mu.Lock()
	for ch := range h.subs {
		select {
		case ch <- m:
		default: // slow/full subscriber — drop, never block
		}
	}
	h.mu.Unlock()
}
