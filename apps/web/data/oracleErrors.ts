// Shared honest-error mapping for the oracle chat + JD analyzer + résumé tailor. Keys are the exact
// `error` strings the services/ai backend returns (routes/oracle.py, routes/jd.py, routes/variant.py);
// everything else falls to a generic line.

export function mapOracleError(status: number, code?: string): string {
  switch (code) {
    case "oracle not configured":
      return "the oracle isn't awakened yet — no key bound.";
    case "the oracle rests — daily budget spent":
    case "the oracle is temporarily unavailable":
      return `${code}.`;
    case "résumé temporarily unavailable":
      return "the résumé is momentarily unavailable — try again.";
    case "the oracle is busy":
      return "the oracle is busy — try again in a moment.";
    case "local model offline":
      return "local model offline — the self-hosted engine isn't rolled out yet, or is down.";
    case "local model busy":
      return "the local model is mid-generation for someone else — try again in a moment.";
    case "couldn't analyze that JD — try again":
      return "couldn't analyze that JD — try again.";
    case "empty job description":
      return "paste a job description first.";
  }
  if (status === 404) return "local model offline — the self-hosted engine isn't rolled out yet, or is down.";
  if (status === 403 || code === "turnstile") return "verification failed — solve the check and retry.";
  if (status === 429 || code === "rate limited") return "too many requests — slow down a moment.";
  return "the oracle faltered.";
}
