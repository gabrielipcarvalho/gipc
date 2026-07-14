package server

import (
	"context"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"sync"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/k8s"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/promql"
)

// podKiller is the narrow slice of the k8s client the chaos handlers need. *k8s.Client satisfies it; tests
// inject a fake — so no test seam leaks into the prod k8s package. An untyped-nil podKiller (Lab disabled)
// makes the `killer == nil` guard fire → honest 503.
type podKiller interface {
	ListPods(ctx context.Context, selector string) ([]k8s.Pod, error)
	DeletePod(ctx context.Context, name string) error
}

// chaosKillHandler deletes a random Running chaos-target pod in the demo namespace. Blast radius is bounded
// by the namespace-fixed, name-validated client + the demo-only RBAC. No request body is read.
func chaosKillHandler(killer podKiller, cfg config.Config, log *slog.Logger, labHub *hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if killer == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()

		pods, err := killer.ListPods(ctx, cfg.ChaosTargetSelector)
		if err != nil {
			log.Warn("chaos_list_failed", "err", err) // client already strips the token from err text
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "cluster unavailable"})
			return
		}
		running := make([]k8s.Pod, 0, len(pods))
		for _, p := range pods {
			if p.Phase == "Running" {
				running = append(running, p)
			}
		}
		if len(running) == 0 {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "no running target pods"})
			return
		}
		target := running[rand.IntN(len(running))]
		if err := killer.DeletePod(ctx, target.Name); err != nil {
			log.Warn("chaos_kill_failed", "target", target.Name, "err", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "kill failed"})
			return
		}
		log.Info("chaos_kill", "target", target.Name) // audit: pod name only — no ip, no secret, no token
		publishLabEvent(labHub, "chaos", "killed "+target.Name)
		writeJSON(w, http.StatusOK, map[string]string{
			"killed": target.Name,
			"at":     time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// ChaosStatus is the self-heal view. Desired/Ready are *float64 so a missing metric renders as null (honest).
type ChaosStatus struct {
	Desired *float64  `json:"desired"`
	Ready   *float64  `json:"ready"`
	Pods    []k8s.Pod `json:"pods"`
}

// chaosStatusHandler reports replica health from kube-state-metrics (Prometheus) + per-pod detail. Read-only,
// always graceful.
func chaosStatusHandler(prom *promql.Client, killer podKiller, cfg config.Config) http.HandlerFunc {
	desiredQL := `kube_deployment_status_replicas{namespace="demo",deployment="chaos-target"}`
	readyQL := `kube_deployment_status_replicas_available{namespace="demo",deployment="chaos-target"}`
	return func(w http.ResponseWriter, r *http.Request) {
		var wg sync.WaitGroup
		var desired, ready *float64
		for i, ql := range []string{desiredQL, readyQL} {
			wg.Add(1)
			go func(i int, ql string) {
				defer wg.Done()
				qctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
				defer cancel()
				if v, ok, _ := prom.Query(qctx, ql); ok {
					vv := v
					if i == 0 {
						desired = &vv
					} else {
						ready = &vv
					}
				}
			}(i, ql)
		}
		wg.Wait()

		pods := []k8s.Pod{}
		if killer != nil {
			pctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			if p, err := killer.ListPods(pctx, cfg.ChaosTargetSelector); err == nil {
				pods = p
			}
			cancel()
		}
		writeJSON(w, http.StatusOK, ChaosStatus{Desired: desired, Ready: ready, Pods: pods})
	}
}
