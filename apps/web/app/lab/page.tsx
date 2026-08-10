import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { LabDeck } from "../components/LabDeck";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "The Lab — live infra demos · gipc.dev",
  "Live, safe-by-construction infrastructure demos on a disposable namespace: chaos really kills a pod and "
    + "watches it self-heal, a bounded load test hammers an isolated service with a live histogram, a DB "
    + "explorer with real EXPLAIN plans on a disposable postgres, plus an event stream, the real rate "
    + "limiter, and an API playground.",
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
          Real operations you can trigger — not screenshots, and not simulations. Every demo below
          runs my own code, live, against this platform&apos;s own infrastructure, and each card
          explains in one line what it proves and why it is safe to hand to a stranger. The safety
          model behind all of them:
        </p>
        <ul className="lead-guide">
          <li><b>isolated</b> — destructive demos live in a disposable, NetworkPolicy-fenced <code>demo</code> namespace; nothing in there can touch this site</li>
          <li><b>capped</b> — chaos and load carry hard limits on rate, duration and concurrency, enforced server-side</li>
          <li><b>no real data</b> — the DB explorer speaks to a synthetic demo postgres, never the platform&apos;s actual database</li>
          <li><b>no execution surface</b> — the sandbox shell is a fixed command grammar over an in-memory filesystem; a real exec surface would be reckless on a single-node host, so by construction there isn&apos;t one</li>
        </ul>
        <p className="page-lead">
          The same live metrics these demos move are on <a href="/system">/system</a>, and the newest
          exhibit — a <a href="/oracle?tab=local">self-hosted local model</a> — lives on the oracle
          page.
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
