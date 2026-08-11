import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createEncoder, decode, tokenize } from "../codec"

const vocab = readFileSync(resolve(process.cwd(), "public/wordlist.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)
  .slice(0, 4000)

/** Build a durable carrier the way the generator does: keep only fitting words. */
const buildDurable = async (secret: string, pass: string) => {
  const encoder = await createEncoder(secret, pass, 1)
  const green = await encoder.suggestFrom("", vocab, 4000, 0)
  const words: string[] = []
  for (const w of green) {
    words.push(w)
    if (words.length % 20 === 0) {
      const st = await encoder.evaluate(words.join(" "))
      if (st.solved) return words.join(" ")
    }
  }
  return words.join(" ")
}

describe("durable (edit-tolerant) mode", () => {
  it("decodes, and survives words being deleted", async () => {
    const secret = "DOCK AT 9"
    const pass = "durable test"
    const carrier = await buildDurable(secret, pass)

    expect((await decode(carrier, pass)).secret).toBe(secret)

    // Delete a scattering of words — matrix embedding would break here.
    const words = tokenize(carrier)
    const kept = words.filter((_, i) => i % 17 !== 0)
    const damaged = kept.join(" ")
    expect(damaged.split(/\s+/).length).toBeLessThan(words.length)
    expect((await decode(damaged, pass)).secret).toBe(secret)
  }, 180_000)

  it("survives reordering, since clues are position-free", async () => {
    const secret = "GO NOW"
    const pass = "reorder test"
    const carrier = await buildDurable(secret, pass)
    const words = tokenize(carrier)
    const shuffled = [...words].reverse().join(" ")
    expect((await decode(shuffled, pass)).secret).toBe(secret)
  }, 180_000)

  it("does NOT survive words being altered — documents the real limit", async () => {
    // A deleted word is a clean erasure. An ALTERED word is worse: it looks
    // like a legitimate clue and contributes a false equation the decoder
    // cannot identify without already knowing the payload. Asserting this so
    // the limitation stays visible rather than being quietly assumed away.
    const secret = "GO NOW"
    const pass = "alter test"
    const carrier = await buildDurable(secret, pass)
    const words = tokenize(carrier)
    const mangled = words
      .map((w, i) => (i % 13 === 0 ? `${w}zzq` : w))
      .join(" ")
    expect((await decode(mangled, pass)).secret).not.toBe(secret)
  }, 180_000)
})
