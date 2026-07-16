"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ROUTES } from "./routes";
import { THEMES, applyTheme } from "../../data/themes";

/* ⌘K command palette (client). Overlay dialog — no portal; rendered as a fixed sibling
   in <body> via the layout, so it's SSR/`next build` safe. Opens on ⌘K/Ctrl-K or the
   `gipc:palette` window event (nav button / touch); closes on Esc, backdrop, route change,
   or running a command. Focus-trapped (input is the only tabbable); background gets `inert`.
   Combobox + listbox a11y with aria-activedescendant. */
type Cmd = { id: string; label: string; hint?: string; run: () => void };

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const shouldRestore = useRef(false);
  const focusConsoleIntent = useRef(false);
  const openRef = useRef(false);
  const listId = useId();

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // --- command set (navigation-first; whoami stays a console command) -------
  const commands: Cmd[] = useMemo(() => {
    const go = (href: string) => () => {
      // A same-route goto fires no navigation event, so RouteFocus won't move focus —
      // restore it to the trigger. A cross-route close lets RouteFocus focus the new <main>.
      if (href === pathname) shouldRestore.current = true;
      setOpen(false); // M-a: close imperatively so same-route goto still dismisses
      router.push(href);
    };
    const routeCmds = ROUTES.map<Cmd>((r) => ({
      id: `goto:${r.href}`,
      label: `goto ${r.label}`,
      hint: r.href,
      run: go(r.href),
    }));
    return [
      { id: "goto:/", label: "goto home", hint: "/", run: go("/") },
      ...routeCmds,
      // /meet is a CTA sub-action of /connect (not a top-nav section), so it's palette-only, not in ROUTES.
      { id: "goto:/meet", label: "goto meet", hint: "book a call", run: go("/meet") },
      // /authenticity is a trust artifact, not a destination — palette-only, same rationale.
      { id: "goto:/authenticity", label: "goto authenticity", hint: "verify this build", run: go("/authenticity") },
      {
        id: "open-console",
        label: "open console",
        hint: "help lives here",
        // Focus is resolved in the close-effect cleanup (after inert lifts): same-route
        // focuses #console-input directly; cross-route flags it for RouteFocus. Never
        // focus here — the background is still inert and setOpen(false) hasn't flushed.
        run: () => {
          focusConsoleIntent.current = true;
          setOpen(false);
          router.push("/");
        },
      },
      ...THEMES.map<Cmd>((t) => ({
        id: `theme:${t.id}`,
        label: `theme · ${t.id}`,
        hint: "re-skin",
        // theme navigates nowhere → restore focus to the trigger on close
        run: () => {
          applyTheme(t.id);
          shouldRestore.current = true;
          setOpen(false);
        },
      })),
    ];
  }, [router, pathname]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  // M-d: reset selection when the query changes; clamp to the current result set
  useEffect(() => {
    setSel(0);
  }, [query]);
  const selIndex = results.length ? Math.min(sel, results.length - 1) : -1;

  // --- open / close ---------------------------------------------------------
  const openPalette = useCallback(() => {
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setQuery("");
    setSel(0);
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    shouldRestore.current = true; // Esc / backdrop → return focus to the trigger
    setOpen(false);
  }, []);

  // global ⌘K / Ctrl-K (toggle) + the nav's custom event (open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) dismiss();
        else openPalette();
      }
    };
    const onEvt = () => openPalette();
    window.addEventListener("keydown", onKey);
    window.addEventListener("gipc:palette", onEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gipc:palette", onEvt);
    };
  }, [openPalette, dismiss]);

  // close on route change (RouteFocus then moves focus to the new page's <main>)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // when open: trap the background (inert), lock scroll, focus the input; on close,
  // undo all of that and restore focus to the trigger IF this was an Esc/backdrop close
  useEffect(() => {
    if (!open) return;
    const shell = document.getElementById("app-shell");
    // `inert` removes the background from tab order AND the a11y tree — so no separate
    // aria-hidden is needed (and setting aria-hidden while a descendant still holds focus
    // trips a Chrome warning). Set inert, then move focus out to the palette input.
    shell?.setAttribute("inert", "");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      shell?.removeAttribute("inert"); // lift inert BEFORE moving focus back into the shell
      document.body.style.overflow = prevOverflow;
      if (shouldRestore.current) {
        shouldRestore.current = false;
        restoreRef.current?.focus();
        return;
      }
      if (focusConsoleIntent.current) {
        focusConsoleIntent.current = false;
        // inert is lifted now. Same-route: Console is mounted → focus its input directly.
        // Cross-route: it isn't mounted yet → flag it so RouteFocus (which runs last after
        // the route commits) focuses it without another effect stealing focus to <main>.
        const input = document.getElementById("console-input");
        if (input) input.focus();
        else {
          try {
            sessionStorage.setItem("gipc-focus-console", "1");
          } catch {
            /* storage may be unavailable */
          }
        }
      }
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selIndex >= 0) results[selIndex].run(); // M-d: no-op on empty results
    } else if (e.key === "Tab") {
      e.preventDefault(); // focus trap: input is the only tabbable element
    }
  };

  if (!open) return null;

  return (
    <div
      className="palette"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="palette-box" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={results.length ? listId : undefined}
          aria-activedescendant={selIndex >= 0 ? `${listId}-${selIndex}` : undefined}
          aria-label="Command palette input"
          placeholder="type a command…  (goto work · open console)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
        {results.length ? (
          <ul className="palette-list" id={listId} role="listbox" aria-label="Commands">
            {results.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selIndex}
                className="palette-opt"
                onMouseMove={() => setSel(i)}
                onClick={() => c.run()}
              >
                <span>{c.label}</span>
                {c.hint && <span className="hint">{c.hint}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="palette-empty" role="status">
            no commands match “{query.trim()}”.
          </p>
        )}
      </div>
    </div>
  );
}
