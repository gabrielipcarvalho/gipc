import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { LabDeck } from "../components/LabDeck";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "The Lab — live infra demos · gipc.dev",
  "Live, safe-by-construction infrastructure demos on a disposable namespace: chaos really kills a pod and "
    + "watches it self-heal, a bounded load test hammers an isolated service with a live histogram, plus an "
    + "event stream, the real rate limiter, and an API playground.",
  "/lab",
);

export default function LabPage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/lab">
        <SectionHeader marker="lab" title="The Lab" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> ./lab --run
        </p>
        <p className="page-lead">
          Real operations you can trigger — not screenshots. The <strong>chaos</strong> button actually
          deletes a pod in a disposable <code>demo</code> namespace and you watch Kubernetes heal it; the{" "}
          <strong>load test</strong> really hammers an isolated demo service (never this site) with hard
          caps, streaming a live latency histogram. Everything runs my own code against an isolated,
          NetworkPolicy-fenced namespace — the interactive visitor shell is deliberately deferred (too
          dangerous on a single-node host). The same live metrics are on <a href="/system">/system</a>.
        </p>
        <noscript>
          <p className="page-lead">
            The Lab demos need JavaScript. The live platform metrics they draw on are on{" "}
            <a href="/system">/system</a>.
          </p>
        </noscript>
        <LabDeck />
      </TerminalWindow>
    </main>
  );
}
