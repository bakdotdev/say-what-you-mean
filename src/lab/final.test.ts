/**
 * Round 4 — decisive comparison, with AI-chosen substitutions so it reflects
 * what the app actually ships, not the mechanical floor used to rank methods.
 *
 * What rounds 1-3 established:
 *   - free prose needs ~15% of its words substituted
 *   - a content-word whitelist halves that, to 4-8%
 *   - the replacement pool was capped at 477 by a 4000-word probe limit in
 *     suggestFrom; walking the vocabulary in windows yields 3734
 *   - a whitelist of ~1456 words makes the model return nothing at all
 *
 * NOTE: these ran against api/lab.js, a token-gated arbitrary-prompt endpoint
 * that has since been removed from the deployment. Restore it to re-run them.
 */
import { test } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, DURABLE_DENSITY, tokenizeSpans } from "../codec"
import { isCarrierWord } from "../codec/equations"

const API = "https://lab.bak.dev/say-what-you-mean/api/lab"
const MODEL = "anthropic/claude-sonnet-4.5"
const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n").map((w) => w.trim()).filter(Boolean)

const SECRET = "DOCK AT 9"
const PASS = "swordfish"
const TOPIC = "putting away the shopping after a trip to the corner shop"

const chat = async (system: string, user: string, maxTokens = 3000) => {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-lab-token": process.env.LAB_TOKEN ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, system, user, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()).text ?? "").trim()
}

const PLAIN = `You write utterly ordinary first-person prose. Plain everyday
vocabulary, simple sentences, no drama, no metaphor, no dialogue. Output the
prose only — no title, no preamble, no commentary.`

const bigPool = async (
  encoder: Awaited<ReturnType<typeof createEncoder>>,
  band: number,
) => {
  const seen = new Set<string>()
  const fitting: string[] = []
  for (let offset = 0; offset < band; offset += 4000) {
    for (const w of await encoder.suggestFrom("", VOCAB.slice(0, band), 4000, offset)) {
      if (seen.has(w)) continue
      seen.add(w)
      if (isCarrierWord(await encoder.digestsFor(w))) fitting.push(w)
    }
  }
  return fitting
}

/** Mirrors the app's repair: context per slot, options, AI picks, batched. */
const aiRepair = async (
  encoder: Awaited<ReturnType<typeof createEncoder>>,
  carrier: string,
  fitting: readonly string[],
) => {
  const state = await encoder.evaluate(carrier)
  const spans = tokenizeSpans(carrier)
  const unfit = state.words.map((w, i) => (w.green ? -1 : i)).filter((i) => i >= 0)
  if (!unfit.length) return { text: carrier, subs: 0, words: spans.length }
  const inText = new Set(spans.map((s) => s.word))
  const available = fitting.filter((w) => w.length >= 3 && !inText.has(w))

  const specs = unfit.flatMap((slot, n) => {
    const span = spans[slot]
    if (!span) return []
    const seed = (n * 31) % available.length
    const options = Array.from({ length: 32 }, (_, i) => available[(seed + i) % available.length])
    return [{
      slot,
      from: span.word,
      options,
      context: carrier.slice(Math.max(0, span.start - 60), span.end + 60).replace(/\s+/g, " ").trim(),
    }]
  })

  const chosen = new Map<number, string>()
  for (let i = 0; i < specs.length; i += 40) {
    const batch = specs.slice(i, i + 40)
    const reply = await chat(
      `You choose replacement words. For each slot pick the option that makes
the sentence read most naturally — matching part of speech, number and tense
as closely as the options allow. Choose ONLY from that slot's options.
Reply as JSON only: {"picks":[{"slot":N,"word":"..."}]}`,
      batch.map((s, n) =>
        `slot ${n}: replace "${s.from}" (context: …${s.context}…)\n  options: ${s.options.join(", ")}`,
      ).join("\n"),
      2000,
    )
    try {
      const picks = JSON.parse(reply.replace(/^```(json)?|```$/g, "").trim()).picks ?? []
      for (const p of picks) {
        const spec = batch[p.slot]
        if (spec && spec.options.includes(p.word)) chosen.set(spec.slot, p.word)
      }
    } catch {
      // fall through to deterministic picks
    }
  }

  const taken = new Set(inText)
  let next = 0
  let out = carrier
  const picked = new Map<number, string>()
  for (const spec of specs) {
    let word = chosen.get(spec.slot)
    if (!word || taken.has(word)) word = spec.options.find((o) => !taken.has(o))
    while (!word && next < available.length) {
      const c = available[next++]
      if (!taken.has(c)) word = c
    }
    if (!word) continue
    taken.add(word)
    picked.set(spec.slot, word)
  }
  for (const spec of [...specs].sort((a, b) => b.slot - a.slot)) {
    const word = picked.get(spec.slot)
    if (!word) continue
    out = out.slice(0, spans[spec.slot].start) + word + out.slice(spans[spec.slot].end)
  }
  return { text: out, subs: unfit.length, words: spans.length }
}

