/**
 * Picks the best-reading replacement word for each slot the codec requires to
 * change.
 *
 * Design note — this deliberately does NOT ask the model to rewrite the
 * paragraph. Matrix embedding's syndrome depends on the parity of EVERY word,
 * so any word the model touches beyond the planned slots invalidates the plan.
 * Earlier versions invited exactly that ("reword surrounding phrasing freely")
 * and could not converge.
 *
 * Instead the model does the one thing code cannot — judge which candidate
 * reads best in context — and returns a pure mapping. The client applies the
 * substitutions itself, at exact offsets, so only the planned slots ever
 * change and the result is correct by construction.
 *
 * Protections: same-origin only, small body caps, and a per-IP token bucket.
 */

import { checkBotId } from "botid/server"
import { originAllowed, clientIp } from "./_origin.js"

export const config = { runtime: "edge" }

const MODEL = "anthropic/claude-haiku-4.5"
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions"

// Durable carriers run ~700 words per pass and accumulate across passes, so
// the whole text (not just the new part) is sent for context each time.
const MAX_CARRIER = 12000
const MAX_SLOTS = 80
const MAX_OPTIONS = 30

// Per-IP token bucket. Edge instances are ephemeral and not shared, so this is
// a speed bump against casual abuse rather than a guarantee; the hard limits
// above are what bound cost per request.
const RATE_CAPACITY = 12
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

const SYSTEM = `You choose replacement words for a word-substitution puzzle.

You are given a paragraph and a list of slots. Each slot names one word that
MUST be replaced, and a list of allowed replacements. Choose, for each slot,
the replacement that makes the sentence read most naturally — matching part of
speech, number and tense as closely as the options allow.

You may ONLY choose from the given options. You may not edit any other word,
add words, or reorder anything.

Reply with JSON only, no prose: {"picks":[{"slot":<number>,"word":"<option>"}]}
Include exactly one entry per slot.`

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405)

  if (!originAllowed(req)) return json({ error: "forbidden" }, 403)

  // Origin is spoofable; this is the check that costs an attacker something.
  if ((await checkBotId({ advancedOptions: { headers: req.headers } })).isBot) {
    return json({ error: "forbidden" }, 403)
  }

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

  const { carrier, slots } = body ?? {}
  if (typeof carrier !== "string" || !carrier.trim()) {
    return json({ error: "carrier required" }, 400)
  }
  if (!Array.isArray(slots) || slots.length === 0) return json({ picks: [] })
  if (carrier.length > MAX_CARRIER || slots.length > MAX_SLOTS) {
    return json({ error: "input too large" }, 413)
  }

  const listed = slots.slice(0, MAX_SLOTS).map((s, i) => ({
    slot: i,
    from: String(s.from ?? "").slice(0, 40),
    options: (Array.isArray(s.options) ? s.options : [])
      .slice(0, MAX_OPTIONS)
      .map((o) => String(o).slice(0, 40)),
    context: String(s.context ?? "").slice(0, 300),
  }))

  const prompt = [
    `Paragraph:\n${carrier}`,
    "",
    "Slots to replace:",
    ...listed.map(
      (s) =>
        `slot ${s.slot}: replace "${s.from}"${s.context ? ` (context: …${s.context}…)` : ""}\n  options: ${s.options.join(", ")}`,
    ),
  ].join("\n")

  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
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
    const content = data.choices?.[0]?.message?.content ?? ""
    const picks = parsePicks(content, listed)
    return json({ picks })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "request failed" },
      502,
    )
  }
}

/** Extract the JSON mapping and discard anything not in the allowed options. */
function parsePicks(content, listed) {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return []
  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return []
  }
  const raw = Array.isArray(parsed?.picks) ? parsed.picks : []
  const out = []
  for (const entry of raw) {
    const slot = Number(entry?.slot)
    const word = String(entry?.word ?? "").toLowerCase()
    const spec = listed[slot]
    if (!spec) continue
    // The model may only pick from what it was offered.
    if (!spec.options.includes(word)) continue
    out.push({ slot, word })
  }
  return out
}
