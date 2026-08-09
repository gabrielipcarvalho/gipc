/* Route registry — single source of truth for the primary nav + the ⌘K palette.
   Home (`/`) is deliberately excluded here (it's the brand link); goto-home lives
   as an explicit palette command. */
export type Route = { href: string; label: string };

/* Sprint N: recruiter-first order — career surfaces lead, the engineering depths follow. */
export const ROUTES: readonly Route[] = [
  { href: "/work", label: "work" },
  { href: "/resume", label: "resume" },
  { href: "/timeline", label: "timeline" },
  { href: "/system", label: "system" },
  { href: "/oracle", label: "oracle" },
  { href: "/lab", label: "lab" },
  { href: "/infra", label: "infra" },
  { href: "/status", label: "status" },
  { href: "/writeups", label: "writeups" },
  { href: "/connect", label: "connect" },
];
