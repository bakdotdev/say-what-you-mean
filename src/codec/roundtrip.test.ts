import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createEncoder, type WordDigest } from "./encoder"
import { decode } from "./decoder"

const wordlist = readFileSync(
  resolve(process.cwd(), "public/wordlist.txt"),
  "utf8",
)
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)

/** Grow a carrier of green words until the encoder reports solved. */
const growSolvedCarrier = async (
  secret: string,
  passphrase: string,
): Promise<{ text: string; survivable: number }> => {
  const encoder = await createEncoder(secret, passphrase)
  // precompute candidate digests once
  const candidates: WordDigest[] = []
  const seen = new Set<string>()
  for (const w of wordlist) {
    if (seen.has(w)) continue
    seen.add(w)
    candidates.push({ word: w, digest: await encoder.digestFor(w) })
  }

  const words: string[] = []
  for (let round = 0; round < 60; round++) {
    const text = words.join(" ")
    const state = await encoder.evaluate(text)
    if (state.solved) return { text, survivable: state.survivableDeletions }
    // append a batch of fresh green words; if none, allow reuse of greens
    const fresh = encoder.suggest(text, candidates, 20)
    if (fresh.length === 0) {
      // reuse: append greens already found (still valid equations)
      const anyGreen = words.filter((_, i) => state.wordFlags[i])
      if (anyGreen.length === 0) break
      words.push(...anyGreen.slice(0, 10))
    } else {
      words.push(...fresh)
    }
  }
  const text = words.join(" ")
  const final = await encoder.evaluate(text)
  return { text, survivable: final.solved ? final.survivableDeletions : -1 }
}

const dropWords = (text: string, n: number, seed: number): string => {
  const words = text.split(/\s+/).filter(Boolean)
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const doomed = new Set<number>()
  while (doomed.size < n && doomed.size < words.length) {
    doomed.add(Math.floor(rand() * words.length))
  }
  return words.filter((_, i) => !doomed.has(i)).join(" ")
}

describe("codec round-trip", () => {
  it("hides and recovers several secrets", async () => {
    const cases: [string, string][] = [
      ["MEET AT 8", "correct horse"],
      ["HELLO", "battery staple"],
      ["GO NOW", "swordfish"],
    ]
    for (const [secret, pass] of cases) {
      const { text, survivable } = await growSolvedCarrier(secret, pass)
      expect(survivable).toBeGreaterThanOrEqual(0) // reached solved
      const result = await decode(text, pass)
      expect(result.secret).toBe(secret)
    }
  }, 60_000)

  it("fails to recover with the wrong passphrase", async () => {
    const { text } = await growSolvedCarrier("SECRET", "right pass")
    const result = await decode(text, "wrong pass")
    expect(result.secret).toBeNull()
  }, 60_000)

  it("recovers after deleting words up to the claimed durability", async () => {
    const { text, survivable } = await growSolvedCarrier("MEET AT 8", "key123")
    expect(survivable).toBeGreaterThan(0)
    // Delete exactly the claimed-survivable count, several random draws.
    for (let seed = 1; seed <= 5; seed++) {
      const damaged = dropWords(text, survivable, seed)
      const result = await decode(damaged, "key123")
      expect(result.secret).toBe("MEET AT 8")
    }
  }, 60_000)

  it("survives transport mangling (case, spacing, punctuation)", async () => {
    const { text } = await growSolvedCarrier("HELLO", "keyABC")
    // Realistic transport damage: random case, collapsed/expanded spacing,
    // and punctuation BETWEEN words (trailing) — all of which the tokenizer
    // is defined to ignore. (Punctuation inserted *inside* a word would be a
    // genuine word change and is correctly NOT invariant.)
    const mangled = text
      .split(/\s+/)
      .map((w, i) => (i % 2 ? w.toUpperCase() : w) + (i % 3 ? "," : " —"))
      .join("   ")
    const result = await decode(mangled, "keyABC")
    expect(result.secret).toBe("HELLO")
  }, 60_000)
})
