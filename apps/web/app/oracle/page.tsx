import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { OracleTabs } from "../components/OracleTabs";
import { EvalsPanel } from "../components/EvalsPanel";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "The Oracle — ask the operator · gipc.dev",
  "A tool-using AI operator over the real gipc.dev platform: retrieval-grounded answers with citations "
    + "(including its own source code), read-only live-infra tools, a self-hosted local-model demo, and "
    + "published eval scores — an honest trace of every step.",
  "/oracle",
);

export default function OraclePage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/oracle">
        <SectionHeader marker="oracle" title="The Oracle" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> oracle --ask
        </p>
        {/* Crawlable / no-JS explainer — the real facts, so this page is never an empty shell. */}
        <p className="page-lead">
          The oracle answers as the operator of this site. It grounds every claim about Gabriel in a
          curated public corpus (this résumé, the projects, the platform docs) and can call read-only
          tools against gipc.dev&apos;s own live APIs — the same metrics you see on{" "}
          <a href="/system">/system</a>. It cites its sources — including this site&apos;s own source code — refuses to
          fabricate, and shows its working in a live trace panel. Another tab runs a small
          self-hosted model on my own hardware with live latency and cost stats, and the eval panel
          below publishes real measured scores. It runs under a hard daily budget and a bot check;
          when the budget is spent, it rests honestly.
        </p>
        <noscript>
          <p className="page-lead">
            The oracle chat, JD analyzer and local-model demo need JavaScript. The same facts they draw on are on{" "}
            <a href="/resume">/resume</a>, <a href="/work">/work</a> and <a href="/system">/system</a>.
          </p>
        </noscript>
        <OracleTabs />
        <EvalsPanel />
      </TerminalWindow>
    </main>
  );
}
