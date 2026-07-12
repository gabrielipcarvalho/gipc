import type { Metadata } from "next";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";

export const metadata: Metadata = {
  title: "The Construct — living résumé · gipc.dev",
  description:
    "A navigable, Matrix-inspired résumé for Gabriel Carvalho — with a full clean, selectable fallback for recruiters and ATS.",
};

export default function ResumePage() {
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/resume">
        <SectionHeader marker="resume" title="The Construct" />
        <p className="line">
          <span className="prompt">arcane@prod:~$</span> load ./construct --resume
        </p>
        <p className="page-lead">
          A living résumé you navigate as descending stations — Matrix-skinned, with a
          full clean, selectable fallback for recruiters and ATS. Compiling in this sprint.
        </p>
      </TerminalWindow>
    </main>
  );
}
