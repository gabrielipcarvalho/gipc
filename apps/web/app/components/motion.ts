/* Shared motion utils — pointer-driven micro-motion motifs (design-system.md).
   Plain functions (no hooks); call only from client-component handlers. Every effect
   no-ops under prefers-reduced-motion, and the CSS side degrades to invisible/static. */

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Cast-ripple: soft violet radial ripple (~480ms) from the pointer position. The button
   renders an empty <span class="ripple-host" aria-hidden /> that React never fills —
   imperative children appended there are outside reconciliation (standard ripple-root
   pattern), and unmounting the button removes host + ripples together. */
export function castRipple(e: React.PointerEvent<HTMLElement>) {
  if (prefersReducedMotion()) return;
  const host = e.currentTarget.querySelector(":scope > .ripple-host");
  if (!(host instanceof HTMLElement)) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.1;
  const span = document.createElement("span");
  span.className = "ripple";
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${e.clientX - rect.left - size / 2}px`;
  span.style.top = `${e.clientY - rect.top - size / 2}px`;
  const remove = () => span.remove();
  span.addEventListener("animationend", remove, { once: true });
  span.addEventListener("animationcancel", remove, { once: true }); // RM flip mid-ripple
  host.appendChild(span);
}

/* Tilt: subtle 3D tilt (±maxDeg, perspective 800px in CSS) following the pointer.
   Sets --tilt-x/--tilt-y on the element; leave always resets. Transform-only (cheap). */
export function tiltHandlers(maxDeg = 6) {
  return {
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (prefersReducedMotion()) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 … 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty("--tilt-x", `${(-py * 2 * maxDeg).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(px * 2 * maxDeg).toFixed(2)}deg`);
    },
    onPointerLeave(e: React.PointerEvent<HTMLElement>) {
      const el = e.currentTarget;
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    },
  };
}
