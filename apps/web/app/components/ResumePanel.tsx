"use client";

import { useEffect, useRef, useState } from "react";

/* Résumé surface — inline native preview (lazy), download, and a live signature status +
   drop-a-file Ed25519 verify (client WebCrypto against the PUBLIC key). When no signature is
   published (unsigned-dev build) the status says so and the verify control is hidden — no
   "signed"/"verify" claim is ever shown in that state. No secret touches the client. */
const PDF = "/Gabriel_Carvalho_Resume.pdf";
const SIG = `${PDF}.sig`;
const PUBKEY = "/resume-pubkey.spki";

type SigState = "checking" | "signed" | "unsigned";
type VerifyResult = null | "pass" | "fail" | "unsupported" | "error";

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export function ResumePanel() {
  const [status, setStatus] = useState<SigState>("checking"); // neutral until fetch resolves
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<VerifyResult>(null);
  const sigRef = useRef<Uint8Array | null>(null);
  const pubRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let done = false;
    (async () => {
      const [sig, pub] = await Promise.all([fetchBytes(SIG), fetchBytes(PUBKEY)]);
      if (done) return;
      if (sig && pub) {
        sigRef.current = sig;
        pubRef.current = pub;
        setStatus("signed");
      } else {
        setStatus("unsigned");
      }
    })();
    return () => {
      done = true;
    };
  }, []);

  async function verify(file: File) {
    setResult(null);
    if (!window.crypto?.subtle) {
      setResult("unsupported");
      return;
    }
    const sig = sigRef.current;
    const pub = pubRef.current;
    if (!sig || !pub) {
      setResult("error");
      return;
    }
    let key: CryptoKey;
    try {
      key = await window.crypto.subtle.importKey("spki", pub, { name: "Ed25519" }, false, ["verify"]);
    } catch {
      setResult("unsupported"); // importKey rejects async for an unsupported curve
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ok = await window.crypto.subtle.verify("Ed25519", key, sig, bytes);
      setResult(ok ? "pass" : "fail");
    } catch {
      setResult("error"); // file read / verify failure — not a browser-support problem
    }
  }

  return (
    <div className="resume-panel">
      <div className="resume-actions">
        <a className="btn btn-primary" href={PDF} download>
          ▸ download résumé (PDF)
        </a>
        <button
          className="btn btn-ghost"
          type="button"
          aria-expanded={open}
          aria-controls="resume-preview"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "hide preview" : "preview inline"}
        </button>
      </div>

      {open && (
        <div id="resume-preview" className="resume-preview">
          <object data={`${PDF}#view=FitH`} type="application/pdf" className="resume-frame" aria-label="Résumé PDF preview">
            <p className="resume-hint">
              inline preview unavailable — <a href={PDF} download>download the PDF</a> instead.
            </p>
          </object>
          <p className="resume-hint">
            preview not loading (common on mobile)? <a href={PDF} download>download it →</a>
          </p>
        </div>
      )}

      <p className="resume-status" role="status">
        {status === "checking" && <span className="rs-muted">checking signature…</span>}
        {status === "unsigned" && (
          <span className="rs-muted">unsigned (dev build) — signature not published yet</span>
        )}
        {status === "signed" && <span className="rs-ok">✓ signed — verify a downloaded copy below</span>}
      </p>

      {status === "signed" && (
        <div
          className="resume-verify"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) verify(f);
          }}
        >
          <label className="resume-drop">
            <span>drop or choose the PDF you downloaded to verify it against the published signature</span>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) verify(f);
              }}
            />
          </label>
          {result === "pass" && (
            <p className="rs-ok" role="status">✓ authentic — signed by gipc.dev</p>
          )}
          {result === "fail" && (
            <p className="rs-err" role="status">✗ does not match the published signature</p>
          )}
          {result === "unsupported" && (
            <p className="rs-muted" role="status">verification unsupported in this browser</p>
          )}
          {result === "error" && <p className="rs-muted" role="status">could not load the signature</p>}
        </div>
      )}
    </div>
  );
}
