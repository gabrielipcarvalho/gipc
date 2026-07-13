import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { Timeline } from "../components/Timeline";
import { timeline } from "../../data/timeline";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "Experience — career timeline · gipc.dev",
  "Gabriel Carvalho's career + study timeline — roles and degrees newest first, from the same résumé data that drives the Construct.",
  "/timeline",
);

export default function TimelinePage() {
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/timeline">
        <SectionHeader marker="timeline" title="Experience" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> history --career
        </p>
        <p className="page-lead">
          Roles and study, newest first — the same résumé data the Construct renders, laid
          out as a descent through time.
        </p>
        <Timeline nodes={timeline} />
      </TerminalWindow>
    </main>
  );
}
