/**
 * Round 6 — where the residual damage actually comes from.
 *
 * Whitelist prose still needs 7-10% of words substituted even though the
 * allowed list IS the fitting set. Hypothesis: the model uses allowed words in
 * other forms — "store" becomes "stores", "walk" becomes "walked" — and every
 * inflection is a different token with a different hash, so it does not fit.
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
prose only — no title, no headings, no preamble, no commentary.`

/** Crude stems, enough to tell an inflection from an unrelated word. */
const stems = (w: string): string[] => {
  const out = [w]
  for (const suffix of ["s", "es", "ed", "d", "ing", "ly", "er", "ers"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      const base = w.slice(0, -suffix.length)
      out.push(base, base + "e")
      if (base.length > 1 && base[base.length - 1] === base[base.length - 2]) {
        out.push(base.slice(0, -1))
      }
    }
  }
  return out
}

const live = test.skipIf(!process.env.LAB_TOKEN)

live("how much of the damage is inflection", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  const allowed: string[] = []
  const seen = new Set<string>()
  for (const w of await encoder.suggestFrom("", VOCAB.slice(0, 4000), 4000, 0)) {
    if (!seen.has(w) && isCarrierWord(await encoder.digestsFor(w))) {
      seen.add(w)
      allowed.push(w)
    }
  }
  const allowedSet = new Set(allowed)
  console.log(`SETUP allowed=${allowed.length}`)

  const CONSTRAINT = `CONSTRAINT: every noun, verb, adjective and adverb must
come from the ALLOWED list. Articles, pronouns, prepositions, conjunctions,
numbers, auxiliaries and forms of be/have/do are unrestricted.`

  const text = await chat(
    `${PLAIN}\n\n${CONSTRAINT}\n\nWrite at least 500 words about the topic.`,
    `ALLOWED: ${allowed.join(", ")}\n\nTopic: ${TOPIC}`,
  )

  const state = await encoder.evaluate(text)
  const spans = tokenizeSpans(text)
  const unfit = state.words
    .map((w, i) => (w.green ? null : spans[i]?.word))
    .filter(Boolean) as string[]

  const inflections = unfit.filter((w) =>
    stems(w).some((s) => s !== w && allowedSet.has(s)),
  )
  console.log(
    `ANALYSIS words=${spans.length} unfit=${unfit.length}` +
      ` inflectionsOfAllowed=${inflections.length}` +
      ` (${Math.round((inflections.length / Math.max(1, unfit.length)) * 100)}% of the damage)`,
  )
  console.log(`INFLECTED ${[...new Set(inflections)].slice(0, 25).join(" ")}`)
  console.log(
    `OTHER ${[...new Set(unfit.filter((w) => !inflections.includes(w)))].slice(0, 25).join(" ")}`,
  )

  // Now the fix: forbid changing word endings, and see what it costs.
  const strict = await chat(
    `${PLAIN}\n\n${CONSTRAINT}

FORM: use allowed words EXACTLY as spelled. Do not add or remove endings — no
plurals, no past tense, no -ing forms unless that exact form is on the list.
Use "was", "had", "did" and "will" plus the listed form to express tense, and
say "a lot of X" rather than pluralising X. This matters more than elegance.

Write at least 500 words.`,
    `ALLOWED: ${allowed.join(", ")}\n\nTopic: ${TOPIC}`,
  )
  const s2 = await encoder.evaluate(strict)
  const sp2 = tokenizeSpans(strict)
  const unfit2 = s2.words.filter((w) => !w.green).length
  console.log(
    `RESULT strict-forms: words=${sp2.length} unfit=${unfit2}` +
      ` (${Math.round((unfit2 / Math.max(1, sp2.length)) * 100)}%)`,
  )

  // Repair both mechanically and see which decodes.
  for (const [label, t] of [["loose", text], ["strict", strict]] as const) {
    const st = await encoder.evaluate(t)
    const sp = tokenizeSpans(t)
    const bad = st.words.map((w, i) => (w.green ? -1 : i)).filter((i) => i >= 0)
    const taken = new Set(sp.map((s) => s.word))
    const spare = allowed.filter((w) => !taken.has(w))
    let k = 0
    let out = t
    for (const slot of [...bad].sort((a, b) => b - a)) {
      while (k < spare.length && taken.has(spare[k])) k++
      if (k >= spare.length) break
      taken.add(spare[k])
      out = out.slice(0, sp[slot].start) + spare[k++] + out.slice(sp[slot].end)
    }
    console.log(
      `DECODE ${label}: ${JSON.stringify((await decode(out, PASS)).secret)}\nTEXT ${label}: ${out.slice(0, 400)}`,
    )
  }
}, 900_000)
