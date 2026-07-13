package server

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/middleware"
)

// The per-visitor request trace: the REAL path THIS request took (edge → tunnel → Caddy → core), from
// Cloudflare headers + the measured core-handler time. It NEVER echoes the visitor IP (colo/country only —
// the visitor's own context, not PII we store) and exposes no internal pod IPs. Only "core handler" ms is
// measured; upstream hops are honestly unmeasured (ms:null). CF headers are attacker-settable ONLY off the
// Cloudflare path (LAN NodePort); impact is self-reflected + React-escaped, so we just format-validate.

// TraceHop is one leg of the path. Ms is nil when we can't measure that hop (honest — not a fake number).
type TraceHop struct {
	Name     string   `json:"name"`
	Detail   string   `json:"detail"`
	Ms       *float64 `json:"ms"`
	Measured bool     `json:"measured"`
}

type TraceEdge struct {
	Colo    string `json:"colo"`
	Country string `json:"country"`
}

type TraceResponse struct {
	Hops      []TraceHop `json:"hops"`
	Edge      TraceEdge  `json:"edge"`
	RequestID string     `json:"requestId"`
}

var (
	reColo    = regexp.MustCompile(`^[A-Z]{3}$`)
	reCountry = regexp.MustCompile(`^[A-Z]{2}$`)
)

// cfColo extracts the 3-letter colo from CF-Ray ("<id>-SYD"); "" if absent/malformed.
func cfColo(ray string) string {
	if i := strings.LastIndexByte(ray, '-'); i >= 0 {
		if colo := ray[i+1:]; reColo.MatchString(colo) {
			return colo
		}
	}
	return ""
}

func cfCountry(cc string) string {
	if reCountry.MatchString(cc) {
		return cc
	}
	return ""
}

func traceHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		colo := cfColo(r.Header.Get("CF-Ray"))
		country := cfCountry(r.Header.Get("CF-IPCountry"))
		edgeDetail := "cloudflare edge"
		if colo != "" {
			edgeDetail = "PoP " + colo
			if country != "" {
				edgeDetail += " · " + country
			}
		}

		coreMs := float64(time.Since(start).Microseconds()) / 1000.0
		hops := []TraceHop{
			{Name: "edge", Detail: edgeDetail, Ms: nil, Measured: false},
			{Name: "tunnel", Detail: "cloudflared → k3s", Ms: nil, Measured: false},
			{Name: "caddy", Detail: "reverse proxy", Ms: nil, Measured: false},
			{Name: "core", Detail: "gipc-core handler", Ms: &coreMs, Measured: true},
		}
		writeJSON(w, http.StatusOK, TraceResponse{
			Hops:      hops,
			Edge:      TraceEdge{Colo: colo, Country: country},
			RequestID: middleware.RequestID(r.Context()),
		})
	}
}
