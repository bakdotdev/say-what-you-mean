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

/** Works with both the Web Request (edge) and Node's IncomingMessage. */
const header = (req, name) =>
  typeof req.headers?.get === "function"
    ? req.headers.get(name)
    : (req.headers?.[name] ?? null)

export const originAllowed = (req) => {
  const origin = header(req, "origin")
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
  header(req, "x-real-ip") ||
  header(req, "x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown"
