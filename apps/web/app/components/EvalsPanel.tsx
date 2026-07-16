import { evalResults, isPending } from "../../data/evals";

/* SSR evals panel — measured, not vibes. Every number is written by the committed harness
   (services/ai/app/evals.py); nothing here is typed by hand. Server component, no client JS —
   the scores are in the HTML (crawlable). */

const GH = "https://github.com/gabrielipcarvalho/gipc/blob/main/";

export function EvalsPanel() {
  const r = evalResults;
  const ret = r.evals.retrieval;
  const faith = r.evals.faithfulness;
  const jd = r.evals.jd_mapping;
  return (
    <section className="evals" aria-labelledby="evals-head">
      <h2 id="evals-head" className="evals-head">
        // evals — measured, not vibes
      </h2>
      <table className="evals-table">
        <thead>
          <tr>
            <th scope="col">metric</th>
            <th scope="col">score</th>
            <th scope="col">n</th>
            <th scope="col">method</th>
          </tr>
        </thead>
        <tbody>
          {isPending(ret) ? (
            <tr>
              <th scope="row">retrieval</th>
              <td colSpan={3} className="evals-pending">{ret.status === "pending" ? "pending — not yet run" : "errored — see results file"}</td>
            </tr>
          ) : (
            <>
              <tr>
                <th scope="row">retrieval hit@6</th>
                <td>{ret.hit_at_6}</td>
                <td>{ret.n} questions</td>
                <td>gold question → expected chunk in the oracle&apos;s top-6</td>
              </tr>
              <tr>
                <th scope="row">retrieval MRR</th>
                <td>{ret.mrr}</td>
                <td>{ret.n}</td>
                <td>mean reciprocal rank of the first expected chunk</td>
              </tr>
            </>
          )}
          {isPending(faith) ? (
            <tr>
              <th scope="row">faithfulness</th>
              <td colSpan={3} className="evals-pending">{faith.status === "pending" ? "pending — not yet run" : "errored — see results file"}</td>
            </tr>
          ) : (
            <tr>
              <th scope="row">faithfulness</th>
              <td>{faith.supported_ratio}</td>
              <td>
                {faith.n_claims} claims / {faith.n} answers
              </td>
              <td>LLM-judged: every claim supported by the retrieved chunks</td>
            </tr>
          )}
          {isPending(jd) ? (
            <tr>
              <th scope="row">JD mapping</th>
              <td colSpan={3} className="evals-pending">{jd.status === "pending" ? "pending — not yet run" : "errored — see results file"}</td>
            </tr>
          ) : (
            <>
              <tr>
                <th scope="row">JD label accuracy</th>
                <td>{jd.label_accuracy}</td>
                <td>{jd.n} labelled requirements</td>
                <td>strong/partial/gap vs hand-labelled expectations (2 sample JDs)</td>
              </tr>
              <tr>
                <th scope="row">evidence lexical grounding</th>
                <td>{jd.evidence_grounded_ratio}</td>
                <td>{jd.n_evidence} evidence strings</td>
                <td>strict token-stem overlap with the résumé — a LOWER BOUND, not a fabrication rate</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <p className="evals-meta">
        measured {r.run_at.slice(0, 10)} · model {r.model} · embedder {r.embedder} · corpus{" "}
        {r.corpus_hash.slice(0, 8)} · k={r.params.k}, code_cap={r.params.code_cap}; answer+judge at
        temp 0, JD mapping runs the production path
      </p>

      <div className="evals-notes">
        <p>
          A small-n snapshot ({!isPending(ret) ? ret.n : "—"} retrieval questions;{" "}
          {!isPending(faith) ? `${faith.n_claims} judged claims` : "—"};{" "}
          {!isPending(jd) ? `${jd.n} labelled JD requirements` : "—"}) against a pinned corpus and
          model — a regression tripwire for this site&apos;s oracle, not a general benchmark.
          Faithfulness evaluates the retrieval-grounded answer path at temperature 0 — no live
          tools, no chat history; tool-mediated answers are out of scope. Lexical grounding counts a token as grounded when it (or its
          stem: s/es/ed/ing/ion/ment stripped) appears in the résumé text — connective vocabulary
          and true-but-unmentioned words deflate it, and every failing token is published in the
          results file, so read it as a strict floor.
        </p>
        {!isPending(faith) && faith.unsupported_examples.length > 0 && (
          <p>
            unsupported claims the judge flagged:{" "}
            {faith.unsupported_examples.map((e, i) => (
              <i key={i}>&quot;{e}&quot;{i < faith.unsupported_examples.length - 1 ? " · " : ""}</i>
            ))}
          </p>
        )}
        <p>
          audit it: <a href={`${GH}services/ai/app/evals.py`}>the harness</a> ·{" "}
          <a href={`${GH}services/ai/evals/gold-retrieval.json`}>gold questions</a> ·{" "}
          <a href={`${GH}services/ai/evals/gold-jd.json`}>gold JDs</a> ·{" "}
          <a href={`${GH}services/ai/evals/results.json`}>raw results</a>
        </p>
      </div>
    </section>
  );
}