const live = test.skipIf(!process.env.LAB_TOKEN)

live("shipped vs proposed", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  // 9439 is where wordlist.txt stops being frequency-ordered; past it the
  // list is an alphabetical dictionary and every draw is an "a" word.
  const small = await bigPool(encoder, 4000)
  const large = await bigPool(encoder, 9439)
  console.log(`SETUP smallPool=${small.length} cleanPool=${large.length}`)

  const results: { label: string; text: string; subs: number; words: number }[] = []

  // P1 — what ships today: free prose, substitutions from the capped pool.
  const free = await chat(PLAIN, `Write about ${TOPIC}. Aim for roughly 700 words.`)
  const p1 = await aiRepair(encoder, free, small)
  results.push({ label: "P1-shipped", ...p1 })

  // P2 — free prose, substitutions from the uncapped pool. Isolates the cap.
  const p2 = await aiRepair(encoder, free, large)
  results.push({ label: "P2-big-pool", ...p2 })

  // P3 — whitelist prose + uncapped pool: fewer substitutions AND better ones.
  const wl = await chat(
    `${PLAIN}

CONSTRAINT: every noun, verb, adjective and adverb must come from the ALLOWED
list. Articles, pronouns, prepositions, conjunctions, numbers, auxiliaries and
forms of be/have/do are unrestricted — use them freely so it reads naturally.
Reuse allowed words freely, and prefer a blander sentence over reaching for a
word that is not on the list.

LENGTH: at least 650 words. Describe each step in unhurried detail.`,
    `ALLOWED: ${small.join(", ")}\n\nWrite about ${TOPIC}.`,
  )
  const p3 = await aiRepair(encoder, wl, large)
  results.push({ label: "P3-whitelist+big-pool", ...p3 })

  for (const r of results) {
    const decoded = (await decode(r.text, PASS)).secret
    console.log(
      `RESULT ${r.label}: words=${r.words} substituted=${r.subs} (${Math.round(r.subs / Math.max(1, r.words) * 100)}%) decodes=${JSON.stringify(decoded)}`,
    )
  }

  const judged = await chat(
    `You rate prose for naturalness — whether it reads as ordinary human
writing or as text with words randomly swapped. Score each numbered passage
1 (obvious word salad) to 10 (indistinguishable from human writing).
Reply as JSON only: {"scores":[{"n":1,"score":X,"why":"short reason"}]}`,
    results.map((r, i) => `${i + 1}.\n${r.text.slice(0, 1100)}`).join("\n\n---\n\n"),
    1200,
  )
  console.log(`JUDGE ${judged.replace(/\s+/g, " ")}`)
  for (const r of results) console.log(`TEXT ${r.label}: ${r.text.slice(0, 380)}`)
}, 900_000)
