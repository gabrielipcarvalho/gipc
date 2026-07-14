"use client";

import { useEffect, useRef, useState } from "react";
import { OracleChat } from "./OracleChat";
import { JdAnalyzer } from "./JdAnalyzer";

/* Two modes on /oracle: Ask (chat) and Analyze a JD. Only the ACTIVE panel is mounted — mounting both
   would run two Turnstile widgets racing tokens and keep a hidden chat stream alive. Standard ARIA tabs. */

type Tab = "ask" | "jd";
const TABS: { id: Tab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "jd", label: "Analyze a JD" },
];

export function OracleTabs() {
  const [tab, setTab] = useState<Tab>("ask");
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // ?tab=jd opens the JD analyzer directly (read post-mount — keeps /oracle static)
    if (new URLSearchParams(window.location.search).get("tab") === "jd") setTab("jd");
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
        {tab === "ask" ? <OracleChat /> : <JdAnalyzer />}
      </div>
    </div>
  );
}
