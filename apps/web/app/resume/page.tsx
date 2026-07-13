import { resume } from "../../data/resume";
import { ConstructShell } from "./ConstructShell";
import { StaticResume } from "./StaticResume";
import { pageMeta } from "../og";

export const metadata = pageMeta(
  "The Construct — living résumé · gipc.dev",
  "Gabriel Carvalho's résumé as a navigable Matrix construct — with a complete, selectable fallback for recruiters and ATS. Software · DevOps · AI Engineer, Australia.",
  "/resume",
);

/* schema.org @graph: Person + the IEEE publication authored by him (author → @id;
   schema.org has no WorkExperience type — worksFor + alumniOf is the standard
   mapping). Built from resume.json — no fact invented. Phone deliberately absent. */
function jsonLd() {
  const b = resume.basics;
  const pub = resume.publications[0];
  const personId = "https://gipc.dev/#gabriel";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": personId,
        name: b.name,
        jobTitle: b.label,
        email: `mailto:${b.email}`,
        url: b.site,
        address: {
          "@type": "PostalAddress",
          addressLocality: b.location.city,
          addressRegion: b.location.region,
          addressCountry: b.location.country,
        },
        sameAs: b.profiles.map((p) => p.url),
        worksFor: resume.experience
          .filter((r) => r.end === "present")
          .map((r) => ({ "@type": "Organization", name: r.org })),
        alumniOf: Array.from(new Set(resume.education.map((e) => e.org))).map((org) => ({
          "@type": "CollegeOrUniversity",
          name: org,
        })),
        knowsAbout: resume.skills.flatMap((s) => s.items),
      },
      pub && {
        "@type": "ScholarlyArticle",
        headline: pub.title,
        author: { "@id": personId },
        publisher: { "@type": "Organization", name: pub.venue },
        ...(pub.volume
          ? {
              isPartOf: {
                "@type": "PublicationVolume",
                volumeNumber: pub.volume,
                isPartOf: { "@type": "Periodical", name: pub.venue },
              },
            }
          : {}),
        ...(pub.pages ? { pagination: pub.pages } : {}),
        datePublished: pub.date,
        sameAs: `https://doi.org/${pub.doi}`,
      },
    ].filter(Boolean),
  };
}

export default function ResumePage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />
      <ConstructShell>
        <StaticResume />
      </ConstructShell>
    </main>
  );
}
