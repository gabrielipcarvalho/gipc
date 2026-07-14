import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { OracleChat } from "../components/OracleChat";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "The Oracle — ask the operator · gipc.dev",
  "A tool-using AI operator over the real gipc.dev platform: retrieval-grounded answers with citations, "
    + "read-only live-infra tools, and an honest trace of every step.",
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
          <a href="/system">/system</a>. It cites its sources, refuses to fabricate, and shows its working
          in a live trace panel. It runs under a hard daily budget and a bot check; when the budget is
          spent, it rests honestly.
        </p>
        <noscript>
          <p className="page-lead">
            The oracle chat needs JavaScript. The same facts it draws on are on{" "}
            <a href="/resume">/resume</a>, <a href="/work">/work</a> and <a href="/system">/system</a>.
          </p>
        </noscript>
        <OracleChat />
      </TerminalWindow>
    </main>
  );
}
