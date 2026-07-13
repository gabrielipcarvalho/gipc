#!/usr/bin/env node
/**
 * Detached Ed25519 signature for the résumé PDF.
 *
 * Outputs (PUBLIC, committed):
 *   apps/web/public/Gabriel_Carvalho_Resume.pdf.sig   64-byte raw Ed25519 signature
 *   apps/web/public/resume-pubkey.spki                SPKI DER public key
 *
 * The PRIVATE key is NEVER committed. One-time ceremony (Gabriel, out of band):
 *   RESUME_SIGN_INIT=1 node apps/web/scripts/sign-resume.mjs   # generates + signs
 * Thereafter, after re-rendering the PDF:
 *   node apps/web/scripts/sign-resume.mjs                      # re-signs
 * Key location: $RESUME_SIGN_KEY (a PEM path) or apps/web/.keys/resume-ed25519.pem (gitignored).
 *
 * With NO key and no INIT the résumé ships UNSIGNED (dev) — the build is never blocked.
 */
import { generateKeyPairSync, sign, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const pub = join(webRoot, "public");
const pdfPath = join(pub, "Gabriel_Carvalho_Resume.pdf");
const keyPath = process.env.RESUME_SIGN_KEY ?? join(webRoot, ".keys", "resume-ed25519.pem");

if (!existsSync(pdfPath)) {
  console.error(`no résumé PDF at ${pdfPath} — nothing to sign`);
  process.exit(1);
}

let privateKey;
if (existsSync(keyPath)) {
  privateKey = createPrivateKey(readFileSync(keyPath));
} else if (process.env.RESUME_SIGN_INIT === "1") {
  const kp = generateKeyPairSync("ed25519");
  privateKey = kp.privateKey;
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, kp.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`generated signing key → ${keyPath} (KEEP PRIVATE — never commit)`);
} else {
  console.warn(
    "no signing key — résumé ships UNSIGNED (dev).\n" +
      "  run once:  RESUME_SIGN_INIT=1 node apps/web/scripts/sign-resume.mjs",
  );
  process.exit(0); // never block the build
}

const pdf = readFileSync(pdfPath);
const signature = sign(null, pdf, privateKey); // 64-byte raw Ed25519
const spki = createPublicKey(privateKey).export({ type: "spki", format: "der" });

writeFileSync(`${pdfPath}.sig`, signature);
writeFileSync(join(pub, "resume-pubkey.spki"), spki);
console.log(
  `signed: public/Gabriel_Carvalho_Resume.pdf.sig (${signature.length}B) + ` +
    `public/resume-pubkey.spki (${spki.length}B) — commit both`,
);
