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
          Selected projects, each opened up for inspection — architecture diagrams, honest scope,
          links out to code and publications — sourced from the same résumé data that drives the
          Construct, so nothing here can drift from the record. Filter by technology.
        </p>
        <WorkGrid projects={projects} />
      </TerminalWindow>
    </main>
  );
}
