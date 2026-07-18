"use client";

import { useEffect, useRef, useState } from "react";
import { OracleChat } from "./OracleChat";
import { JdAnalyzer } from "./JdAnalyzer";
import { JdTailor } from "./JdTailor";
import { LocalInfer } from "./LocalInfer";

/* Four modes on /oracle: Ask (chat), Analyze a JD, Tailor a résumé to a JD, and the self-hosted Local
   model demo. Only the ACTIVE panel is mounted — mounting more would race Turnstile widgets and keep
   hidden streams alive. Standard ARIA tabs. */

type Tab = "ask" | "jd" | "tailor" | "local";
const TABS: { id: Tab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "jd", label: "Analyze a JD" },
  { id: "tailor", label: "Tailor résumé" },
  { id: "local", label: "Local model" },
];

export function OracleTabs() {
  const [tab, setTab] = useState<Tab>("ask");
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // ?tab=jd|tailor|local deep-links a panel directly (read post-mount — keeps /oracle static)
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "jd" || t === "tailor" || t === "local") setTab(t);
  }, []);

  function onKey(e: React.KeyboardEvent, i: number) {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    btnRefs.current[next]?.focus();
  }

  return (
    <div className="oracle-tabs">
      <div role="tablist" aria-label="oracle mode" className="oracle-tablist">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="oracle-tabpanel"
            tabIndex={tab === t.id ? 0 : -1}
            className={`oracle-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="oracle-tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="oracle-tabpanel"
      >
        {tab === "ask" ? (
          <OracleChat />
        ) : tab === "jd" ? (
          <JdAnalyzer />
        ) : tab === "tailor" ? (
          <JdTailor />
        ) : (
          <LocalInfer />
        )}
      </div>
    </div>
  );
}
