/**
 * Rewrites a finished carrier so it reads as prose, keeping the words that
 * hold the message.
 *
 * This is only possible in DURABLE mode, and only there. Per-word embedding is
 * position-free: a word's clue depends on the word alone, not on where it
 * sits. So sentences can be restructured, reordered, joined, split, and free
 * words added or dropped — the payload survives all of it, as long as every
 * word in KEEP still appears somewhere.
 *
 * (Matrix embedding, the compact mode, has no such freedom: its syndrome
 * depends on the parity of every word in order, which is why api/rewrite
 * deliberately refuses to let the model touch anything but planned slots.)
 *
 * The caller must verify the result decodes and fall back to its input if not
 * — nothing here can guarantee the model kept every word.
 *
 * Protections: same-origin only, small body caps, per-IP token bucket.
 */

import { originAllowed, clientIp } from "./_origin.js"

export const config = { runtime: "nodejs", maxDuration: 300 }

const MODEL = "anthropic/claude-sonnet-5"
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions"

const MAX_CARRIER = 12000
const MAX_KEEP = 400

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

const SYSTEM = `You repair prose that has had words swapped into it. The result
reads badly: wrong nouns, verbs that do not fit, sentences that lost their
sense. Your job is to make it read like an ordinary person wrote it.

You are given the passage and a KEEP list.

- Every word on the KEEP list must still appear somewhere in your rewrite, at
  least once, spelled exactly as given. This is the one hard rule.
- Everything else is yours. Rewrite sentences around the KEEP words so they
  make sense. Change any word not on the list, add joining words, drop words,
  split or merge sentences, and reorder freely — order does not matter.
- Where a KEEP word cannot be made to fit its current sentence, build a
  different sentence around it, or move it somewhere it does fit.
- Stay in the same voice: plain, ordinary, first person, no drama, no
  metaphor, no dialogue. It should read as a dull everyday account.
- Keep roughly the same length. Do not summarise.
- No names of real people, no numbers, nothing memorable or quotable.
- No lists, headings, quotes, emoji or markdown.
- Do not mention writing, messages, secrets, codes or this task.

Return ONLY the rewritten prose.`

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" })
  }
  if (!originAllowed(req)) return res.status(403).json({ error: "forbidden" })
  if (!withinRateLimit(clientIp(req))) {
    return res.status(429).json({ error: "rate limited — try again shortly" })
  }
  const key = process.env.AI_GATEWAY_API_KEY
  if (!key) {
    return res.status(500).json({ error: "AI_GATEWAY_API_KEY not configured" })
  }

  const body =
    typeof req.body === "string" ? safeParse(req.body) : (req.body ?? {})
  const carrier = String(body?.carrier ?? "")
  const keep = Array.isArray(body?.keep)
    ? body.keep.slice(0, MAX_KEEP).map((w) => String(w).slice(0, 24)).filter(Boolean)
    : []

  if (!carrier.trim()) return res.status(400).json({ error: "carrier required" })
  if (carrier.length > MAX_CARRIER) {
    return res.status(413).json({ error: "input too large" })
  }
  if (!keep.length) return res.status(200).json({ carrier })

  try {
    const upstream = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        temperature: 0.6,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `KEEP: ${keep.join(", ")}\n\nPassage:\n${carrier}`,
          },
        ],
      }),
    })
    if (!upstream.ok) {
      const detail = await upstream.text()
      return res
        .status(502)
        .json({ error: `gateway ${upstream.status}`, detail: detail.slice(0, 300) })
    }
    const data = await upstream.json()
    const text = (data.choices?.[0]?.message?.content ?? "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!text) {
      // Diagnostics kept deliberately: an empty completion here is not a
      // network fault and the shape of the reply is the only way to tell why.
      const choice = data.choices?.[0] ?? {}
      return res.status(502).json({
        error: "empty completion",
        finish: choice.finish_reason ?? null,
        messageKeys: Object.keys(choice.message ?? {}),
        usage: data.usage ?? null,
      })
    }
    return res.status(200).json({ carrier: text })
  } catch (err) {
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "request failed" })
  }
}

const safeParse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
