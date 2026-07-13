"use client";

import { usePathname } from "next/navigation";

/* Per-navigation entrance: a one-shot fade + translateY(12px)→0 (~180ms). App Router
   re-mounts template on every route change, replaying it. The keyframe has no forwards
   fill, so the wrapper rests at transform:none — critical because a LIVE transform on an
   ancestor would form the containing block for the Construct's position:fixed rain/cards.
   /resume is therefore skipped entirely (it has its own jack-in world-shift). Reduced-motion
   disables the animation globally → content just appears. */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/resume") return <>{children}</>;
  return <div className="route-enter">{children}</div>;
}
