import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { MeetForm } from "../components/MeetForm";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "Book a call — request a time · gipc.dev",
  "Request a call with Gabriel — async-first, AEST (UTC+10, Gold Coast). Pick a purpose and a couple of windows; it composes an email request and I confirm.",
  "/meet",
);

export default function MeetPage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/meet">
        <SectionHeader marker="meet" title="Book a call" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> ./request-a-time
        </p>
        <p className="page-lead">
          I&apos;m async-first and based on the Gold Coast (<strong>AEST, UTC+10</strong> — Queensland
          keeps no daylight saving), open to Melbourne relocation. Propose a couple of windows below and
          I&apos;ll reply to confirm — this composes an email request, it doesn&apos;t book instantly.
        </p>
        <noscript>
          <p className="page-lead">
            Email <a href="mailto:arcan.e@gipc.dev">arcan.e@gipc.dev</a> with a couple of preferred times
            (AEST) and what you&apos;d like to talk about.
          </p>
        </noscript>
        <MeetForm />
      </TerminalWindow>
    </main>
  );
}
