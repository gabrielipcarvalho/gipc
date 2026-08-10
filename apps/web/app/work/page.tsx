import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { WorkGrid } from "../components/WorkGrid";
import { projects } from "../../data/projects";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "The Work — selected projects · gipc.dev",
  "Selected engineering work: gipc.dev, Nina Nails, seismic U-Net, a transformer market platform and IEEE-published drowning detection.",
  "/work",
);

export default function WorkPage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/work">
        <SectionHeader marker="work" title="The Work" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> ls ./grimoire
        </p>
        <p className="page-lead">
          A hand-picked set of projects, each opened up for inspection rather than simply listed.
          Inside every card you&apos;ll find an architecture diagram drawn from the real system, honest
          notes on scope and trade-offs, and links out to the code, the live deployments and the
          publications behind the work. Everything is sourced from the same résumé data that drives
          the Construct, so nothing on this page can quietly drift from the record. You can filter
          which projects use which technology by toggling the tech-stack buttons below.
        </p>
        <WorkGrid projects={projects} />
      </TerminalWindow>
    </main>
  );
}
