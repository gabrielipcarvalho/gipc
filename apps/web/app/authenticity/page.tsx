import { TerminalWindow } from "../components/TerminalWindow";
import { SectionHeader } from "../components/SectionHeader";
import { AuthenticityPanel } from "../components/AuthenticityPanel";
import { pageMeta } from "../og";
import { AUTH_ASSETS } from "../../data/authenticity.generated";

export const metadata = pageMeta(
  "Authenticity — verify this build · gipc.dev",
  "A build-generated SHA-256 manifest of this site's stable assets, re-verified in your own browser. Tamper-evidence on display: what a green result proves, and honestly, what it can't.",
  "/authenticity",
);

const GH_MANIFEST =
  "https://github.com/gabrielipcarvalho/gipc/blob/main/apps/web/data/authenticity.generated.ts";

/* Server Component: the manifest table is SSR'd (crawlable); verification runs in the client
   island. Honesty is the whole point — the copy states the bound: a page cannot prove its own
   integrity against a fully compromised origin. No plaintext emails in the SSR HTML (Cloudflare
   Email Obfuscation rewrites them and breaks hydration — the fc28d86 lesson). */
export default function AuthenticityPage() {
  return (
    <main id="main" className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/authenticity">
        <SectionHeader marker="authenticity" title="Authenticity" />
        <p className="line type-line">
          <span className="prompt">arcane@prod:~$</span> sha256sum --check manifest
        </p>
        <p className="page-lead">
          Every build of this site bakes a SHA-256 manifest of its stable assets — the résumé PDF,
          its Ed25519 signature, the signing key, the icons. Your browser can re-fetch those exact
          bytes and hash them itself, right here. A green result means{" "}
          <strong>
            the bytes your browser just fetched match the manifest this build shipped
          </strong>{" "}
          — it cannot rule out a fully compromised origin, which could rewrite this page too. What
          this page really provides is <em>tamper-evidence</em>: mismatches (drift, CDN corruption,
          partial tampering) become visible instead of silent. For an independent cross-check, the
          same manifest is committed in the open:{" "}
          <a href={GH_MANIFEST}>authenticity.generated.ts on GitHub</a>.
        </p>

        <section aria-label="asset manifest" className="auth-block">
          <h2 className="iac-title">the manifest</h2>
          <div className="auth-tablewrap" tabIndex={0} role="region" aria-label="asset manifest table">
            <table className="auth-table">
              <thead>
                <tr>
                  <th scope="col">asset</th>
                  <th scope="col">bytes</th>
                  <th scope="col">sha-256</th>
                </tr>
              </thead>
              <tbody>
                {AUTH_ASSETS.map((a) => (
                  <tr key={a.path}>
                    <td>
                      <a href={a.path}>{a.path}</a>
                    </td>
                    <td>{a.bytes.toLocaleString("en-AU")}</td>
                    <td>
                      <code>{a.sha256}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="auth-note">
            Scope: the stable, human-downloaded artifacts. Next.js&apos;s own <code>/_next</code>{" "}
            assets use build-hashed filenames (cache-correctness, not browser-verified integrity)
            — out of scope here. The manifest proves served-bytes integrity; the résumé&apos;s{" "}
            Ed25519 signature proves offline authorship — complementary, not the same claim. The
            signature itself is verifiable on <a href="/connect">/connect</a> (drop your downloaded
            copy on the verifier).
          </p>
        </section>

        <section aria-label="verify" className="auth-block">
          <h2 className="iac-title">verify in your browser</h2>
          <AuthenticityPanel />
        </section>
      </TerminalWindow>
    </main>
  );
}
