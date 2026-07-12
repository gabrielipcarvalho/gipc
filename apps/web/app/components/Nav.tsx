"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sigil } from "../sigil";
import { ROUTES } from "./routes";

/* Primary top nav — brand (→ home) + route links with active state + a ⌘K affordance
   (dispatches a window event the CommandPalette listens for, so touch users have a way
   in). One fixed-height row; links scroll horizontally rather than wrap on narrow screens. */
export function Nav() {
  const pathname = usePathname();
  const openPalette = () => window.dispatchEvent(new CustomEvent("gipc:palette"));

  return (
    <nav className="nav" aria-label="Primary">
      <Link href="/" className="nav-brand" aria-label="arcane — home">
        <Sigil className="nav-sigil" />
        <span className="nav-word">arcane</span>
      </Link>
      <ul className="nav-links">
        {ROUTES.map((r) => {
          const active = pathname === r.href;
          return (
            <li key={r.href}>
              <Link
                href={r.href}
                className={`nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {r.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="nav-cmdk"
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-label="Open command palette"
      >
        <kbd>⌘K</kbd>
      </button>
    </nav>
  );
}
