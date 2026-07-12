"use client";

import { useEffect, useState } from "react";

/* Home footer sign-off + (if earned) the Konami "last login" stamp and CTF badge. The base
   strip keeps the .footstrip class (print + base styles depend on it); the stamp/badge are added
   in an effect (SSR omits them → no hydration mismatch). */
export function FootSign() {
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [ctf, setCtf] = useState(false);

  useEffect(() => {
    try {
      const ll = localStorage.getItem("gipc-last-login");
      if (ll) setLastLogin(new Date(ll).toLocaleDateString());
      if (localStorage.getItem("gipc-ctf")) setCtf(true);
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <div className="footstrip">
      <p>gipc.dev · arcane palette · IBM Plex Mono · hex-sigil mark</p>
      <p className="foot-sign">
        // you&apos;ve reached the end of the console — <b>exit</b> won&apos;t save you
      </p>
      {(lastLogin || ctf) && (
        <p className="foot-meta">
          {lastLogin && <span>last login: {lastLogin}</span>}
          {ctf && <span className="foot-flag">◆ flag captured</span>}
        </p>
      )}
    </div>
  );
}
