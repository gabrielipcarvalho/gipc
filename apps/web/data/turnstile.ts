// Turnstile is a build-time public config. The official TEST site key renders a "For testing only"
// widget and isn't real bot protection — so treat it (and an unset key) as OFF: no widget, no token
// required (the server runs the same graceful mode; per-IP limits + the daily budget breaker protect).
// A REAL site key turns the full bot-gate on (client widget + server verify).

const TEST_SITE_KEY = "1x00000000000000000000AA";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export const TURNSTILE_ON = TURNSTILE_SITE_KEY !== "" && TURNSTILE_SITE_KEY !== TEST_SITE_KEY;
