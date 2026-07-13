/* Route registry — single source of truth for the primary nav + the ⌘K palette.
   Home (`/`) is deliberately excluded here (it's the brand link); goto-home lives
   as an explicit palette command. */
export type Route = { href: string; label: string };

export const ROUTES: readonly Route[] = [
  { href: "/system", label: "system" },
  { href: "/status", label: "status" },
  { href: "/infra", label: "infra" },
  { href: "/work", label: "work" },
  { href: "/timeline", label: "timeline" },
  { href: "/resume", label: "resume" },
  { href: "/connect", label: "connect" },
];
