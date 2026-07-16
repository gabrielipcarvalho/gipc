// Typed contract for POST /api/ai/oracle — mirrors the FastAPI pydantic models + SSE frame shapes in
// services/ai (app/routes/oracle.py, app/oracle.py, app/sse.py). The /oracle UI (P5) consumes these.

export type OracleTurn = { role: "user" | "assistant"; content: string };

export type OracleRequest = {
  message: string; // ≤2000 chars
  history?: OracleTurn[]; // ≤12 turns, each ≤2000 chars
  context?: string | null; // ≤1000 chars — untrusted, treated as data server-side
  turnstileToken: string;
};

// SSE frames (one JSON object per `data:` line). `type` discriminates the union.
export type OracleTraceKind = "retrieval" | "tool_call" | "tool_result";

export type OracleCitation = { title: string; url: string; score: number };

export type OracleFrame =
  | { type: "token"; text: string }
  | { type: "trace"; kind: "retrieval"; chunks: OracleCitation[] }
  | { type: "trace"; kind: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "trace"; kind: "tool_result"; name: string; summary: string }
  | { type: "done"; tokens_in: number; tokens_out: number; est_cost: number }
  | { type: "ui"; action: "station"; id: string }
  | { type: "error"; message: string };

// ── Paste-a-JD (POST /api/ai/jd) — mirrors services/ai/app/jd.py ─────────────
export type JdStrength = "strong" | "partial" | "gap";

export type JdRequirement = {
  requirement: string;
  evidence: string[];
  strength: JdStrength;
};

export type JdAnalysis = {
  requirements: JdRequirement[];
  pitch: string;
  gaps: string[];
};

export type JdRequest = { jdText: string; turnstileToken: string };
