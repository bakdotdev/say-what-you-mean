/**
 * Round 5 — the whitelist wins on quality (judge 6/10 against 2/10 for what
 * ships) but writes short: 98-528 words where ~500 are needed. Asking for a
 * word count does not work; the constraint makes the model terse and it stops.
 *
 * So give it structure instead of a number. An outline of concrete beats is
 * something a model will actually work through.
 *
 * Also settled in round 4: do NOT enlarge the replacement pool. Substituting
 * from 3734 words scored WORSE than from 477 (1/10 vs 2/10) because the extra
 * words are rarer — "louisiana", "trinidad", "unemployment".
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
prose only — no title, no headings, no preamble, no commentary.`

const CONSTRAINT = `CONSTRAINT: every noun, verb, adjective and adverb must come
from the ALLOWED list. Articles, pronouns, prepositions, conjunctions, numbers,
auxiliaries and forms of be/have/do are unrestricted — use them freely so it
reads naturally. Reuse allowed words as often as you like, and prefer a blander
sentence over reaching for a word that is not on the list.`

const BEATS = [
  "walking back from the shop and getting through the front door",
  "putting the bags down and taking off your coat",
  "looking at what is already on the counter before starting",
  "the cold things first, and what the fridge looks like inside",
  "moving older things forward to make room",
  "the vegetables, and where they go",
  "the dry goods and the cupboard above",
  "the bread, and noticing what you forgot to buy",
  "folding the bags and putting them away",
  "standing in the finished kitchen for a moment",
]

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

live("whitelist length", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  const seen = new Set<string>()
  const fitting: string[] = []
  for (const w of await encoder.suggestFrom("", VOCAB.slice(0, 4000), 4000, 0)) {
    if (!seen.has(w) && isCarrierWord(await encoder.digestsFor(w))) {
      seen.add(w)
      fitting.push(w)
    }
  }
  const list = fitting.join(", ")
  console.log(`SETUP allowed=${fitting.length}`)
  const results = []

  // A — outline in one call.
  const a = await chat(
    `${PLAIN}\n\n${CONSTRAINT}\n\nWrite one continuous account that covers every
numbered beat below in order, in at least three sentences each. Do not number
them in your output and do not skip any.`,
    `ALLOWED: ${list}\n\n${BEATS.map((b, i) => `${i + 1}. ${b}`).join("\n")}`,
  )
  results.push(await measure("A-outline-one-call", encoder, fitting, a))

  // B — same outline, split in two so each half has room, with the first half
  // shown to the second. Beats of one story, not independent runs.
  const b1 = await chat(
    `${PLAIN}\n\n${CONSTRAINT}\n\nCover every numbered beat in order, at least
three sentences each. Do not number them. Stop when the beats are done.`,
    `ALLOWED: ${list}\n\n${BEATS.slice(0, 5).map((b, i) => `${i + 1}. ${b}`).join("\n")}`,
  )
  const b2 = await chat(
    `${PLAIN}\n\n${CONSTRAINT}\n\nContinue the account below from exactly where
it stops, same voice, same day, covering every numbered beat in order, at least
three sentences each. Do not number them and do not repeat what is written.`,
    `ALLOWED: ${list}\n\nSo far:\n${b1}\n\nBeats still to cover:\n${BEATS.slice(5).map((b, i) => `${i + 1}. ${b}`).join("\n")}`,
  )
  results.push(await measure("B-outline-two-calls", encoder, fitting, `${b1} ${b2}`))

  console.log("TABLE " + JSON.stringify(results.map((r) => ({
    m: r.label, words: r.words, subPct: r.pct, ok: r.decoded,
  }))))
  for (const r of results) console.log(`TEXT ${r.label}: ${r.out.slice(0, 500)}`)
}, 900_000)
