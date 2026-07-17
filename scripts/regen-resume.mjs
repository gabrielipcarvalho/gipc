#!/usr/bin/env node
/**
 * b3 — one-click résumé regeneration.  `npm run regen:resume`  (add --force to always re-render)
 *
 * Renders the ATS résumé PDF from resume/resume.html (Chrome headless print-to-PDF — the same
 * path that produced the committed PDF: Skia/PDF, 2 pages, A4), keeps both committed copies in
 * sync, signs it (Ed25519, via sign-resume.mjs), regenerates the /authenticity manifest, and
 * verifies the whole trust chain. Zero dependencies: system Chrome + node stdlib.
 *
 * IDEMPOTENT: if the freshly-rendered content matches the committed PDF (ignoring Chrome's
 * per-run /ID + timestamps), it changes nothing and exits — so a needless run never churns the
 * live signed artifact. --force re-renders regardless.
 *
 * resume/resume.html is the AUTHORITATIVE render input. resume/resume.json and resume-master.md
 * are parallel hand-maintained copies, NOT upstream — confirm html reflects json before shipping.
 *
 * Requires the signing key ($RESUME_SIGN_KEY or apps/web/.keys/resume-ed25519.pem). Without it
 * b3 hard-fails BEFORE touching anything — the /authenticity manifest requires a published
 * signature, so there is no consistent unsigned artifact set to emit. The private key is never
 * read, moved, or logged here — only delegated to sign-resume.mjs.
 *
 * Env: $CHROME overrides the Chrome/Chromium binary path (default: the macOS app bundle).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
let tmp = null; // temp render dir — cleaned up on EVERY exit path (die + normal)
const cleanup = () => { if (tmp) { rmSync(tmp, { recursive: true, force: true }); tmp = null; } };
const die = (msg) => { cleanup(); console.error(`✗ ${msg}`); process.exit(1); };

// --- paths (all resolved from the script location, never cwd) ---
const htmlPath = join(repoRoot, "resume", "resume.html");
const pdfResume = join(repoRoot, "resume", "Gabriel_Carvalho_Resume.pdf");
const pdfPublic = join(repoRoot, "apps", "web", "public", "Gabriel_Carvalho_Resume.pdf");
const sigPath = `${pdfPublic}.sig`;
const spkiPath = join(repoRoot, "apps", "web", "public", "resume-pubkey.spki");
const signScript = join(repoRoot, "apps", "web", "scripts", "sign-resume.mjs");
const manifestScript = join(repoRoot, "apps", "web", "scripts", "gen-authenticity.mjs");
const keyPath = process.env.RESUME_SIGN_KEY ?? join(repoRoot, "apps", "web", ".keys", "resume-ed25519.pem");

// --- 1. Chrome ---
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) die(`Chrome not found at ${chrome} — set $CHROME to your Chrome/Chromium binary.`);

// --- 1b. signing key pre-flight (BEFORE any render/overwrite — no half-mutated tree) ---
if (!existsSync(keyPath)) {
  die(
    `no signing key at ${keyPath} — b3 needs it: the /authenticity manifest requires a published\n` +
      `  signature, so b3 cannot emit a consistent artifact set unsigned. Generate once with:\n` +
      `  RESUME_SIGN_INIT=1 node apps/web/scripts/sign-resume.mjs   (or set $RESUME_SIGN_KEY)`,
  );
}

// --- 2. source ---
if (!existsSync(htmlPath)) die(`no résumé source at ${htmlPath} — nothing to render.`);

// --- 3. render to a temp file ---
tmp = mkdtempSync(join(tmpdir(), "gipc-resume-"));
const tmpPdf = join(tmp, "out.pdf");
try {
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
    `--print-to-pdf=${tmpPdf}`, `file://${htmlPath}`,
  ], { stdio: ["ignore", "ignore", "pipe"] });
} catch (e) {
  die(`Chrome render failed: ${String(e.stderr ?? e).slice(0, 200)}`); // die() cleans up tmp
}

// validate the TEMP render before it can overwrite anything
const rendered = existsSync(tmpPdf) ? readFileSync(tmpPdf) : null;
const validate = (buf, label) => {
  if (!buf || buf.length < 51200) die(`${label}: render too small (${buf?.length ?? 0}B < 50KB) — blank/failed.`);
  if (!buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) die(`${label}: not a PDF (bad header).`);
  const m = buf.toString("latin1").match(/\/Count\s+(\d+)/); // cleartext; /Type /Page is in compressed streams
  if (!m || Number(m[1]) < 1) die(`${label}: no /Count page marker — render incomplete.`);
  return Number(m[1]);
};
const pages = validate(rendered, "rendered PDF");

// --- 3c. idempotence gate: compare content ignoring Chrome's volatile /ID + timestamps ---
const stripVolatile = (buf) =>
  buf.toString("latin1")
    .replace(/\/ID\s*\[[^\]]*\]/g, "")
    .replace(/\/CreationDate\s*\([^)]*\)/g, "")
    .replace(/\/ModDate\s*\([^)]*\)/g, "");
const jsonReminder =
  "  ↳ rendered from resume/resume.html (the authoritative layout). A resume.json-only edit\n" +
  "    won't appear here — confirm resume.html reflects resume.json before shipping.";

if (!force && existsSync(pdfPublic) && stripVolatile(rendered) === stripVolatile(readFileSync(pdfPublic))) {
  cleanup();
  console.log("✓ résumé PDF already current — nothing to regenerate (use --force to re-render).");
  console.log(jsonReminder);
  process.exit(0);
}

// --- 4. commit the render to both copies ---
copyFileSync(tmpPdf, pdfResume);
copyFileSync(tmpPdf, pdfPublic);
cleanup();

// --- 5. sign (delegates to the signer; abort on any non-zero exit — a corrupt key throws) ---
try {
  execFileSync("node", [signScript], { stdio: "inherit" });
} catch {
  die("sign-resume.mjs failed — aborting before the manifest (no inconsistent triple).");
}
if (!existsSync(sigPath)) die("no signature produced — refusing to publish an unsigned manifest.");

// --- 6. regenerate the /authenticity manifest ---
try {
  execFileSync("node", [manifestScript], { stdio: "inherit" });
} catch {
  die("gen-authenticity.mjs failed — the manifest is now stale; re-run before committing.");
}

// --- 7. verify the trust chain b3 just produced ---
const pdf = readFileSync(pdfPublic);
const pdfHash = createHash("sha256").update(pdf).digest("hex");
const manifest = readFileSync(join(repoRoot, "apps", "web", "data", "authenticity.generated.ts"), "utf8");
if (!manifest.includes(pdfHash)) die(`manifest PDF hash mismatch — expected ${pdfHash.slice(0, 12)}… in the generated manifest.`);
// sig↔PDF crypto verify (gate on the .sig existing, not on key presence — catches a stale sig)
const pubKey = createPublicKey({ key: readFileSync(spkiPath), format: "der", type: "spki" });
if (!edVerify(null, pdf, pubKey, readFileSync(sigPath))) die("signature does NOT verify against the published pubkey over the new PDF.");

console.log(
  `✓ regenerated: ${pages}pp, ${pdf.length}B, sha256 ${pdfHash.slice(0, 12)}… — signed + manifest + verified.`,
);
console.log(jsonReminder);
