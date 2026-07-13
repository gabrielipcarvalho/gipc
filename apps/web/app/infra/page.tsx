import type { ReactNode } from "react";
import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { pageMeta } from "../og";
import { IAC_FILES } from "../../data/iac.generated";

export const metadata = pageMeta(
  "Infrastructure — how this page is served · gipc.dev",
  "The real, annotated infrastructure that serves gipc.dev: the CI/CD pipeline, Kubernetes manifests, Caddy and the Cloudflare Tunnel — read straight from the repo.",
  "/infra",
);

/* Pure build-time Server Component: renders the REAL infra files (baked in by scripts/gen-iac.mjs at
   build → zero drift). No client JS, no external highlighter (CSP-safe) — a tiny YAML tokenizer colours
   comments/keys inline. Nothing secret reaches here (gen-iac hard-fails on a secret + redacts the tunnel id). */

const KEY_RE = /^(\s*(?:-\s+)?)([\w.\-/]+)(:)(.*)$/;

// splitInlineComment: peel a trailing " # ..." off a value (naive but safe — YAML values here have no '#').
function withInlineComment(rest: string): ReactNode {
  const i = rest.indexOf(" #");
  if (i < 0) return rest;
  return (
    <>
      {rest.slice(0, i)}
      <span className="tok-comment">{rest.slice(i)}</span>
    </>
  );
}

function highlightYaml(line: string): ReactNode {
  if (line.trimStart().startsWith("#")) return <span className="tok-comment">{line}</span>;
  const m = KEY_RE.exec(line);
  if (m) {
    return (
      <>
        {m[1]}
        <span className="tok-key">{m[2]}</span>
        <span className="tok-punct">{m[3]}</span>
        {withInlineComment(m[4])}
      </>
    );
  }
  return withInlineComment(line);
}

function Code({ content, lang }: { content: string; lang: string }) {
  const lines = content.replace(/\n$/, "").split("\n");
  return (
    <pre className="iac-pre" tabIndex={0}>
      <code>
        {lines.map((ln, i) => (
          <span className="iac-line" key={i}>
            {lang === "yaml" ? highlightYaml(ln) : ln}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}

export default function InfraPage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/infra">
        <SectionHeader marker="infra" title="Infrastructure" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> cat infra/**
        </p>
        <p className="page-lead">
          How this page reaches you — the actual infrastructure, read straight from the repo at build
          time (no hand-copied snippets, so it can never drift). A single-node k3s box behind a
          Cloudflare Tunnel, GitOps-deployed: push to main, CI builds the image, ArgoCD syncs the cluster.
        </p>
        <div className="iac">
          {IAC_FILES.map((f) => (
            <section className="iac-file" key={f.path} aria-label={f.path}>
              <h2 className="iac-title">{f.title}</h2>
              <p className="iac-path">{f.path}</p>
              <p className="iac-blurb">{f.blurb}</p>
              <Code content={f.content} lang={f.lang} />
            </section>
          ))}
        </div>
      </TerminalWindow>
    </main>
  );
}
