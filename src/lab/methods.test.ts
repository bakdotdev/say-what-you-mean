/**
 * Local bake-off for carrier-generation methods. Not part of the app.
 *
 * Run with a gateway key:
 *   capy run -e AI_GATEWAY_API_KEY=vercel/capykeys -- \
 *     npx vitest run src/lab/methods.test.ts --reporter=verbose
 *
 * Scores each method on what actually matters: does it decode, and how much
 * of the text had to be mechanically substituted (every substitution is a
 * word chosen by constraint rather than meaning, which is what makes the
 * prose read as random).
 *
 * NOTE: these ran against api/lab.js, a token-gated arbitrary-prompt endpoint
 * that has since been removed from the deployment. Restore it to re-run them.
 */
import { test } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, DURABLE_DENSITY, tokenizeSpans } from "../codec"
import { isCarrierWord } from "../codec/equations"

// The gateway key lives on Vercel and is not downloadable, so the harness
// talks to the deployed lab endpoint, which holds it.
const API = "https://lab.bak.dev/say-what-you-mean/api/lab"
const WRITER = "anthropic/claude-sonnet-4.5"
const JUDGE = "anthropic/claude-sonnet-4.5"

const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n").map((w) => w.trim()).filter(Boolean)

const SECRET = "DOCK AT 9"
const PASS = "swordfish"
const TOPIC = "putting away the shopping after a trip to the corner shop"

const chat = async (model: string, system: string, user: string, maxTokens = 2400) => {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-lab-token": process.env.LAB_TOKEN ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, system, user, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error(`${model} ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.text ?? "").trim()
}

const PLAIN = `You write short, utterly ordinary first-person prose. Plain
everyday vocabulary, simple sentences, no drama, no metaphor, no dialogue.
Output the prose only — no title, no preamble, no commentary.`

/** Mechanical substitution: the baseline repair every method falls back to. */
const substitute = async (
  encoder: Awaited<ReturnType<typeof createEncoder>>,
  text: string,
  fitting: readonly string[],
) => {
  const state = await encoder.evaluate(text)
  const spans = tokenizeSpans(text)
  const unfit = state.words.map((w, i) => (w.green ? -1 : i)).filter((i) => i >= 0)
  const taken = new Set(spans.map((s) => s.word))
  const pool = fitting.filter((w) => w.length >= 3 && !taken.has(w))
  let k = 0
  let out = text
  for (const slot of [...unfit].sort((a, b) => b - a)) {
    while (k < pool.length && taken.has(pool[k])) k++
    if (k >= pool.length) break
    const word = pool[k++]
    taken.add(word)
    out = out.slice(0, spans[slot].start) + word + out.slice(spans[slot].end)
  }
  return { text: out, substitutions: unfit.length, words: spans.length }
}

const score = async (
  label: string,
  encoder: Awaited<ReturnType<typeof createEncoder>>,
  fitting: readonly string[],
  raw: string,
) => {
  const { text, substitutions, words } = await substitute(encoder, raw, fitting)
  const decoded = (await decode(text, PASS)).secret
  const pct = words ? Math.round((substitutions / words) * 100) : 0
  console.log(
    `RESULT ${label}: words=${words} substituted=${substitutions} (${pct}%) decodes=${JSON.stringify(decoded)}`,
  )
  console.log(`SAMPLE ${label}: ${text.slice(0, 300)}`)
  return { label, text, words, substitutions, pct, decoded }
}

const live = test.skipIf(!process.env.LAB_TOKEN)

