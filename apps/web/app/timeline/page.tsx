import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { Timeline } from "../components/Timeline";
import { timeline } from "../../data/timeline";
import { resume } from "../../data/resume";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "Experience — career timeline · gipc.dev",
  "Gabriel Carvalho's career + study timeline — roles and degrees newest first, from the same résumé data that drives the Construct.",
  "/timeline",
);

export default function TimelinePage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/timeline">
        <SectionHeader marker="timeline" title="Experience" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> history --career
        </p>
        <p className="page-lead">
          The whole journey in order — every role and every degree, newest first, laid out as one
          long descent through time. Each entry carries its dates, its place, and the work that
          mattered there, and it is all rendered from the same résumé data the Construct uses, so
          the story on this page always matches the signed record. Scroll down to travel backwards;
          the links at the end lead out to the live profiles.
        </p>
        <Timeline nodes={timeline} />
        <p className="tl-links">
          <span className="prompt">arcane@prod:~$</span> links --out
          {resume.basics.profiles.map((pr) => (
            <a
              key={pr.url}
              className="tl-link"
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${pr.network} profile (opens in new tab)`}
            >
              {pr.network} ↗
            </a>
          ))}
        </p>
      </TerminalWindow>
    </main>
  );
}
