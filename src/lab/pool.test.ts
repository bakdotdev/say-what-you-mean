/**
 * Round 3 — the replacement pool was capped, not scarce.
 *
 * suggestFrom probes at most 4000 vocabulary words (a UI-responsiveness
 * guard), so every band from 4k to 20k returned the same 477 fitting carriers.
 * The generator is background work and can afford a much wider scan. This
 * measures how big the pool really is and whether a bigger one buys better
 * prose — both for the whitelist method and for substitution.
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

/** Walk the vocabulary in windows, since one call probes only 4000 words. */
const bigPool = async (
  encoder: Awaited<ReturnType<typeof createEncoder>>,
  band: number,
) => {
  const seen = new Set<string>()
  const fitting: string[] = []
  for (let offset = 0; offset < band; offset += 4000) {
    const got = await encoder.suggestFrom("", VOCAB.slice(0, band), 4000, offset)
    for (const w of got) {
      if (seen.has(w)) continue
      seen.add(w)
      if (isCarrierWord(await encoder.digestsFor(w))) fitting.push(w)
    }
  }
  return fitting
}

const measure = async (
  label: string,
  encoder: Awaited<ReturnType<typeof createEncoder>>,
  fitting: readonly string[],
  text: string,
) => {
  const state = await encoder.evaluate(text)
  const spans = tokenizeSpans(text)
  const unfit = state.words.map((w, i) => (w.green ? -1 : i)).filter((i) => i >= 0)
  const taken = new Set(spans.map((s) => s.word))
  const spare = fitting.filter((w) => w.length >= 3 && !taken.has(w))
  let k = 0
  let out = text
  for (const slot of [...unfit].sort((a, b) => b - a)) {
    while (k < spare.length && taken.has(spare[k])) k++
    if (k >= spare.length) break
    taken.add(spare[k])
    out = out.slice(0, spans[slot].start) + spare[k++] + out.slice(spans[slot].end)
  }
  const decoded = (await decode(out, PASS)).secret
  const pct = spans.length ? Math.round((unfit.length / spans.length) * 100) : 0
  console.log(
    `RESULT ${label}: words=${spans.length} substituted=${unfit.length} (${pct}%) decodes=${JSON.stringify(decoded)}`,
  )
  return { label, out, pct, decoded, words: spans.length }
}

const live = test.skipIf(!process.env.LAB_TOKEN)

live("bigger pool", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)

  for (const band of [4000, 12000, 30000]) {
    const p = await bigPool(encoder, band)
    console.log(`POOL band=${band} fittingCarriers=${p.length}`)
  }

  // Common band only — deeper vocabulary is where names and jargon live.
  const fitting = await bigPool(encoder, 12000)
  console.log(`SETUP allowed=${fitting.length}, sample=${fitting.slice(0, 25).join(" ")}`)

  const results = []

  // A — whitelist, now with a list large enough to actually write with.
  const a = await chat(
    `${PLAIN}

CONSTRAINT: every noun, verb, adjective and adverb must come from the ALLOWED
list. Articles, pronouns, prepositions, conjunctions, numbers, auxiliaries and
forms of be/have/do are unrestricted — use them freely so it reads naturally.
Reuse allowed words freely, and prefer a blander sentence over reaching for a
word that is not on the list.

LENGTH: at least 650 words. Describe each step in unhurried detail. Do not
wrap up early.`,
    `ALLOWED: ${fitting.join(", ")}\n\nWrite about ${TOPIC}.`,
  )
  results.push(await measure("A-whitelist-big", encoder, fitting, a))

  // B — free prose, then substitution drawn from the big pool. Isolates how
  // much of the damage was pool size rather than the substitution idea.
  const b = await chat(PLAIN, `Write about ${TOPIC}. Aim for roughly 700 words.`)
  results.push(await measure("B-free-prose-big-pool", encoder, fitting, b))

  console.log("TABLE " + JSON.stringify(results.map((r) => ({
    m: r.label, words: r.words, subPct: r.pct, ok: r.decoded,
  }))))
  for (const r of results) console.log(`TEXT ${r.label}: ${r.out.slice(0, 420)}`)
}, 900_000)
