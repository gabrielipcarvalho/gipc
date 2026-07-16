import { evalResults, isPending } from "./evals";

/* The living architecture diagrams' data — hand-tuned layout, REAL facts only.
   Every fact string below is traceable to a manifest line or code identifier (the QA-PLAN
   acceptance criterion); eval numbers are IMPORTED from evals.json, never hand-typed.
   Truth sources: infra/k8s/* manifests, infra/cloudflared/config.yml, services/ai/app/*. */

export type ArchNode = {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  facts: string[];
};
export type ArchEdge = {
  id: string;
  from: string;
  to: string;
  fact: string; // ONE compact line — rendered on both endpoint cards (→ / ←)
  via?: [number, number][]; // elbow waypoints
};
export type ArchLane = { label: string; x: number; y: number; w: number; h: number };
export type ArchDiagramData = {
  id: string;
  title: string;
  caption: string;
  viewW: number;
  viewH: number;
  lanes: ArchLane[];
  nodes: ArchNode[];
  edges: ArchEdge[];
};

// Shared layout constants — retune here, not per node.
const NW = 150; // default node width
const NH = 46; // node height

export const REQUEST_PATH: ArchDiagramData = {
  id: "reqpath",
  title: "the request path",
  caption:
    "How a request reaches this page and what talks to what — read from the manifests in this repo (Sprints H-I).",
  viewW: 940,
  viewH: 620,
  lanes: [
    { label: "internet", x: 8, y: 8, w: 924, h: 88 },
    { label: "garuda — host (systemd / k3s server)", x: 8, y: 104, w: 924, h: 88 },
    { label: "k3s · ns gipc", x: 8, y: 200, w: 924, h: 192 },
    { label: "ns observability", x: 8, y: 400, w: 400, h: 120 },
    { label: "ns data", x: 416, y: 400, w: 220, h: 120 },
    { label: "ns demo (blast radius)", x: 644, y: 400, w: 288, h: 212 },
  ],
  nodes: [
    { id: "visitor", label: "visitor", sub: "you, now", x: 40, y: 30, w: 120, h: NH, facts: ["This page render is itself a walk of this diagram."] },
    { id: "cf", label: "Cloudflare edge", sub: "DNS · TLS · WAF", x: 360, y: 30, w: 170, h: NH, facts: ["gipc.dev + www resolve at Cloudflare; TLS terminates at the edge.", "Origin is reachable ONLY via the tunnel — no inbound ports exposed on garuda (the tunnel dials out)."] },
    { id: "cloudflared", label: "cloudflared", sub: "host systemd — the tunnel", x: 360, y: 126, w: 170, h: NH, facts: ["A host systemd process, not a cluster workload (infra/cloudflared/config.yml).", "Outbound-only tunnel to Cloudflare; tunnel id redacted from this page by policy."] },
    { id: "k8sapi", label: "k8s API", sub: "k3s server", x: 720, y: 126, w: NW, h: NH, facts: ["Single-node k3s; the API server runs on the same host."] },
    { id: "caddy", label: "Caddy", sub: "ingress · CSP · headers", x: 360, y: 222, w: 170, h: NH, facts: ["Route table (caddy.yaml): /api/ai/* → ai:8000 · /api/* → core:8080 · everything else → web:80.", "Sets the CSP + security headers site-wide; -Server header stripped."] },
    { id: "web", label: "web", sub: "Next.js 15", x: 60, y: 316, w: 140, h: NH, facts: ["Static-first App Router; SSR pages seed from core in-cluster."] },
    { id: "core", label: "core", sub: "Go · stdlib", x: 400, y: 316, w: NW, h: NH, facts: ["One external dep (lib/pq, Sprint H); everything else stdlib.", "Boot-independent: serves /api/healthz with every dependency down."] },
    { id: "ai", label: "ai", sub: "FastAPI · RAG", x: 640, y: 316, w: 130, h: NH, facts: ["The oracle's tools also GET the site's own public APIs via https://gipc.dev (config.py core_base) — a real loopback through this whole diagram."] },
    { id: "ollama", label: "ollama", sub: "qwen2.5:0.5b-instruct", x: 786, y: 316, w: 146, h: NH, facts: ["Self-hosted model server, in-cluster only (ollama:11434)."] },
    { id: "prometheus", label: "prometheus", x: 40, y: 436, w: NW, h: NH, facts: ["Scrapes the cluster; core's /system panels run fixed PromQL against it."] },
    { id: "loki", label: "loki", x: 230, y: 436, w: 130, h: NH, facts: ["Log store; promtail labels streams namespace/pod/container."] },
    { id: "postgres", label: "postgres", sub: "pgvector · gipc_ai", x: 446, y: 436, w: 160, h: NH, facts: ["pgvector/pgvector:pg16 (postgres.yaml); the RAG corpus lives here.", "NetworkPolicy: only ns gipc may connect (port 5432)."] },
    { id: "demodb", label: "demo-db", sub: "disposable postgres", x: 674, y: 436, w: NW, h: NH, facts: ["postgres:16.9-alpine on emptyDir — pod delete = full reseed (synthetic data).", "The Lab DB explorer's target; SELECT-only role, 6-query allowlist."] },
    { id: "chaos", label: "chaos-target", sub: "×3 echo pods", x: 674, y: 540, w: NW, h: NH, facts: ["nginx-unprivileged ×3 — the chaos button's kill target and the load test's backstop.", "demo ns is netpol-isolated: ingress only from ns gipc, egress DNS + intra-demo."] },
  ],
  edges: [
    { id: "e-vis-cf", from: "visitor", to: "cf", fact: "HTTPS · gipc.dev" },
    { id: "e-cf-cfd", from: "cf", to: "cloudflared", fact: "tunnel — outbound-only, no inbound ports exposed" },
    { id: "e-cfd-caddy", from: "cloudflared", to: "caddy", fact: "http://localhost:30082 (Caddy NodePort)" },
    { id: "e-caddy-web", from: "caddy", to: "web", fact: "fallback route → web:80", via: [[280, 245], [130, 285]] },
    { id: "e-caddy-core", from: "caddy", to: "core", fact: "/api/* → core:8080" },
    { id: "e-caddy-ai", from: "caddy", to: "ai", fact: "/api/ai/* → ai:8000 (SSE: flush_interval -1)", via: [[610, 245], [705, 285]] },
    { id: "e-web-core", from: "web", to: "core", fact: "SSR seeds fetch http://core:8080 (system/status pages)", via: [[210, 330]] },
    { id: "e-core-web", from: "core", to: "web", fact: "uptime probe → http://web:80 (WEB_URL)", via: [[390, 350]] },
    { id: "e-core-prom", from: "core", to: "prometheus", fact: "fixed PromQL · prometheus.observability:9090", via: [[430, 380], [130, 410]] },
    { id: "e-core-loki", from: "core", to: "loki", fact: "fixed LogQL · loki.observability:3100", via: [[460, 390], [295, 415]] },
    { id: "e-core-k8s", from: "core", to: "k8sapi", fact: "pod reads for /api/topology — Roles topology-pod-reader (gipc/observability/data) + chaos (demo: list/delete — the Lab kill's real path)", via: [[590, 340], [700, 250]] },
    { id: "e-core-demodb", from: "core", to: "demodb", fact: "Lab DB explorer · demo-db.demo:5432 · demo_ro SELECT-only", via: [[560, 380], [700, 420]] },
    { id: "e-core-chaos", from: "core", to: "chaos", fact: "load test HTTP (LOAD_TARGET_URL) · netpol ingress-from-gipc; the chaos kill lands here via the k8s API (Role chaos)", via: [[520, 400], [620, 560], [660, 562]] },
    { id: "e-ai-pg", from: "ai", to: "postgres", fact: "RAG retrieval · postgres.data:5432 · netpol: gipc-only ingress", via: [[660, 390], [560, 420]] },
    { id: "e-ai-ollama", from: "ai", to: "ollama", fact: "/api/ai/infer demo only · ollama:11434 · qwen2.5:0.5b-instruct" },
  ],
};

