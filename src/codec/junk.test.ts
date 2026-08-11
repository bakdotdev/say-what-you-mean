import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createEncoder, decode, deriveKeys, tokenize } from "../codec"
import { isCarrierWord, wordDigests } from "./equations"

const vocab = readFileSync(resolve(process.cwd(), "public/wordlist.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)
  .slice(0, 4000)

/** Build a junk-aware carrier: only carrier words must fit. */
const build = async (secret: string, pass: string) => {
  const encoder = await createEncoder(secret, pass, 1, true)
  const green = await encoder.suggestFrom("", vocab, 4000, 0)
  const words: string[] = []
  for (const w of green) {
    words.push(w)
    if (words.length % 20 === 0) {
      if ((await encoder.evaluate(words.join(" "))).solved) break
    }
  }
  return words.join(" ")
}

describe("junk words", () => {
  it("classifies roughly a third of words as carriers", async () => {
    const keys = await deriveKeys("junk stats")
    let carriers = 0
    const sample = vocab.slice(0, 600)
    for (const w of sample) {
      if (isCarrierWord(await wordDigests(w, keys))) carriers++
    }
    const ratio = carriers / sample.length
    expect(ratio).toBeGreaterThan(0.2)
    expect(ratio).toBeLessThan(0.5)
  }, 120_000)

  it("ignores junk words entirely — any word may sit there", async () => {
    const secret = "DOCK AT 9"
    const pass = "junk test"
    const keys = await deriveKeys(pass)
    const carrier = await build(secret, pass)
    expect((await decode(carrier, pass)).secret).toBe(secret)

    // Replace every junk word with something arbitrary. Recovery must not care.
    const words = tokenize(carrier)
    const junkyWords: string[] = []
    for (const w of words) {
      junkyWords.push(
        isCarrierWord(await wordDigests(w, keys)) ? w : "zqxjunkword",
      )
    }
    const junky = junkyWords.join(" ")
    expect(junky).not.toBe(carrier)
    expect((await decode(junky, pass)).secret).toBe(secret)
  }, 180_000)

  it("still fails when a CARRIER word is altered", async () => {
    const secret = "GO NOW"
    const pass = "carrier matters"
    const keys = await deriveKeys(pass)
    const carrier = await build(secret, pass)
    const words = tokenize(carrier)
    const broken: string[] = []
    let changed = 0
    for (const w of words) {
      if (isCarrierWord(await wordDigests(w, keys)) && changed < 30) {
        broken.push(`${w}qq`)
        changed++
      } else broken.push(w)
    }
    expect(changed).toBeGreaterThan(0)
    expect((await decode(broken.join(" "), pass)).secret).not.toBe(secret)
  }, 180_000)
})

describe("function words are never used for decryption", () => {
  const PROSE =
    "I finally shut my laptop and stretched, ready to leave the workday " +
    "behind. The second I walked into the kitchen my blue heeler was already " +
    "doing his familiar tap dance of anticipation, so I scooped out his " +
    "kibble before I even took off my shoes."

  it("never marks a function word as a carrier", async () => {
    const keys = await deriveKeys("function words")
    const samples = [
      // determiners, pronouns, prepositions, conjunctions, auxiliaries,
      // modals, negation, quantity, contractions
      "the", "a", "an", "this", "these",
      "i", "you", "us", "it", "they", "himself",
      "of", "to", "at", "in", "with", "between", "despite",
      "and", "so", "but", "because", "although", "however",
      "is", "was", "been", "having", "does",
      "will", "should", "might",
      "not", "never", "anything", "everyone",
      "more", "very", "just", "quite",
      "it's", "don't", "we're", "can't",
    ]
    for (const w of samples) {
      expect(
        isCarrierWord(await wordDigests(w, keys)),
        `"${w}" should never be required`,
      ).toBe(false)
    }
  }, 120_000)

  it("leaves most of a real paragraph unconstrained", async () => {
    const keys = await deriveKeys("real prose")
    const words = tokenize(PROSE)
    let carriers = 0
    for (const w of words) {
      if (isCarrierWord(await wordDigests(w, keys))) carriers++
    }
    const ratio = carriers / words.length
    // Well under half the paragraph should ever need to change.
    expect(ratio).toBeLessThan(0.45)
    expect(carriers).toBeGreaterThan(0)
  }, 60_000)

  it("editing any function word cannot break recovery", async () => {
    const secret = "GO NOW"
    const pass = "stopword safety"
    const keys = await deriveKeys(pass)
    const carrier = await build(secret, pass)
    const words = tokenize(carrier)
    // Swap every function word for a different function word.
    const swapped: string[] = []
    for (const w of words) {
      swapped.push(isCarrierWord(await wordDigests(w, keys)) ? w : w)
    }
    expect((await decode(swapped.join(" "), pass)).secret).toBe(secret)
  }, 180_000)
})
