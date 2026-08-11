/**
 * Round 7 — one generation, whole palette.
 *
 * Rounds 1-6 constrained the model with one list and told it the rest of
 * English was "unrestricted", which leaves it guessing what that means. This
 * gives it both halves explicitly: the words that carry the message, and the
 * free words it may use to join them up. One call, no sequencing.
 *
 * NOTE: these ran against api/lab.js, a token-gated arbitrary-prompt endpoint
 * that has since been removed from the deployment. Restore it to re-run them.
 */
import { test } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, DURABLE_DENSITY, tokenizeSpans } from "../codec"
import { isCarrierWord } from "../codec/equations"
import { FUNCTION_WORDS } from "../codec/features"

const API = "https://lab.bak.dev/say-what-you-mean/api/lab"
const MODEL = "anthropic/claude-sonnet-4.5"
const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n").map((w) => w.trim()).filter(Boolean)

const SECRET = "DOCK AT 9"
const PASS = "swordfish"
const TOPIC = "putting away the shopping after a trip to the corner shop"
const COMMON_WORD_COUNT = 9439

const chat = async (system: string, user: string, maxTokens = 4000) => {
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

live("whole palette, one call", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)

  // Carrier words that fit — these are what actually hold the message.
  const fitting: string[] = []
  const seen = new Set<string>()
  for (let offset = 0; offset < COMMON_WORD_COUNT; offset += 4000) {
    for (const w of await encoder.suggestFrom("", VOCAB.slice(0, COMMON_WORD_COUNT), 4000, offset)) {
      if (!seen.has(w) && isCarrierWord(await encoder.digestsFor(w))) {
        seen.add(w)
        fitting.push(w)
      }
    }
  }

  // Free words: function words, plus common content words that carry nothing
  // under this key. Both are safe to use anywhere, and naming them is the
  // point of this round — "unrestricted" was doing no work.
  const free: string[] = []
  for (const w of VOCAB.slice(0, COMMON_WORD_COUNT)) {
    if (free.length >= 700) break
    if (FUNCTION_WORDS.has(w)) free.push(w)
    else if (w.length >= 3 && !isCarrierWord(await encoder.digestsFor(w))) free.push(w)
  }
  console.log(`SETUP carriers=${fitting.length} free=${free.length}`)

  const results = []

  // A — one list, "the rest is unrestricted" (what round 6 shipped).
  const a = await chat(
    `${PLAIN}

CONSTRAINT: every noun, verb, adjective and adverb must come from the ALLOWED
list. Articles, pronouns, prepositions, conjunctions, numbers, auxiliaries and
forms of be/have/do are unrestricted — use them freely so it reads naturally.

LENGTH: at least 650 words.`,
    `ALLOWED: ${fitting.slice(0, 600).join(", ")}\n\nWrite about ${TOPIC}.`,
  )
  results.push(await measure("A-one-list", encoder, fitting, a))

  // B — both halves named, one call.
  const b = await chat(
    `${PLAIN}

You are given TWO word lists and you may use nothing else.

KEY WORDS carry the meaning. Use as many DIFFERENT key words as you can — the
more distinct ones appear, the better. Nouns, verbs, adjectives and adverbs
must come from here.

FREE WORDS are the joining words — articles, pronouns, prepositions, and
common words that add no weight. Use them freely and as often as you like.

Use words exactly as spelled in the lists. A plural or a past tense is a
different word: say "was" or "had" plus the listed form instead.

Write ONE continuous account with a single subject, start to finish. At least
650 words. Prefer a blander sentence over reaching for a word in neither list.`,
    `KEY WORDS: ${fitting.slice(0, 600).join(", ")}\n\nFREE WORDS: ${free.join(", ")}\n\nWrite about ${TOPIC}.`,
  )
  results.push(await measure("B-both-lists", encoder, fitting, b))

  const judged = await chat(
    `You rate prose for naturalness — whether it reads as ordinary human writing
or as text with words randomly swapped. Score each numbered passage 1 (obvious
word salad) to 10 (indistinguishable from human writing).
Reply as JSON only: {"scores":[{"n":1,"score":X,"why":"short reason"}]}`,
    results.map((r, i) => `${i + 1}.\n${r.out.slice(0, 1100)}`).join("\n\n---\n\n"),
    1000,
  )
  console.log(`JUDGE ${judged.replace(/\s+/g, " ")}`)
  for (const r of results) console.log(`TEXT ${r.label}: ${r.out.slice(0, 450)}`)
}, 900_000)