// Eval facts — interpolated from the committed eval results (never hand-typed). isPending is
// per-section (the EvalsPanel pattern).
const ret = evalResults.evals.retrieval;
const faith = evalResults.evals.faithfulness;
const evalFacts: string[] = [
  ...(isPending(ret)
    ? [`Retrieval eval ${ret.status === "error" ? "errored" : "pending"} — see /oracle.`]
    : [`retrieval hit@6 ${ret.hit_at_6} · MRR ${ret.mrr} (n=${ret.n})`]),
  ...(isPending(faith)
    ? [`Faithfulness eval ${faith.status === "error" ? "errored" : "pending"} — see /oracle.`]
    : [`faithfulness ${faith.supported_ratio} over ${faith.n_claims} graded claims`]),
  "Full dashboard with misses + methodology: /oracle (evals tab).",
];

export const RAG_PIPELINE: ArchDiagramData = {
  id: "ragpipe",
  title: "the oracle's RAG pipeline",
  caption:
    "How the oracle answers: the real modules in services/ai, in the order a question flows through them (Sprints H-I).",
  viewW: 940,
  viewH: 400,
  lanes: [
    { label: "build + ingest (offline)", x: 8, y: 8, w: 924, h: 110 },
    { label: "answer path (per question)", x: 8, y: 126, w: 924, h: 150 },
    { label: "tool loop + quality loop", x: 8, y: 284, w: 924, h: 108 },
  ],
  nodes: [
    { id: "sources", label: "corpus sources", sub: "résumé · projects · site · code", x: 30, y: 40, w: 190, h: 52, facts: ["corpus.py loads resume.json, projects.json, site.md; code_corpus.py bakes annotated code excerpts (code-manifest.json) at build.", "No hidden sources — what the oracle knows is exactly this list."] },
    { id: "ingest", label: "ingest Job", sub: "python -m app.ingest", x: 280, y: 40, w: 180, h: 52, facts: ["A k8s Job (ingest-job.yaml) — chunks the corpus (62 chunks, 36 of them code, at the last ingest) and upserts embeddings in one transaction."] },
    { id: "embedder", label: "embedder.py", sub: "bge-small-en-v1.5", x: 520, y: 40, w: 180, h: 52, facts: ["BAAI/bge-small-en-v1.5 via fastembed (ONNX, CPU) — 384-dim vectors, baked into the image at build."] },
    { id: "chunks", label: "pgvector", sub: "chunks · ns data", x: 760, y: 40, w: 150, h: 52, facts: ["The chunks table in the data-ns postgres (gipc_ai) — cosine distance via the <=> operator."] },
    { id: "retrieval", label: "retrieval.py", sub: "top-k 6 · code cap 2", x: 760, y: 160, w: 150, h: 52, facts: ["TOP_K=6; the oracle's auto-context admits at most CODE_CAP=2 code chunks (dilution guard); fixed SQL shape, embedding passed as a literal."] },
    { id: "oracle", label: "oracle.py", sub: "assembly + budget", x: 520, y: 160, w: 180, h: 52, facts: ["Trims history (6 turns / 4k chars), builds the user turn, enforces budget.py's fail-closed daily cost breaker + per-IP limits."] },
    { id: "llm", label: "Anthropic API", sub: "claude-haiku-4-5", x: 280, y: 160, w: 180, h: 52, facts: ["Generation is the Anthropic Messages API (llm.py) — model claude-haiku-4-5, streamed.", "The self-hosted Ollama serves only the separate /api/ai/infer demo — not this pipeline."] },
    { id: "toolloop", label: "tool loop", sub: "tools.py · ≤4 rounds", x: 280, y: 300, w: 180, h: 52, facts: ["The model may call fixed tools (search_corpus, the public site APIs, show_station — the Construct hook) for at most tool_rounds_max=4 rounds — then it must answer."] },
    { id: "sse", label: "SSE → Oracle UI", sub: "sse.py", x: 40, y: 160, w: 170, h: 52, facts: ["Tokens stream to the browser as server-sent events through Caddy (flush_interval -1)."] },
    { id: "evals", label: "evals.py", sub: "published, real", x: 640, y: 300, w: 180, h: 52, facts: evalFacts },
  ],
  edges: [
    { id: "r-src-ing", from: "sources", to: "ingest", fact: "chunking — headers + notes carry retrieval semantics" },
    { id: "r-ing-emb", from: "ingest", to: "embedder", fact: "embed each chunk (384-dim)" },
    { id: "r-emb-chunks", from: "embedder", to: "chunks", fact: "upsert vectors — single transaction, stale rows removed" },
    { id: "r-chunks-ret", from: "chunks", to: "retrieval", fact: "cosine top-k (<=> operator)" },
    { id: "r-ret-oracle", from: "retrieval", to: "oracle", fact: "auto-context: 6 chunks, ≤2 code" },
    { id: "r-oracle-llm", from: "oracle", to: "llm", fact: "prompt + tools, streamed" },
    { id: "r-llm-tools", from: "llm", to: "toolloop", fact: "tool calls — answered locally, fed back", via: [[370, 240]] },
    { id: "r-llm-sse", from: "llm", to: "sse", fact: "token stream", via: [[240, 186]] },
    { id: "r-evals-ret", from: "evals", to: "retrieval", fact: "exercises the REAL pipeline — results committed to evals.json, shown on /oracle", via: [[830, 326]] },
  ],
};
