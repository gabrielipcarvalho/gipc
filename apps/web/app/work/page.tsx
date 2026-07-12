import type { Metadata } from "next";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";

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
          Projects as inspectable artifacts — gipc.dev (you&apos;re in it), Nina Nails,
          a seismic U-Net, a transformer market platform and IEEE-published research.
          Full cards land in this sprint.
        </p>
      </TerminalWindow>
    </main>
  );
}
