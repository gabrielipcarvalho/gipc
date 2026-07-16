import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { ResumePanel } from "../components/ResumePanel";
import { Signature } from "../components/Signature";
import { pageMeta } from "../og";
import { resume } from "../../data/resume";

export const metadata = pageMeta(
  "Connect — get in touch · gipc.dev",
  "Reach Gabriel Carvalho — email, GitHub and LinkedIn, plus a résumé PDF you can preview and download. Software · DevOps · AI Engineer, Australia.",
  "/connect",
);

/* Contact surface. The operator persona address (arcan.e@) fronts the site;
   profile URLs come from resume.json (single source). */
export default function ConnectPage() {
  const profiles = resume.basics.profiles;
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/connect">
        <SectionHeader marker="connect" title="Connect" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> cat ./contact
        </p>
        <p className="page-lead">
          Open a channel. Signals answered from Gold Coast, AU — relocation open (Melbourne).
        </p>
        <ul className="connect-rows">
          <li>
            <span className="connect-k">email</span>
            <a href="mailto:arcan.e@gipc.dev">arcan.e@gipc.dev</a>
          </li>
          {profiles.map((p) => (
            <li key={p.network}>
              <span className="connect-k">{p.network.toLowerCase()}</span>
              {/* 2.5.3 label-in-name: the visible URL must BE the accessible name — the new-tab
                  hint is appended via sr-only, not an overriding aria-label */}
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.url.replace("https://www.", "").replace("https://", "")}
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            </li>
          ))}
          <li>
            <span className="connect-k">book a call</span>
            <a href="/meet">request a time →</a>
          </li>
          <li>
            <span className="connect-k">verify</span>
            <a href="/authenticity">verify this build →</a>
          </li>
        </ul>

        <div className="connect-resume">
          <p className="connect-k">résumé</p>
          <ResumePanel />
        </div>

        <p className="connect-note">
          The living version of that résumé is <a href="/resume">the Construct</a>.
        </p>
        <Signature />
      </TerminalWindow>
    </main>
  );
}
