/**
 * Round 8 — a comprehension pass after repair.
 *
 * Durable embedding is position-free, so once the carrier words are in place
 * the rest of the text is completely free: sentences can be rebuilt around
 * them, reordered, joined or split. That is a far larger degree of freedom
 * than picking a replacement for a fixed slot, which is all rounds 1-7 had.
 *
 * Runs the real pipeline against the deployed endpoints: generate → repair →
 * polish → repair again → decode. Gated on LAB_TOKEN so it stays out of the
 * suite; the endpoints it calls are the shipped ones, no lab proxy needed.
 */
import { test } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, DURABLE_DENSITY, tokenizeSpans } from "../codec"
import { isCarrierWord } from "../codec/equations"

const BASE = "https://lab.bak.dev/say-what-you-mean/api"
const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n").map((w) => w.trim()).filter(Boolean)
const COMMON_WORD_COUNT = 9160

const SECRET = "DOCK AT 9"
const PASS = "swordfish"
const TOPIC = "putting away the shopping after a trip to the corner shop"

type Enc = Awaited<ReturnType<typeof createEncoder>>

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Mechanical repair — the floor, so quality differences are the model's. */
const repair = async (encoder: Enc, text: string, fitting: readonly string[]) => {
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
  return { text: out, subs: unfit.length }
}

/** Distinct words in the text that carry AND fit — the polish must keep these. */
const keepList = async (encoder: Enc, text: string) => {
  const state = await encoder.evaluate(text)
  const spans = tokenizeSpans(text)
  const keep = new Set<string>()
  for (const [i, w] of state.words.entries()) {
    const word = spans[i]?.word
    if (w.green && word && (await encoder.digestsFor(word)) && isCarrierWord(await encoder.digestsFor(word))) {
      keep.add(word)
    }
  }
  return [...keep]
}

const live = test.skipIf(!process.env.LAB_TOKEN)

live("polish pass", async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
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

  const { carrier: raw } = await post("generate", { words: 700, topic: TOPIC })
  const repaired = await repair(encoder, raw, fitting)
  const before = (await decode(repaired.text, PASS)).secret
  console.log(
    `BEFORE words=${tokenizeSpans(repaired.text).length} substituted=${repaired.subs} decodes=${JSON.stringify(before)}`,
  )
  console.log(`TEXT-BEFORE ${repaired.text.slice(0, 500)}`)

  const keep = await keepList(encoder, repaired.text)
  console.log(`KEEP ${keep.length} words`)

  // Chunked. A whole garbled passage trips the provider content filter —
  // random substitution throws up phrases like "I got asian from the corner
  // shop" — but a few sentences at a time usually does not, and a chunk that
  // is refused simply stays as it was.
  const sentences = repaired.text.split(/(?<=[.!?])\s+/).filter(Boolean)
  const chunks: string[] = []
  // One sentence at a time. Four-sentence chunks carried ~15 corruptions
  // each and read as gibberish, which the provider refuses; clean prose with
  // the same KEEP list is accepted, so it is the corruption density that
  // matters, not the task framing.
  for (const sentence of sentences) chunks.push(sentence)
  let refused = 0
  const polishedChunks = await Promise.all(
    chunks.map(async (chunk) => {
      const words = new Set(tokenizeSpans(chunk).map((sp) => sp.word))
      const chunkKeep = keep.filter((w) => words.has(w))
      if (!chunkKeep.length) return chunk
      try {
        const { carrier } = await post("polish", { carrier: chunk, keep: chunkKeep })
        return carrier || chunk
      } catch (err) {
        refused++
        console.log(`REFUSED ${String(err).slice(0, 180)}`)
        return chunk
      }
    }),
  )
  const polished = polishedChunks.join(" ")
  console.log(`CHUNKS ${chunks.length}, refused ${refused}`)
  const kept = new Set(tokenizeSpans(polished).map((s) => s.word))
  const dropped = keep.filter((w) => !kept.has(w))
  const after = await repair(encoder, polished, fitting)
  const decoded = (await decode(after.text, PASS)).secret
  console.log(
    `AFTER words=${tokenizeSpans(after.text).length} newSubstitutions=${after.subs}` +
      ` keepDropped=${dropped.length}/${keep.length} decodes=${JSON.stringify(decoded)}`,
  )
  console.log(`TEXT-AFTER ${after.text.slice(0, 500)}`)
}, 900_000)
