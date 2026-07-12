import type { Metadata } from "next";
import Link from "next/link";
import { TerminalWindow } from "./components/TerminalWindow";
import { PathEcho } from "./components/PathEcho";

export const metadata: Metadata = {
  title: "404 · command not found — gipc.dev",
  description: "This path resolves to nothing on the gipc.dev operator console.",
};

export default function NotFound() {
  return (
    <main className="wrap page" tabIndex={-1}>
      <TerminalWindow path="~/lost">
        <p className="line">
          <span className="prompt">arcane@prod:~$</span> <PathEcho />
        </p>
        <h1 className="nf-title">404 — the weave holds nothing here</h1>
        <p className="page-lead">
          Whatever sigil you traced, it doesn&apos;t resolve. Try the console, or press{" "}
          <b className="nf-kbd">⌘K</b> and <i>goto</i> somewhere real.
        </p>
        <p className="nf-actions">
          <Link className="btn btn-primary" href="/">
            ▸ back to the console
          </Link>
        </p>
      </TerminalWindow>
    </main>
  );
}
