import type { ArchDiagramData } from "./architecture";

/* Per-project architecture diagrams — REAL facts only, reusing the /infra ArchDiagram engine
   (data/architecture.ts + app/components/ArchDiagram.tsx, unchanged). Every node/edge fact
   below traces to a source line, cited per diagram:
     • nina-nails / seismic-unet / transformer-fin → data/projects.json (that slug's record)
     • gipc-dev → THIS repo's config (.github/workflows/web.yml, data/architecture.ts,
       infra/k8s/web/kustomization.yaml, infra/argocd/application.yaml) — its subject IS this repo.
   drowning-detection has NO diagram on purpose: its shipped output is a systematic-review paper;
   the on-device edge-CV system is in-development PhD work (projects.json:139) — a diagram would be
   speculative (no-fabrication rule). Its card keeps its detail + IEEE DOI link.

   Layout: compact hand-tuned SVG (viewBox user units; text scales with the box, so fit is
   width-independent). Diagram id = slug (unique DOM marker id `${id}-arrow`; ∉ {reqpath,ragpipe}).
   "managed Postgres" (nina supabase sub) is a common-knowledge descriptor of what Supabase is, not
   a project-specific claim. lanes:[] — these compact diagrams don't use tier lanes. */

const H = 46; // node height (architecture.ts NH is module-local, not exported — inline)

