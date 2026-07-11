/* Hex-sigil mark — hexagon enclosing a `>` prompt + `_` cursor; violet→cyan gradient.
   Matches design-system.md brand mark. */
export function Sigil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden>
      <defs>
        <linearGradient id="sigil-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b18cff" />
          <stop offset="1" stopColor="#34e6ff" />
        </linearGradient>
      </defs>
      <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" stroke="url(#sigil-g)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M38 38 L56 50 L38 62" stroke="#34e6ff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 64 H70" stroke="#b18cff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
