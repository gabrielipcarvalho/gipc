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
          An AI assistant that answers as this site&apos;s operator — ask it anything about
          Gabriel&apos;s experience, the projects, or how this platform works. What keeps it honest:
        </p>
        <ul className="lead-guide">
          <li><b>grounded</b> — every claim traces back to a curated public corpus: the résumé, the projects, the platform docs</li>
          <li><b>tool-using</b> — it can call read-only tools against gipc.dev&apos;s own live APIs, the same numbers you see on <a href="/system">/system</a></li>
          <li><b>transparent</b> — it cites its sources (including this site&apos;s own source code), refuses to fabricate, and shows its working in a live trace panel</li>
          <li><b>bounded</b> — a hard daily budget and a bot check; when the budget is spent, it rests honestly</li>
        </ul>
        <p className="page-lead">
          The tabs above the console each do one thing: <b>Ask</b> is the conversation itself;{" "}
          <b>Analyze a JD</b> reads a job description and maps it honestly against the record;{" "}
          <b>Tailor résumé</b> reorders the real facts for a specific role — never inventing new
          ones; <b>Theme studio</b> lets the model restyle the site within strict guard-rails; and{" "}
          <b>Local model</b> runs a small self-hosted model on my own hardware, with live latency
          and cost beside it. The eval panel at the bottom publishes real measured scores.
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
