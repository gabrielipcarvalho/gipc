import Link from "next/link";
import { Console } from "./console";
import { FootSign } from "./components/FootSign";
import { pageMeta } from "./og";
import { resume } from "../data/resume";

export const metadata = pageMeta(
  "arcane — the operator · backend · cloud · AI arts",
  "gipc.dev — an operator's console for a real, self-hosted system. Every metric, deploy and agent here is live, not a mockup.",
  "/",
);

/* Compact Person node, same @id as /resume's full @graph — one Person for crawlers. */
const personLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://gipc.dev/#gabriel",
  name: resume.basics.name,
  jobTitle: resume.basics.label,
  url: resume.basics.site,
  sameAs: resume.basics.profiles.map((p) => p.url),
};

export default function Home() {
  return (
    <main id="main" className="wrap stage" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd).replace(/</g, "\\u003c") }}
      />
      <Console />
      {/* Sprint N — the plain-English layer: who this is, why the site is unusual, where to go.
          Server-rendered (works without JS), below the console so the theatre still opens the show. */}
      <section className="orient" aria-label="What this site is">
        <p className="orient-lead">
          This is the portfolio of <strong>Gabriel Carvalho</strong> — software · DevOps · AI
          engineer, Gold Coast AU. It isn&apos;t a brochure: everything here runs on a Kubernetes
          platform he builds and operates himself, and every metric, deploy and demo is live.
          The site is the proof of work.
        </p>
        <ul className="orient-guide" aria-label="What each page holds">
          <li><b>work</b><span>selected projects, opened up for inspection — architecture diagrams, honest scope, links to code</span></li>
          <li><b>resume</b><span>the Construct — an interactive Matrix-style résumé, with the signed PDF a click away</span></li>
          <li><b>timeline</b><span>every role and every degree, newest first</span></li>
          <li><b>system</b><span>live telemetry of the very platform serving you this page</span></li>
          <li><b>oracle</b><span>an AI that answers as the site&apos;s operator — grounded, cited, honestly budgeted</span></li>
          <li><b>lab</b><span>safe, live infrastructure demos you can trigger yourself</span></li>
          <li><b>infra</b><span>how it&apos;s all built — read straight from the repo, so it can&apos;t drift</span></li>
          <li><b>status</b><span>real uptime and incident history, self-probed</span></li>
          <li><b>writeups</b><span>short engineering notes on how the pieces actually work</span></li>
          <li><b>connect</b><span>open a channel — email, profiles, meeting requests</span></li>
        </ul>
        <ul className="orient-lanes">
          <li>
            <b>hiring?</b> <Link href="/work">selected work</Link> ·{" "}
            <Link href="/resume">the résumé</Link> · <Link href="/timeline">career timeline</Link>
          </li>
          <li>
            <b>technical?</b> <Link href="/system">live telemetry</Link> ·{" "}
            <Link href="/lab">break things safely</Link> · <Link href="/infra">how it&apos;s built</Link>
          </li>
          <li>
            <b>curious?</b> <Link href="/oracle">ask the AI operator</Link> ·{" "}
            <Link href="/writeups">writeups</Link>
          </li>
        </ul>
      </section>
      <FootSign />
    </main>
  );
}
