import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { ResumePanel } from "../components/ResumePanel";
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
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/connect">
        <SectionHeader marker="connect" title="Connect" />
        <p className="line">
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
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${p.network} profile (opens in new tab)`}
              >
                {p.url.replace("https://www.", "").replace("https://", "")}
              </a>
            </li>
          ))}
          <li className="connect-soon">
            <span className="connect-k">book a call</span>
            <span className="connect-hint">scrying window — coming soon</span>
          </li>
        </ul>

        <div className="connect-resume">
          <p className="connect-k">résumé</p>
          <ResumePanel />
        </div>

        <p className="connect-note">
          The living version of that résumé is <a href="/resume">the Construct</a>.
        </p>
      </TerminalWindow>
    </main>
  );
}
