import type { Metadata } from "next";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";

export const metadata: Metadata = {
  title: "Connect — get in touch · gipc.dev",
  description:
    "Reach Gabriel Carvalho — email, GitHub and LinkedIn, plus a signed résumé PDF. Software · DevOps · AI engineer, Australia.",
};

export default function ConnectPage() {
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/connect">
        <SectionHeader marker="connect" title="Connect" />
        <p className="line">
          <span className="prompt">arcane@prod:~$</span> cat ./contact
        </p>
        <p className="page-lead">
          Open a channel — email, GitHub, LinkedIn and a signed résumé download. The full
          contact surface arrives at the end of this sprint.
        </p>
      </TerminalWindow>
    </main>
  );
}
