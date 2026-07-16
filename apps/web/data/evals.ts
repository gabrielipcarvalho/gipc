import raw from "./evals.json";

/* Typed wrapper over the committed eval results. evals.json is written ONLY by the harness
   (services/ai/app/evals.py — `python -m app.evals`); a pytest pins byte-parity with the master
   copy. INVARIANT: this file must always EXIST (static import — the build breaks otherwise);
   "pending"/"error" are IN-FILE states, never a missing file. */

export type RetrievalEval = {
  hit_at_6: number;
  mrr: number;
  n: number;
  misses: { q: string; top: string[] }[];
};
export type FaithfulnessEval = {
  supported_ratio: number;
  n_claims: number;
  n: number;
  ungraded: number;
  unsupported_examples: string[];
};
export type JdEval = {
  label_accuracy: number;
  n: number;
  jds: object[];
  evidence_grounded_ratio: number;
  n_evidence: number;
  ungrounded_examples: { evidence: string; tokens: string[] }[];
};
export type PendingEval = { status: "pending" | "error" };

export type EvalResults = {
  run_at: string;
  model: string;
  embedder: string;
  params: {
    k: number;
    code_cap: number;
    answer_temp: number;
    judge_temp: number | string; // 0 when sent; "default" when the cross-model judge omits it
    judge_model?: string; // absent on pre-Sprint-I (self-judged) runs
    jd_path: string;
  };
  corpus_hash: string;
  evals: {
    retrieval: RetrievalEval | PendingEval;
    faithfulness: FaithfulnessEval | PendingEval;
    jd_mapping: JdEval | PendingEval;
  };
};

export const evalResults = raw as EvalResults;

export function isPending<T>(e: T | PendingEval): e is PendingEval {
  return typeof e === "object" && e !== null && "status" in (e as object);
}
