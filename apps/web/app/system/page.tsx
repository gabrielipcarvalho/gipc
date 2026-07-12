import type { Metadata } from "next";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";

export const metadata: Metadata = {
  title: "The System — live telemetry · gipc.dev",
  description:
    "The operator surface: service topology, live metrics and the deploy feed for the self-hosted gipc.dev platform.",
};

export default function SystemPage() {
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/system">
        <SectionHeader marker="system" title="The System" />
        <p className="line">
          <span className="prompt">arcane@prod:~$</span> systemctl status --all
        </p>
        <p className="page-lead">
          Booting the operator surface — service topology, live metrics and the deploy
          feed, read straight off the box. Coming online in this sprint.
        </p>
      </TerminalWindow>
    </main>
  );
}
