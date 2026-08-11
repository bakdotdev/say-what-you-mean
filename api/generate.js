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

/**
 * Node runtime with a long budget, NOT edge. A large allowed-vocabulary prompt
 * is what makes the model actually stay in-vocabulary, and edge's ~25s ceiling
 * was truncating those requests (measured: 700 words fine, 1200+ returned an
 * empty completion, 3000 timed out). Node lets the prompt be big enough to
 * work.
 */
export const config = { runtime: "nodejs", maxDuration: 300 }

/**
 * Sonnet, not Haiku. Composing inside a multi-thousand-word vocabulary is an
 * instruction-following problem, and Haiku measured at ~47% adherence — which
 * is chance, since the allowed list is ~50% of the vocabulary by construction.
 * It was ignoring the constraint entirely. Sonnet was previously impossible
 * only because edge capped at ~25s; this route is Node with a 60s budget.
 */
const MODEL = "anthropic/claude-sonnet-5"
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions"

const MIN_WORDS = 60
/**
 * Durable mode needs ~600+ words to hold the ~55 distinct carrier words a
 * payload requires. 700 was measured as safe; 1200+ came back truncated.
 */
const MAX_WORDS = 800

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
- ONE subject throughout. A single continuous account, not disconnected
  observations.
- No names of real people, no places that identify anyone, no numbers that
  look like data. Nothing memorable or quotable.
- No lists, headings, quotes, emoji or markdown. Just flowing sentences.
- Do not mention writing, messages, secrets, codes or this task.
- Return ONLY the paragraph text.`

/**
 * Constrained composition — the caller supplies the word palette.
 *
 * Measured honestly: at the ~120-word scale a content-word whitelist cut the
 * words needing substitution afterwards from 13% to 4%, but at the ~650 words
 * a payload actually needs, adherence decays and the advantage disappears
 * (12-13% either way). Naming both halves of the palette rather than calling
 * the rest of English "unrestricted" was the best of the variants tried, and
 * it keeps generation to a single call, which reads more cohesively than
 * stitched runs.
 *
 * An earlier version demanded EVERY word come from one list; adherence was
 * 42-47%, which is chance, and long lists made the model return nothing.
 */
const VOCAB_SYSTEM = `You write utterly ordinary first-person prose. Plain
everyday vocabulary, simple sentences, no drama, no metaphor, no dialogue.

You are given two word lists and should use nothing else.

KEY WORDS carry the meaning. Use as many DIFFERENT key words as you can — the
more distinct ones appear, the better. Nouns, verbs, adjectives and adverbs
must come from here.

FREE WORDS are the joining words — articles, pronouns, prepositions and common
words that add no weight. Use them freely and as often as you like.

Use words exactly as spelled. A plural or a past tense is a different word:
say "was" or "had" plus the listed form instead.

Also:
- Write ONE continuous account with a single subject, start to finish. Every
  sentence must follow from the last. Do not drift between unrelated scenes.
- Prefer a blander sentence over reaching for a word in neither list.
- No names of real people, no numbers, nothing memorable or quotable.
- No lists, headings, quotes, emoji or markdown.
- Do not mention writing, messages, secrets, codes or this task.
- Return ONLY the prose.`

const safeParse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store")
  if (req.method !== "POST")
    return res.status(405).json({ error: "method not allowed" })

  if (!originAllowed(req)) return res.status(403).json({ error: "forbidden" })

  const ip = clientIp(req)
  if (!withinRateLimit(ip))
    return res.status(429).json({ error: "rate limited — try again shortly" })

  const key = process.env.AI_GATEWAY_API_KEY
  if (!key)
    return res.status(500).json({ error: "AI_GATEWAY_API_KEY not configured" })

  const body =
    typeof req.body === "string" ? safeParse(req.body) : (req.body ?? {})

  const words = Math.min(
    MAX_WORDS,
    Math.max(MIN_WORDS, Number(body?.words) || 160),
  )
  const topic = String(body?.topic ?? "an ordinary afternoon").slice(0, 160)
  // Optional allowed vocabulary — capped so the prompt stays sane.
  const allowedWords = Array.isArray(body?.allowed)
    ? body.allowed
        .slice(0, 4000)
        .map((w) => String(w).slice(0, 24))
        .filter(Boolean)
    : []
  const freeWords = Array.isArray(body?.free)
    ? body.free
        .slice(0, 900)
        .map((w) => String(w).slice(0, 24))
        .filter(Boolean)
    : []

  try {
    const upstream = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: allowedWords.length ? VOCAB_SYSTEM : SYSTEM,
          },
          {
            role: "user",
            content: allowedWords.length
              ? `KEY WORDS: ${allowedWords.join(", ")}\n\nFREE WORDS: ${freeWords.join(", ")}\n\nWrite about ${topic}. It must run to at least ${words} words — describe each step in unhurried detail and do not wrap up early.`
              : `Write about ${topic}. Aim for roughly ${words} words — it is better to run slightly long than short.`,
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
    if (!text) return res.status(502).json({ error: "empty completion" })

    return res.status(200).json({ carrier: text })
  } catch (err) {
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "request failed" })
  }
}
