package server

import (
	"testing"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/k8s"
)

// The QA-guarded regression: a topology-only client (lab OFF) must NEVER arm the chaos killer.
// Uses a non-nil zero-value client so the gating EXPRESSION itself is what gets tested.
func TestArmingIsPerConsumer(t *testing.T) {
	c := &k8s.Client{}
	if armKiller(false, c) != nil {
		t.Fatal("lab off + client present must NOT arm the killer")
	}
	if armKiller(true, c) == nil {
		t.Fatal("lab on + client present must arm the killer")
	}
	if armKiller(true, nil) != nil {
		t.Fatal("nil client must never arm (typed-nil trap)")
	}
	if armLister(false, c) != nil {
		t.Fatal("topology off must not arm the lister")
	}
	if armLister(true, c) == nil {
		t.Fatal("topology on + client present must arm the lister")
	}
	if armLister(true, nil) != nil {
		t.Fatal("nil client must never arm the lister")
	}
}
