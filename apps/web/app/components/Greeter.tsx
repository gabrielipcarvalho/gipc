"use client";

import { useEffect, useState } from "react";
import type { RequestTrace } from "../../data/observability";

/* Privacy-respecting geo-greeter: reads COUNTRY ONLY from the existing /api/trace (which never echoes the
   visitor IP — colo/country only). Stores nothing, shows no number/IP, and renders null on any failure or
   unknown geo. Country name via Intl.DisplayNames + a flag emoji from the 2-letter code. */

function flagOf(code: string): string {
  try {
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  } catch {
    return "";
  }
}

function countryName(code: string): string | null {
  // guard BEFORE Intl.DisplayNames — .of("") throws; "XX" is Cloudflare's unknown-geo sentinel
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    if (!name || name === code || /unknown/i.test(name)) return null; // unknown region → no greeter
    return name;
  } catch {
    return null;
  }
}

export function Greeter() {
  const [place, setPlace] = useState<{ name: string; flag: string } | null>(null);

  useEffect(() => {
    let disposed = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/trace", { cache: "no-store", signal: ctrl.signal });
        if (!res.ok || disposed) return;
        const trace = (await res.json()) as RequestTrace;
        const name = countryName(trace.edge?.country ?? "");
        if (name && !disposed) setPlace({ name, flag: flagOf(trace.edge.country) });
      } catch {
        /* silent — greeter simply doesn't appear */
      }
    })();
    return () => {
      disposed = true;
      ctrl.abort();
    };
  }, []);

  if (!place) return null;
  return (
    <p className="foot-geo">
      a visitor from {place.flag && <span aria-hidden>{place.flag} </span>}
      {place.name}
    </p>
  );
}
