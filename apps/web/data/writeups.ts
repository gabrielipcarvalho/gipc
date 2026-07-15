import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

/* Structured-data content pipeline for /writeups. Posts are typed block arrays rendered by React
   (no markdown dependency, no dangerouslySetInnerHTML → XSS-safe by construction). Content is REAL
   work from this repo. Dates are static ISO strings (SSR-safe — never Date.now). */

export type WBlock =
  | { p: string } // paragraph (supports inline `code`, **bold**, [text](href) via renderInline)
  | { h: string } // sub-heading (<h2> within the post)
  | { ul: string[] } // bullet list
  | { code: string; lang?: string }; // fenced code block (rendered, never executed)

export type Writeup = {
  slug: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  summary: string;
  tags: string[];
  body: WBlock[];
};

/* Inline mini-formatter: wraps text in React elements only (never raw HTML). Total (never throws) —
   unmatched/unclosed delimiters render as literal text. Link hrefs restricted to http(s)/mailto/root. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/; // http(s)/mailto/root-relative; NOT protocol-relative //host

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    if (tok.startsWith("`")) {
      out.push(createElement("code", { key: key++ }, tok.slice(1, -1)));
    } else if (tok.startsWith("**")) {
      out.push(createElement("strong", { key: key++ }, tok.slice(2, -2)));
    } else {
      // [text](href)
      const sep = tok.indexOf("](");
      const label = tok.slice(1, sep);
      const href = tok.slice(sep + 2, -1);
      if (SAFE_HREF.test(href)) {
        const ext = href.startsWith("http");
        out.push(
          createElement(
            "a",
            {
              key: key++,
              href,
              ...(ext ? { target: "_blank", rel: "noreferrer" } : {}),
            },
            label,
          ),
        );
      } else {
        out.push(tok); // unsafe scheme → render literally
      }
    }
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

// join prose text for the reading-time estimate (code blocks excluded)
function concatText(w: Writeup): string {
  return w.body
    .map((b) => ("p" in b ? b.p : "h" in b ? b.h : "ul" in b ? b.ul.join(" ") : ""))
    .join(" ");
}

export const readingMinutes = (w: Writeup): number =>
  Math.max(1, Math.round(concatText(w).split(/\s+/).filter(Boolean).length / 200));

export const bySlug = (slug: string): Writeup | undefined => writeups.find((w) => w.slug === slug);

// newest first
export const writeupsByDate = (): Writeup[] => [...writeups].sort((a, b) => b.date.localeCompare(a.date));

export const writeups: readonly Writeup[] = [
  {
    slug: "building-the-lab",
    title: "Building the Lab: safe-by-construction infra demos",
    date: "2026-07-15",
    summary:
      "How /lab runs real, dangerous-looking infrastructure demos — killing pods, load-testing, streaming events — without ever executing untrusted input.",
    tags: ["Kubernetes", "Go", "security", "SSE"],
    body: [
      {
        p: "The Lab (`/lab`) lets a visitor press a button that **actually deletes a running pod** and watch Kubernetes heal it — plus a bounded load test, a live event stream, the real rate limiter, and an API playground. The design constraint was blunt: never execute untrusted visitor input, and never let a demo threaten the site it lives on.",
      },
      { h: "Isolation first" },
      {
        p: "Every demo workload lives in a disposable `demo` namespace that is NetworkPolicy-default-deny in both directions — a demo pod can reach DNS and its own namespace, nothing else. The core service's new Kubernetes power is a **namespaced Role** (list/delete pods in `demo` only), never a ClusterRole, proven scoped with `kubectl auth can-i`:",
      },
      {
        code: "auth can-i delete pods --as=system:serviceaccount:gipc:core-lab -n demo   # yes\nauth can-i delete pods --as=system:serviceaccount:gipc:core-lab -n gipc   # no",
        lang: "text",
      },
      { h: "Stdlib-only Kubernetes" },
      {
        p: "The Go core talks to the Kubernetes API over plain `net/http` with the mounted ServiceAccount token and CA — no `client-go`, keeping the zero-dependency invariant. The chaos button kills one Running pod under a Deployment; the ReplicaSet recreates it and kube-state-metrics shows the dip and recovery.",
      },
      { h: "Hard-capped, fail-closed" },
      {
        p: "The mutating endpoints are bounded server-side so they can't be weaponised:",
      },
      {
        ul: [
          "Chaos: per-IP cooldown, single-flight, a fixed selector, a `LabEnabled` gate.",
          "Load test: a FIXED internal target (no user URL → no SSRF), code-clamped duration/concurrency/total, one active run per IP.",
          "Everything streams over Server-Sent Events (the existing hub) — no WebSocket.",
        ],
      },
      {
        p: "A dedicated red-team pass then tried to break each invariant — SSRF, privilege escalation, DoS, blast radius, secret/token leakage — and every one held. The interactive visitor shell was the one deliberate cut: too dangerous on a single-node host, honestly deferred.",
      },
    ],
  },
  {
    slug: "self-hosting-on-k3s",
    title: "Self-hosting a portfolio on bare-metal k3s",
    date: "2026-07-01",
    summary:
      "gipc.dev runs on a single repurposed box: k3s behind a Cloudflare Tunnel with zero inbound ports, GitOps deploys, and full telemetry — all infrastructure-as-code in one repo.",
    tags: ["k3s", "Cloudflare Tunnel", "GitOps", "ArgoCD"],
    body: [
      {
        p: "This site is served from a single-node **k3s** cluster on repurposed hardware. There are **zero inbound ports**: a Cloudflare Tunnel dials out from the box, so nothing is exposed to the internet directly — the origin has no public IP surface at all.",
      },
      { h: "GitOps, not SSH" },
      {
        p: "Deploys are a merge, not a manual step. A push to `main` triggers a GitHub Actions build that pushes an image to GHCR and pins the tag into a kustomization; ArgoCD on the box reconciles the cluster to match git:",
      },
      {
        code: "push main → CI build → GHCR image → pin kustomization [skip ci] → ArgoCD sync → rolling update",
        lang: "text",
      },
      {
        p: "The frontend web app syncs automatically via ArgoCD; the Go core, being deploy-sensitive, is applied by the operator after CI pins it. `Caddy` sits in front as the in-cluster reverse proxy with `flush_interval -1` so Server-Sent Events stream through unbuffered.",
      },
      { h: "Observability on display" },
      {
        p: "Prometheus, Grafana and Loki run in an `observability` namespace and feed the public `/system` page — real request rate, p99 latency, resource usage, a deploy feed wired to the CI pipeline, and a redacted tail of the platform's own logs. The metrics you see are the box serving you the page.",
      },
      { h: "Everything is in the repo" },
      {
        ul: [
          "`infra/k8s/` — namespaces, deployments, services, NetworkPolicies, RBAC.",
          "`infra/argocd/` — the GitOps applications.",
          "`infra/cloudflared/` — the tunnel config.",
          "`.github/workflows/` — the build + deploy pipelines.",
        ],
      },
      {
        p: "The `/infra` page renders that same IaC on display — the manifests, the workflow, the tunnel — annotated. It's a portfolio that documents its own provisioning.",
      },
    ],
  },
  {
    slug: "the-construct-resume",
    title: "The Construct: a Matrix résumé",
    date: "2026-06-20",
    summary:
      "The /resume page is a static, ATS-safe document first — then, as a progressive enhancement, a Matrix-style decode layer. Plus an Ed25519-signed PDF you can verify in the browser.",
    tags: ["Next.js", "canvas", "a11y", "Ed25519"],
    body: [
      {
        p: "The résumé at `/resume` — the Construct — is a Matrix homage, but it never sacrifices substance for spectacle. The **static, selectable DOM résumé plus JSON-LD renders first**; the immersive layer is a progressive enhancement that low-tier and reduced-motion visitors never see, and that never blocks the content.",
      },
      { h: "Decode, don't dump" },
      {
        p: "The immersive layer is a **2D canvas** glyph-rain: green symbols cascade, then resolve character-by-character into the real Latin text as you scroll-descend through each résumé station. It's `requestAnimationFrame`-driven with a frame budget, and it honours `prefers-reduced-motion` — under reduced motion the text simply appears, no animation.",
      },
      { h: "Accessible by construction" },
      {
        ul: [
          "The real résumé text is in the SSR HTML — crawlable and screen-reader-first.",
          "JSON-LD structured data for the person + work.",
          "The decode is decorative; the accessible text is always present.",
          "axe: zero critical or serious across the page.",
        ],
      },
      { h: "Signed and verifiable" },
      {
        p: "The downloadable résumé PDF is **Ed25519-signed**. The page ships a client-side verifier: drop the PDF (or use the served copy) and the browser checks the detached signature against the **published public key** using WebCrypto — [verify it yourself](/resume). The private key never touches the client; signing is a local ceremony. It's authenticity you can check, not a claim you have to trust.",
      },
    ],
  },
];