export const PROJECT_DIAGRAMS: Record<string, ArchDiagramData> = {
  // ── Nina Nails — booking product. Sources: projects.json:44,51,53,54,56,57,63,64,65 ──
  "nina-nails": {
    id: "nina-nails",
    title: "Nina Nails — booking architecture",
    caption:
      "Full-stack booking product — Next.js / React 19 on Vercel over Supabase, with calendar + email and a three-tier test suite.",
    viewW: 600,
    viewH: 340,
    lanes: [],
    nodes: [
      { id: "client", label: "client", sub: "React 19 UI", x: 24, y: 140, w: 120, h: H, facts: ["The booking flow runs in the browser (React 19)."] },
      { id: "next", label: "Next.js 15", sub: "Vercel", x: 216, y: 140, w: 140, h: H, facts: ["Full-stack app, ~15.1k LOC across 86 commits, deployed on Vercel."] },
      { id: "supabase", label: "Supabase", sub: "managed Postgres", x: 430, y: 44, w: 150, h: H, facts: ["Backing store for the booking data."] },
      { id: "gcal", label: "Google Calendar", sub: "sync", x: 430, y: 140, w: 150, h: H, facts: ["Bookings sync to Google Calendar."] },
      { id: "resend", label: "Resend", sub: "email", x: 430, y: 236, w: 150, h: H, facts: ["Transactional email (Resend)."] },
      { id: "tests", label: "test suite", sub: "3-tier", x: 216, y: 250, w: 140, h: H, facts: ["Three-tier: Vitest + Playwright e2e + axe a11y."] },
    ],
    edges: [
      { id: "n-client-next", from: "client", to: "next", fact: "booking UI (React 19)" },
      { id: "n-next-supabase", from: "next", to: "supabase", fact: "booking data" },
      { id: "n-next-gcal", from: "next", to: "gcal", fact: "calendar sync" },
      { id: "n-next-resend", from: "next", to: "resend", fact: "transactional email" },
      { id: "n-tests-next", from: "tests", to: "next", fact: "Vitest + Playwright + axe" },
    ],
  },

  // ── Seismic inversion (PyTorch U-Net). Sources: projects.json:74,80,83,84,85,88,89,90,91 ──
  "seismic-unet": {
    id: "seismic-unet",
    title: "Seismic U-Net — inversion pipeline",
    caption:
      "Reproducible PyTorch inversion — synthetic seismograms inverted through a differentiable wave simulation and a U-Net.",
    viewW: 560,
    viewH: 340,
    lanes: [],
    nodes: [
      { id: "sim", label: "Deepwave", sub: "differentiable", x: 24, y: 150, w: 140, h: H, facts: ["Differentiable wave simulation generates the data."] },
      { id: "data", label: "seismograms", sub: "2,000 gathers", x: 200, y: 150, w: 150, h: H, facts: ["2,000 synthetic seismograms (shot gathers)."] },
      { id: "unet", label: "U-Net", sub: "12.5M params", x: 390, y: 88, w: 140, h: H, facts: ["12.5M-parameter U-Net inverts the seismograms; functional-core; CUDA / MPS / CPU."] },
      { id: "loss", label: "L1 + SSIM loss", x: 390, y: 210, w: 140, h: H, facts: ["Combined L1 + SSIM loss."] },
      { id: "tests", label: "27 tests", sub: "deterministic", x: 200, y: 268, w: 150, h: H, facts: ["27 deterministic unit tests."] },
    ],
    edges: [
      { id: "s-sim-data", from: "sim", to: "data", fact: "wave sim → 2,000 seismograms" },
      { id: "s-data-unet", from: "data", to: "unet", fact: "input" },
      { id: "s-unet-loss", from: "unet", to: "loss", fact: "prediction vs target", via: [[500, 173]] },
      { id: "s-loss-unet", from: "loss", to: "unet", fact: "backprop (differentiable)", via: [[420, 173]] },
      { id: "s-tests-unet", from: "tests", to: "unet", fact: "27 deterministic tests" },
    ],
  },

  // ── Transformer financial prediction (Master's). Sources: projects.json:99,107,115,116,117,118 ──
  "transformer-fin": {
    id: "transformer-fin",
    title: "Transformer fin — four-adaptor orchestration",
    caption:
      "Master's dissertation — a Node.js orchestrator coordinating four fine-tuned OpenAI GPT adaptors to predict daily S&P 500 (SPY) direction.",
    viewW: 720,
    viewH: 400,
    lanes: [],
    nodes: [
      { id: "data", label: "SPY data", sub: "131 days", x: 20, y: 170, w: 120, h: H, facts: ["Real-world S&P 500 (SPY), 131 trading days."] },
      { id: "orch", label: "Node.js", sub: "orchestrator", x: 180, y: 170, w: 130, h: H, facts: ["Coordinates four fine-tuned OpenAI GPT adaptors; 14 iterative fine-tuning cycles."] },
      { id: "news", label: "news-sentiment", sub: "adaptor", x: 380, y: 30, w: 160, h: H, facts: ["News-sentiment fine-tuned adaptor."] },
      { id: "sp", label: "sentiment+price", sub: "adaptor", x: 380, y: 108, w: 160, h: H, facts: ["Sentiment+price adaptor: 48%→60% peak directional accuracy."] },
      { id: "price", label: "price-only", sub: "adaptor", x: 380, y: 186, w: 150, h: H, facts: ["Price-only fine-tuned adaptor."] },
      { id: "fusion", label: "fusion", sub: "adaptor", x: 380, y: 264, w: 130, h: H, facts: ["Fusion fine-tuned adaptor."] },
      { id: "eval", label: "confusion matrix", sub: "risk-aware", x: 562, y: 170, w: 150, h: H, facts: ["Rise/fall confusion matrix separating missed-opportunity from capital-loss errors."] },
    ],
    edges: [
      { id: "t-data-orch", from: "data", to: "orch", fact: "SPY · 131 days" },
      { id: "t-orch-news", from: "orch", to: "news", fact: "fine-tuned adaptor", via: [[345, 53]] },
      { id: "t-orch-sp", from: "orch", to: "sp", fact: "fine-tuned adaptor" },
      { id: "t-orch-price", from: "orch", to: "price", fact: "fine-tuned adaptor" },
      { id: "t-orch-fusion", from: "orch", to: "fusion", fact: "fine-tuned adaptor", via: [[345, 287]] },
      { id: "t-news-eval", from: "news", to: "eval", fact: "direction prediction", via: [[550, 100]] },
      { id: "t-sp-eval", from: "sp", to: "eval", fact: "direction prediction" },
      { id: "t-price-eval", from: "price", to: "eval", fact: "direction prediction" },
      { id: "t-fusion-eval", from: "fusion", to: "eval", fact: "direction prediction" },
    ],
  },

  // ── gipc.dev GitOps deploy path. Sources: web.yml:1,4-5,19,39-47,52,62; architecture.ts:59-60;
  //    infra/k8s/web/kustomization.yaml (newTag); infra/argocd/application.yaml:17-20; projects.json:7,21,33 ──
  "gipc-dev": {
    id: "gipc-dev",
    title: "gipc.dev — GitOps deploy path",
    caption:
      "This platform's GitOps deploy path — CI → registry → ArgoCD onto bare-metal k3s behind the tunnel. The full request path is on /infra.",
    viewW: 640,
    viewH: 340,
    lanes: [],
    nodes: [
      { id: "push", label: "git push", sub: "main", x: 24, y: 150, w: 120, h: H, facts: ["Merge to main triggers CI."] },
      { id: "ci", label: "GitHub Actions", sub: "web.yml", x: 190, y: 150, w: 150, h: H, facts: ["web.yml builds the image + pins the GitOps tag (commit SHA) on push to main."] },
      { id: "ghcr", label: "GHCR", sub: "image registry", x: 386, y: 60, w: 150, h: H, facts: ["Image pushed to GHCR (ghcr.io/…/gipc-web)."] },
      { id: "argocd", label: "ArgoCD", sub: "GitOps sync", x: 386, y: 150, w: 150, h: H, facts: ["Auto-syncs the pinned commit to the cluster (syncPolicy.automated: prune + selfHeal)."] },
      { id: "k3s", label: "k3s · ns gipc", sub: "web/core/ai", x: 386, y: 240, w: 150, h: H, facts: ["Bare-metal single-node k3s; pulls the image from GHCR."] },
      { id: "tunnel", label: "Cloudflare Tunnel", sub: "0 inbound ports", x: 190, y: 250, w: 160, h: H, facts: ["Outbound-only tunnel; zero inbound ports on the host."] },
    ],
    edges: [
      { id: "g-push-ci", from: "push", to: "ci", fact: "merge → main" },
      { id: "g-ci-ghcr", from: "ci", to: "ghcr", fact: "build + push image" },
      { id: "g-ci-argocd", from: "ci", to: "argocd", fact: "pin tag (commit SHA)" },
      { id: "g-argocd-k3s", from: "argocd", to: "k3s", fact: "sync manifests" },
      { id: "g-ghcr-k3s", from: "ghcr", to: "k3s", fact: "image pull", via: [[585, 180]] },
      { id: "g-tunnel-k3s", from: "tunnel", to: "k3s", fact: "serves traffic (outbound-only)" },
    ],
  },
};

export const hasProjectDiagram = (slug: string): boolean => slug in PROJECT_DIAGRAMS;
