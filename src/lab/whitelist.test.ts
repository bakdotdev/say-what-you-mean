/**
 * Round 2 — the content-word whitelist won round 1 on quality (4% of words
 * needed blind substitution, against 16% for free prose) but wrote only 125
 * words, far short of the ~600 a payload needs. Round 2 is about length and
 * about driving substitutions to zero, since every substitution is a word
 * chosen by constraint rather than meaning and reads as such.
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
prose only — no title, no preamble, no commentary, no word counts.`

const rule = (n: number) => `${PLAIN}

CONSTRAINT: every noun, verb, adjective and adverb must come from the ALLOWED
list. Articles, pronouns, prepositions, conjunctions, numbers, auxiliaries and
forms of be/have/do are unrestricted — use them freely so it reads naturally.
Reuse allowed words as often as you like, and prefer a blander sentence over
reaching for a word that is not on the list.

LENGTH: this must run to at least ${n} words. Keep going — describe each step
in unhurried detail. Do not wrap up early and do not summarise.`

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
  return { label, out, words: spans.length, subs: unfit.length, pct, decoded }
}

const live = test.skipIf(!process.env.LAB_TOKEN)

live("whitelist variants", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  const pool = await encoder.suggestFrom("", VOCAB.slice(0, 20000), 6000, 0)
  const fitting: string[] = []
  for (const w of pool) {
    if (isCarrierWord(await encoder.digestsFor(w))) fitting.push(w)
  }
  const list = fitting.join(", ")
  console.log(`SETUP payload=${encoder.B} bits, allowed=${fitting.length} words`)
  const results = []

  // A — one call, whole list, hard length demand.
  const a = await chat(rule(700), `ALLOWED: ${list}\n\nWrite about ${TOPIC}.`)
  results.push(await measure("A-one-call-700", encoder, fitting, a))

  // B — same, but continued in a second call that sees what came before, so
  // it reads as one account rather than two stitched runs.
  const b1 = await chat(rule(400), `ALLOWED: ${list}\n\nWrite about ${TOPIC}.`)
  const b2 = await chat(
    rule(400),
    `ALLOWED: ${list}\n\nHere is the first half of an account about ${TOPIC}:\n\n${b1}\n\nContinue it from exactly where it stops, same voice, same day. Do not repeat anything already written and do not restate the ending.`,
  )
  results.push(await measure("B-continued", encoder, fitting, `${b1} ${b2}`))

  // C — self-repair instead of blind substitution: hand the model its own
  // stray words back and let it rewrite those sentences however it likes.
  const stateA = await encoder.evaluate(a)
  const spansA = tokenizeSpans(a)
  const strays = [
    ...new Set(
      stateA.words.map((w, i) => (w.green ? null : spansA[i]?.word)).filter(Boolean) as string[],
    ),
  ]
  const c = strays.length
    ? await chat(
        `${PLAIN}

You are given a passage and a list of BANNED words that appear in it. Rewrite
the passage so none of the banned words appear anywhere, using only words from
the ALLOWED list for nouns, verbs, adjectives and adverbs. Keep the length and
the voice. You may rephrase whole sentences — that usually reads better than
swapping single words. Output the rewritten passage only.`,
        `ALLOWED: ${list}\n\nBANNED: ${strays.join(", ")}\n\nPassage:\n${a}`,
      )
    : a
  results.push(await measure("C-self-repair", encoder, fitting, c))

  console.log("TABLE " + JSON.stringify(results.map((r) => ({
    m: r.label, words: r.words, subPct: r.pct, ok: r.decoded,
  }))))
  const best = results.filter((r) => r.decoded).sort((x, y) => x.pct - y.pct)[0]
  if (best) console.log(`BEST ${best.label}\nTEXT ${best.out.slice(0, 700)}`)
}, 900_000)
