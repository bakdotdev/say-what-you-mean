/**
 * Writes a mundane, human-readable paragraph to use as a carrier.
 *
 * Deliberately boring: the whole point is text nobody looks twice at. The
 * model gets a topic and a word count; the codec then decides which few words
 * must change, and /api/rewrite picks the replacements. Generation itself
 * carries no constraint, which is what keeps the prose natural.
 *
 * Protections mirror /api/rewrite: same-origin only, capped output, per-IP
 * token bucket.
 */

import { originAllowed, clientIp } from "./_origin.js"

export const config = { runtime: "edge" }

const MODEL = "anthropic/claude-haiku-4.5"
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions"

const MIN_WORDS = 60
const MAX_WORDS = 320

const RATE_CAPACITY = 8
const RATE_WINDOW_MS = 60_000
const buckets = new Map()

const withinRateLimit = (ip) => {
  const now = Date.now()
  const bucket = buckets.get(ip)
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 })
    if (buckets.size > 5000) buckets.clear()
    return true
  }
  bucket.count += 1
  return bucket.count <= RATE_CAPACITY
}

const SYSTEM = `You write short, utterly ordinary prose — the kind of thing
someone types without thinking. A note about their day, an errand, the
weather, a small domestic detail.

Rules:
- Plain everyday vocabulary. Common words, simple sentences.
- No names of real people, no places that identify anyone, no numbers that
  look like data. Nothing memorable or quotable.
- No lists, headings, quotes, emoji or markdown. Just flowing sentences.
- Do not mention writing, messages, secrets, codes or this task.
- Return ONLY the paragraph text.`

/**
 * When the caller supplies an allowed vocabulary, composition itself is
 * constrained rather than the text being repaired afterwards. Writing fluently
 * inside a large word list produces far better prose than swapping words out
 * of finished sentences.
 */
const VOCAB_SYSTEM = `You write short, utterly ordinary prose using ONLY words
from a supplied list.

Rules:
- EVERY word you write must appear in the list. This is absolute. If a word is
  not in the list you may not use it, however natural it would be.
- The list is large and contains ordinary English, so write real sentences:
  a note about the day, an errand, the weather, a domestic detail.
- Prefer sense over ambition. Short, plain sentences that genuinely read well
  are the goal; do not force unusual words in.
- No names of real people, no numbers, nothing memorable or quotable.
- No lists, headings, quotes, emoji or markdown.
- Do not mention writing, messages, secrets, codes or this task.
- Return ONLY the paragraph text.`

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405)

  if (!originAllowed(req)) return json({ error: "forbidden" }, 403)

  const ip = clientIp(req)
  if (!withinRateLimit(ip))
    return json({ error: "rate limited — try again shortly" }, 429)

  const key = process.env.AI_GATEWAY_API_KEY
  if (!key) return json({ error: "AI_GATEWAY_API_KEY not configured" }, 500)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid json" }, 400)
  }

  const words = Math.min(
    MAX_WORDS,
    Math.max(MIN_WORDS, Number(body?.words) || 160),
  )
  const topic = String(body?.topic ?? "an ordinary afternoon").slice(0, 80)
  // Optional allowed vocabulary — capped so the prompt stays sane.
  const allowedWords = Array.isArray(body?.allowed)
    ? body.allowed
        .slice(0, 3000)
        .map((w) => String(w).slice(0, 24))
        .filter(Boolean)
    : []

  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: allowedWords.length ? VOCAB_SYSTEM : SYSTEM,
          },
          {
            role: "user",
            content: allowedWords.length
              ? `Allowed words (use only these):\n${allowedWords.join(" ")}\n\nWrite about ${topic}. Aim for roughly ${words} words — better slightly long than short.`
              : `Write about ${topic}. Aim for roughly ${words} words — it is better to run slightly long than short.`,
          },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      return json(
        { error: `gateway ${res.status}`, detail: detail.slice(0, 300) },
        502,
      )
    }

    const data = await res.json()
    const text = (data.choices?.[0]?.message?.content ?? "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!text) return json({ error: "empty completion" }, 502)

    return json({ carrier: text })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "request failed" },
      502,
    )
  }
}
