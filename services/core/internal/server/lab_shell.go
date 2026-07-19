package server

import (
	"encoding/json"
	"net/http"

	"github.com/gabrielipcarvalho/gipc/services/core/internal/config"
	"github.com/gabrielipcarvalho/gipc/services/core/internal/shell"
)

// labShellHandler is the thin HTTP edge for the safe sandbox shell. It holds capabilities (it's in package
// server) but passes the pure shell.Execute NOTHING but the raw cmd + cwd strings — no cfg, no db, no
// killer, no k8s. Body is capped BEFORE decode (MaxBytesReader), then post-decode length-bounded. The shell
// itself cannot exec/exfil/reach-anything (see internal/shell: an AST-guarded capability-free package).
func labShellHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !cfg.LabEnabled {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "lab disabled"})
			return
		}
		var req struct {
			Cmd string `json:"cmd"`
			Cwd string `json:"cwd"`
		}
		// cap the streamed read at 2KB BEFORE the decoder can buffer a hostile multi-MB body. Real ASCII
		// input (≤256 cmd + ≤512 cwd) fits; a pathological fully-\u-escaped max payload 400s — fail-closed.
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad request"})
			return
		}
		if len(req.Cmd) > 256 || len(req.Cwd) > 512 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "input too long"})
			return
		}
		res := shell.Execute(req.Cmd, req.Cwd)
		writeJSON(w, http.StatusOK, map[string]any{"output": res.Output, "cwd": res.Cwd, "cleared": res.Cleared})
	}
}
