/**
 * Origin allow-list shared by the API routes.
 *
 * Comparing the request Origin to `new URL(req.url).host` does NOT work here:
 * the app is served from lab.bak.dev but proxied to the project's own
 * *.vercel.app host, so the two never match and every browser request 403s.
 * (A curl check misses this entirely, because curl sends no Origin header and
 * the check is skipped.)
 *
 * So match against the hosts this app is actually served from.
 */

const ALLOWED_SUFFIXES = [".bak.dev", ".vercel.app"]
const ALLOWED_EXACT = ["bak.dev", "localhost"]

export const originAllowed = (req) => {
  const origin = req.headers.get("origin")
  // No Origin (same-origin form posts, curl, server-to-server) — nothing to check.
  if (!origin) return true
  let host
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }
  if (ALLOWED_EXACT.includes(host)) return true
  if (host === "127.0.0.1" || host.endsWith(".localhost")) return true
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/** Client IP for rate limiting, best-effort. */
export const clientIp = (req) =>
  req.headers.get("x-real-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown"
