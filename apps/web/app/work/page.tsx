import type { Metadata } from "next";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { WorkGrid } from "../components/WorkGrid";
import { projects } from "../../data/projects";

export const metadata: Metadata = {
  title: "The Work — selected projects · gipc.dev",
  description:
    "Selected engineering work: gipc.dev, Nina Nails, seismic U-Net, a transformer market platform and IEEE-published drowning detection.",
};

export default function WorkPage() {
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/work">
        <SectionHeader marker="work" title="The Work" />
        <p className="line">
          <span className="prompt">arcane@prod:~$</span> ls ./grimoire
        </p>
        <p className="page-lead">
          Projects as inspectable artifacts — sourced from the same résumé data that
          drives the Construct. Filter by technology, or follow the links out.
        </p>
        <WorkGrid projects={projects} />
      </TerminalWindow>
    </main>
  );
}
