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
      <FootSign />
    </main>
  );
}
