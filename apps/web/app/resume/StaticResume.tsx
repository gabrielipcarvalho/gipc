import { resume } from "../../data/resume";

/* The full résumé as clean, selectable, server-rendered DOM — the recruiter/ATS/
   crawler/print/reduced-motion deliverable. Every fact verbatim from resume.json.
   Never rendered: basics.phone, basics.private, meta, evidence ids.

   Structure: h1 name → h2 section chapters → h3 item cards. Each [data-station]
   article is one immersive depth station (16 total: identity, 2 roles, 3 skill
   pairs, 5 projects, 1 publication, 3 degrees, 1 honours). */

function skillPairs(): { title: string; groups: typeof resume.skills }[] {
  const pairs = [];
  for (let i = 0; i < resume.skills.length; i += 2) {
    const groups = resume.skills.slice(i, i + 2);
    pairs.push({ title: groups.map((g) => g.category).join(" · "), groups });
  }
  return pairs;
}

export function StaticResume() {
  const b = resume.basics;
  return (
    <div className="cst-doc">
      <header className="cst-card cst-identity" data-station>
        <p className="cst-kicker">// the record</p>
        <h1 className="cst-name">{b.name}</h1>
        <p className="cst-label">{b.label}</p>
        <p className="cst-meta-line">
          {b.location.city}, {b.location.region}, {b.location.country}
          {b.location.relocation ? ` · relocation: ${b.location.relocation}` : ""}
        </p>
        {b.workRights && <p className="cst-meta-line">{b.workRights}</p>}
        <p className="cst-body">{b.summary}</p>
        <p className="cst-contact">
          <a href={`mailto:${b.email}`}>{b.email}</a>
          <a href={b.site} target="_blank" rel="noreferrer">{b.site.replace("https://", "")}</a>
          {b.profiles.map((p) => (
            <a key={p.network} href={p.url} target="_blank" rel="noreferrer">{p.network}</a>
          ))}
        </p>
      </header>

      <section className="cst-section">
        <h2 className="cst-chapter">skills</h2>
        {skillPairs().map((pair) => (
          <article className="cst-card" data-station key={pair.title}>
            <p className="cst-kicker">// skills</p>
            <h3 className="cst-title">{pair.title}</h3>
            {pair.groups.map((g) => (
              <p className="cst-body" key={g.category}>
                <strong className="cst-strong">{g.category}:</strong> {g.items.join(" · ")}
              </p>
            ))}
          </article>
        ))}
      </section>

      <section className="cst-section">
        <h2 className="cst-chapter">experience</h2>
        {resume.experience.map((r) => (
          <article className="cst-card" data-station key={`${r.org}-${r.role}`}>
            <p className="cst-kicker">// experience</p>
            <h3 className="cst-title">{r.role}</h3>
            <p className="cst-meta-line">
              {r.org} · {r.location} · {r.start} – {r.end}
            </p>
            {r.note && <p className="cst-note">{r.note}</p>}
            <ul className="cst-bullets">
              {r.bullets.map((bl) => (
                <li key={bl.text.slice(0, 40)}>{bl.text}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="cst-section">
        <h2 className="cst-chapter">projects</h2>
        {resume.projects.map((p) => (
          <article className="cst-card" data-station key={p.name}>
            <p className="cst-kicker">// projects</p>
            <h3 className="cst-title">{p.name}</h3>
            <p className="cst-meta-line">{p.year}</p>
            <p className="cst-body">{p.text}</p>
            {p.url && (
              <p className="cst-links">
                <a href={p.url} target="_blank" rel="noreferrer" aria-label={`${p.name} — live site (opens in new tab)`}>
                  {p.url.replace("https://", "")}
                </a>
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="cst-section">
        <h2 className="cst-chapter">publications</h2>
        {resume.publications.map((pub) => (
          <article className="cst-card" data-station key={pub.doi}>
            <p className="cst-kicker">// publications</p>
            <h3 className="cst-title">{pub.title}</h3>
            <p className="cst-meta-line">
              {pub.authors} · {pub.venue}
              {pub.volume ? `, vol. ${pub.volume}` : ""}
              {pub.pages ? `, pp. ${pub.pages}` : ""} · {pub.date}
            </p>
            <p className="cst-links">
              <a
                href={`https://doi.org/${pub.doi}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`${pub.title} — DOI (opens in new tab)`}
              >
                doi.org/{pub.doi}
              </a>
            </p>
          </article>
        ))}
      </section>

      <section className="cst-section">
        <h2 className="cst-chapter">education</h2>
        {resume.education.map((e) => (
          <article className="cst-card" data-station key={e.degree}>
            <p className="cst-kicker">// education</p>
            <h3 className="cst-title">{e.degree}</h3>
            <p className="cst-meta-line">
              {e.org} · {e.start ? `${e.start} – ` : ""}{e.end}
            </p>
            {e.detail && <p className="cst-body">{e.detail}</p>}
          </article>
        ))}
      </section>

      <section className="cst-section">
        <h2 className="cst-chapter">honours</h2>
        <article className="cst-card" data-station>
          <p className="cst-kicker">// certifications · awards · leadership</p>
          <h3 className="cst-title">Certifications, awards &amp; leadership</h3>
          <ul className="cst-bullets">
            {resume.certifications.map((c) => (
              <li key={c.name}>{c.name}{c.date ? ` (${c.date})` : ""}</li>
            ))}
            {resume.awards.map((a) => (
              <li key={a.name}>{a.name}{a.date ? ` (${a.date})` : ""}</li>
            ))}
            {resume.leadership.map((l) => (
              <li key={l.name}>
                {l.name}
                {l.text ? ` — ${l.text}` : ""}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
