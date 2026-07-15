import Link from "next/link";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { pageMeta } from "../og";
import { writeupsByDate, readingMinutes } from "../../data/writeups";

export const metadata = pageMeta(
  "Writeups · gipc.dev",
  "Short technical writeups on the real work behind this platform — the safe-by-construction Lab, self-hosting on k3s, and the Construct résumé.",
  "/writeups",
);

export default function WriteupsPage() {
  const posts = writeupsByDate();
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/writeups">
        <SectionHeader marker="writeups" title="Writeups" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> ls writeups/
        </p>
        <p className="page-lead">
          Short notes on how this platform is actually built — no fluff, just the real engineering behind the
          Lab, the self-hosted infrastructure, and the Construct.
        </p>
        <ol className="wu-list">
          {posts.map((w) => (
            <li key={w.slug} className="wu-card">
              <h2 className="wu-card-title">
                <Link href={`/writeups/${w.slug}`}>{w.title}</Link>
              </h2>
              <p className="wu-meta">
                <time dateTime={w.date}>{w.date}</time> · {readingMinutes(w)} min read
              </p>
              <p className="wu-summary">{w.summary}</p>
              <p className="wu-tags">
                {w.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      </TerminalWindow>
    </main>
  );
}
