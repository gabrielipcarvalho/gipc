/* A decorative, hand-drawn-style "gipc" brand signature mark — NOT a facsimile of a legal handwritten
   signature. Static SVG (SSR-safe, crawlable). The stroke draws on via CSS (`.signature path` +
   @keyframes sig-draw); base style is fully drawn, so under reduced-motion (global animation reset) it
   renders complete + static. pathLength="1" normalises the draw timing without measuring the geometry. */
export function Signature() {
  return (
    <svg
      className="signature"
      viewBox="0 0 320 90"
      role="img"
      aria-label="gipc — signed"
      focusable="false"
    >
      <path
        pathLength={1}
        d="M18,62 C16,40 26,26 34,34 C40,40 34,58 28,64 C24,68 30,70 40,64
           M52,40 C52,52 52,60 52,62 M52,28 L52,30
           M70,46 C70,72 70,80 70,84 C70,70 74,44 86,44 C98,44 98,66 84,66 C76,66 72,58 72,52
           M132,50 C120,42 108,50 110,60 C112,70 128,70 132,58
           M150,66 C168,44 200,40 236,44 C270,48 296,56 302,62"
      />
    </svg>
  );
}