live("carrier generation bake-off", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  const pool = await encoder.suggestFrom("", VOCAB.slice(0, 20000), 6000, 0)
  const fitting: string[] = []
  for (const w of pool) {
    if (isCarrierWord(await encoder.digestsFor(w))) fitting.push(w)
  }
  console.log(`SETUP payload=${encoder.B} bits, fitting carriers=${fitting.length}`)

  const results = []

  // M1 — baseline: free prose, then substitute whatever does not fit.
  const m1 = await chat(WRITER, PLAIN, `Write about ${TOPIC}. Aim for roughly 700 words.`)
  results.push(await score("M1-free-prose", encoder, fitting, m1))

  // M2 — content-word whitelist. Function words are unrestricted, which is
  // the part earlier attempts got wrong by banning the whole vocabulary.
  const list = fitting.slice(0, 400).join(", ")
  const m2 = await chat(
    WRITER,
    `${PLAIN}

CONSTRAINT: every noun, verb, adjective and adverb you use must come from the
ALLOWED list. Articles, pronouns, prepositions, conjunctions, auxiliaries and
forms of be/have/do are unrestricted — use them freely to make it read well.
Reuse allowed words as often as you like. It is better to write a simpler,
blander sentence than to reach for a word that is not on the list.`,
    `ALLOWED: ${list}\n\nWrite about ${TOPIC}. Aim for roughly 600 words.`,
  )
  results.push(await score("M2-whitelist", encoder, fitting, m2))

  // M3 — seeded sentences: hand the model words to build around, rather than
  // slots to jam words into.
  const seeds: string[][] = []
  for (let i = 0; i < 90; i += 5) seeds.push(fitting.slice(i, i + 5))
  const m3 = await chat(
    WRITER,
    `${PLAIN}

You are given groups of words. Write ONE sentence per group that uses every
word in that group naturally. The sentences must run on from each other as a
single continuous account, in order. Do not number them.`,
    `Topic: ${TOPIC}\n\n${seeds.map((g, i) => `${i + 1}. ${g.join(", ")}`).join("\n")}`,
  )
  results.push(await score("M3-seeded-sentences", encoder, fitting, m3))

  // M5 — sentence rewriting: instead of swapping a word inside a fixed
  // sentence, let the model rewrite the whole sentence around the word.
  const state = await encoder.evaluate(m1)
  const spans = tokenizeSpans(m1)
  const unfitWords = new Set(
    state.words.map((w, i) => (w.green ? null : spans[i]?.word)).filter(Boolean) as string[],
  )
  const sentences = m1.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean)
  const taken = new Set(tokenizeSpans(m1).map((s) => s.word))
  const spare = fitting.filter((w) => !taken.has(w))
  let cursor = 0
  const rewritten: string[] = []
  for (const sentence of sentences) {
    const bad = tokenizeSpans(sentence).map((s) => s.word).filter((w) => unfitWords.has(w))
    if (!bad.length) {
      rewritten.push(sentence)
      continue
    }
    const give = spare.slice(cursor, cursor + bad.length * 2)
    cursor += bad.length * 2
    const fixed = await chat(
      WRITER,
      `You rewrite one sentence at a time, keeping the voice plain and ordinary.
Rewrite the sentence so it no longer contains any of the BANNED words, and so
it uses at least ${bad.length} of the REQUIRED words naturally. You may
restructure the sentence completely and change its meaning as long as it still
fits an ordinary account of the topic. Output the sentence only.`,
      `Topic: ${TOPIC}\nSentence: ${sentence}\nBANNED: ${bad.join(", ")}\nREQUIRED: ${give.join(", ")}`,
      300,
    )
    rewritten.push(fixed || sentence)
  }
  results.push(await score("M5-sentence-rewrite", encoder, fitting, rewritten.join(" ")))

  // Blind fluency judging, so the ranking is not just my opinion.
  const judged = await chat(
    JUDGE,
    `You rate prose for naturalness. For each numbered passage, give a score
from 1 (word salad, obviously corrupted) to 10 (indistinguishable from
ordinary human writing). Reply as JSON only: {"scores":[{"n":1,"score":X,"why":"..."}]}`,
    results.map((r, i) => `${i + 1}.\n${r.text.slice(0, 1200)}`).join("\n\n---\n\n"),
    900,
  )
  console.log(`JUDGE ${judged}`)
  console.log(
    "TABLE " +
      JSON.stringify(
        results.map((r) => ({ m: r.label, words: r.words, subPct: r.pct, ok: r.decoded })),
      ),
  )
}, 900_000)
