import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { deriveKeys, wordParity } from "../codec"
import { candidatesFor } from "./candidates"

const vocab = readFileSync(resolve(process.cwd(), "public/wordlist.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)

const BANNED = ["dildo", "porn", "pichunter", "tgp", "xxx", "viagra"]

describe("candidates", () => {
  it("wordlist contains no blocked terms", () => {
    const present = BANNED.filter((w) => vocab.includes(w))
    expect(present).toEqual([])
  })

  it("offers common content words, not function words or archaic junk", async () => {
    const keys = await deriveKeys("swordfish")
    const options = await candidatesFor("kitchen", keys, vocab, new Set())
    expect(options.length).toBeGreaterThan(5)
    // none may be a top-300 function word
    for (const o of options) {
      expect(vocab.indexOf(o)).toBeGreaterThanOrEqual(300)
      // nor from the archaic tail
      expect(vocab.indexOf(o)).toBeLessThan(9000)
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
