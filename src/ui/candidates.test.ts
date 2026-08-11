import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { deriveKeys, wordParity } from "../codec"
import { candidatesFor } from "./candidates"
import { commonWordCount } from "./useWordlist"

const vocab = readFileSync(resolve(process.cwd(), "public/wordlist.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)

/**
 * The whole vendored blocklist, not a handful of samples. These words reached
 * users' messages as replacement suggestions, and enough of them in one
 * request made the model provider refuse it outright (finish_reason
 * "content-filter"). scripts/clean-wordlist.mjs strips them.
 */
const BANNED = readFileSync(resolve(process.cwd(), "data/blocked-words.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)

describe("candidates", () => {
  it("wordlist contains no blocked terms", () => {
    const set = new Set(vocab)
    expect(BANNED.filter((w) => set.has(w))).toEqual([])
  })

  it("offers common content words, not function words or archaic junk", async () => {
    const keys = await deriveKeys("swordfish")
    const options = await candidatesFor("kitchen", keys, vocab, new Set())
    expect(options.length).toBeGreaterThan(5)
    // none may be a top-300 function word
    for (const o of options) {
      expect(vocab.indexOf(o)).toBeGreaterThanOrEqual(300)
      // nor from the alphabetical dictionary past the boundary
      expect(vocab.indexOf(o)).toBeLessThan(commonWordCount(vocab))
      expect(o.length).toBeGreaterThanOrEqual(4)
    }
  }, 60_000)

  it("every option actually flips the parity", async () => {
    const keys = await deriveKeys("swordfish")
    for (const word of ["morning", "window", "the"]) {
      const want = 1 - (await wordParity(word, keys))
      const options = await candidatesFor(word, keys, vocab, new Set())
      for (const o of options) {
        expect(await wordParity(o, keys)).toBe(want)
      }
    }
  }, 60_000)

  it("never returns a word already used in the carrier", async () => {
    const keys = await deriveKeys("swordfish")
    const used = new Set(["morning", "window", "kitchen"])
    const options = await candidatesFor("evening", keys, vocab, used)
    for (const o of options) expect(used.has(o)).toBe(false)
  }, 60_000)
})

describe("candidate spread", () => {
  /**
   * Past the Google 10k the wordlist is alphabetical, so a consecutive scan
   * returned options that all began with the same letter — the whole option
   * list would be "marble, march, mare, margin…". Options must sample across
   * the band, not a contiguous alphabetical run.
   */
  it("does not return words that all start with the same letter", async () => {
    const keys = await deriveKeys("swordfish")
    let worst = 0
    for (const word of ["kitchen", "evening", "counter", "shopping", "window"]) {
      const options = await candidatesFor(word, keys, vocab, new Set())
      if (options.length < 6) continue
      const initials = options.map((o) => o[0])
      const commonest = Math.max(
        ...[...new Set(initials)].map(
          (c) => initials.filter((x) => x === c).length,
        ),
      )
      worst = Math.max(worst, commonest / options.length)
    }
    // A contiguous alphabetical run scores 1.0 here; real spread is well under.
    expect(worst).toBeLessThan(0.5)
  }, 60_000)
})

describe("wordlist shape", () => {
  /**
   * COMMON_WORD_COUNT is a hard-coded index into wordlist.txt. If the list is
   * ever regenerated the boundary moves, and every band silently starts
   * drawing archaic dictionary words again.
   */
  it("is frequency-ordered up to the boundary and alphabetical after", () => {
    const COMMON_WORD_COUNT = commonWordCount(vocab)
    // The failure mode is not ordering as such — the dictionary is sorted by
    // some non-ASCII collation ("abay" after "abaft") — it is that one letter
    // takes over, so a band reaching past the boundary offers only "a" words.
    const dominance = (words: string[]) => {
      const initials = words.map((w) => w[0])
      return (
        Math.max(
          ...[...new Set(initials)].map(
            (c) => initials.filter((x) => x === c).length,
          ),
        ) / words.length
      )
    }
    expect(dominance(vocab.slice(2000, 2600))).toBeLessThan(0.3)
    expect(dominance(vocab.slice(COMMON_WORD_COUNT, COMMON_WORD_COUNT + 600)))
      .toBeGreaterThan(0.9)
  })
})
