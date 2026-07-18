#!/usr/bin/env node
/**
 * Résumé fact drift-check — enforces cross-copy consistency of the THREE hand-maintained résumé
 * copies without generating one from another (a json→html generator would have to byte-reproduce the
 * hand-crafted ATS HTML that regen-resume.mjs renders the signed PDF from — too risky; see
 * plans/phase-2-resume-reconcile.md). Instead this asserts a small set of load-bearing FACTS appear
 * in every copy, so a future edit to one copy that forgets the others fails loudly.
 *
 *   resume/resume.json        — the site (via apps/web/data/resume.ts) + the AI RAG corpus + evals
 *   resume/resume.html        — the AUTHORITATIVE PDF-render input (regen-resume.mjs)
 *   resume/resume-master.md   — the human master
 *
 * ZERO-FABRICATION: every anchor below is a REAL résumé fact already present in the copies and
 * independently corroborated by apps/web/data/projects.json. This script never invents a claim; it
 * only checks that a true fact hasn't drifted out of one copy. Exit 1 on any drift.
 *
 *   node scripts/check-resume-drift.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resumeDir = join(here, "..", "resume");

// --- load ------------------------------------------------------------------
const jsonRaw = readFileSync(join(resumeDir, "resume.json"), "utf8");
const htmlRaw = readFileSync(join(resumeDir, "resume.html"), "utf8");
const mdRaw = readFileSync(join(resumeDir, "resume-master.md"), "utf8");

// JSON: parse + walk every string leaf so we compare CONTENT, not key names or formatting.
function jsonText(raw) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(JSON.parse(raw));
  return out.join(" ");
}

// Normalize a corpus so anchors compare cleanly across HTML/Markdown/JSON: decode the HTML entities
// the résumé.html carries (&nbsp; &amp; &times; &mdash; &rsquo; &lt; &gt; …), strip HTML tags, decode
// numeric entities, collapse whitespace, lowercase. Without this, an anchor near "IEEE&nbsp;Access"
// or inside "<b>…</b>" would false-positive against the html copy.
const ENTITIES = {
  "&nbsp;": " ", "&amp;": "&", "&times;": "x", "&mdash;": "—", "&ndash;": "–",
  "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“",
  "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&hellip;": "…",
};
function normalize(text) {
  let t = text;
  for (const [ent, ch] of Object.entries(ENTITIES)) t = t.split(ent).join(ch);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))); // numeric entities
  t = t.replace(/<[^>]+>/g, " "); // strip tags
  t = t.replace(/\s+/g, " ").toLowerCase();
  return t;
}

const COPIES = {
  "resume.json": normalize(jsonText(jsonRaw)),
  "resume.html": normalize(htmlRaw),
  "resume-master.md": normalize(mdRaw),
};

// --- anchors (must appear in ALL three copies) -----------------------------
// Lowercased to match normalize(). Each is a real, cross-copy-corroborated fact.
const ANCHORS = [
  "six databases",   // drowning SLR — projects.json:139 "six-database systematic review"
  "iterative fine-tuning", // transformer — projects.json:99/116 "14 iterative fine-tuning cycles" (full phrase, not bare "iterative", so an unrelated future "iterative" can't mask real drift — QA-CODE-a2 LOW)
  "48%",             // transformer baseline accuracy
  "60%",             // transformer peak accuracy
  "12.5m",           // seismic U-Net parameter count (12.5M)
  "2,000",           // seismic — 2,000 synthetic seismograms
  "15k",             // nina nails — ~15k LOC (deliberately ROUNDED; see guard below)
  "82 papers",       // drowning SLR — ~82 papers
];

// De-round / rewrite guard: the résumé copies DELIBERATELY round Nina to "~15k LOC" and OMIT the
// commit count. The un-rounded projects.json figures ("~15.1k LOC across 86 commits") must NEVER
// appear in a résumé copy — their presence would mean someone "reconciled" by de-rounding, i.e. a
// REWRITE, not a truth-fix. Absence is the invariant.
const FORBIDDEN = ["15.1k", "86 commits"];

// --- check -----------------------------------------------------------------
const failures = [];
for (const anchor of ANCHORS) {
  const missing = Object.entries(COPIES)
    .filter(([, text]) => !text.includes(anchor.toLowerCase()))
    .map(([name]) => name);
  if (missing.length) failures.push(`DRIFT: "${anchor}" missing from ${missing.join(", ")}`);
}
for (const bad of FORBIDDEN) {
  const present = Object.entries(COPIES)
    .filter(([, text]) => text.includes(bad.toLowerCase()))
    .map(([name]) => name);
  if (present.length) failures.push(`REWRITE-DRIFT: forbidden un-rounded "${bad}" appeared in ${present.join(", ")}`);
}

if (failures.length) {
  console.error("resume drift-check FAILED:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`resume drift-check OK — ${ANCHORS.length} facts consistent across ${Object.keys(COPIES).length} copies; ${FORBIDDEN.length} de-round guards clear.`);
