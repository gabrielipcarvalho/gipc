"use client";

import { useEffect, useState } from "react";

/* Echoes the misses path bash-style on the 404 page. SSR renders the generic
   fallback; the pathname fills in post-hydration (an update, not a mismatch). */
export function PathEcho() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    setPath(window.location.pathname);
  }, []);
  return <>command not found{path ? `: ${path}` : ""}</>;
}
