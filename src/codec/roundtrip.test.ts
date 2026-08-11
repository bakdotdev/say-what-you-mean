import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createEncoder, DENSITY_PRESETS, type Encoder } from "./encoder"
import type { WordFeatureDigests } from "./equations"
import { decode } from "./decoder"

const wordlist = readFileSync(
  resolve(process.cwd(), "public/wordlist.txt"),
  "utf8",
)
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)

const candidatesFor = async (
  encoder: Encoder,
): Promise<WordFeatureDigests[]> => {
  const out: WordFeatureDigests[] = []
  const seen = new Set<string>()
  for (const w of wordlist) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(await encoder.digestsFor(w))
  }
  return out
}

/** Grow a carrier of fitting words until the encoder reports solved. */
const growSolvedCarrier = async (
  secret: string,
  passphrase: string,
  density: number = DENSITY_PRESETS.balanced,
): Promise<{ text: string; survivable: number; words: number }> => {
  const encoder = await createEncoder(secret, passphrase, density)
  const candidates = await candidatesFor(encoder)

  // All words that fit this payload, in wordlist order. A real author writes
  // prose; the test just takes the whole available pool.
  const allGreen = encoder.suggest("", candidates, Number.MAX_SAFE_INTEGER)

  // Grow in batches, re-checking after each, so we stop at the minimum length
  // that actually solves.
  const chosen: string[] = []
  for (const word of allGreen) {
    chosen.push(word)
    if (chosen.length % 10 !== 0) continue
    const state = await encoder.evaluate(chosen.join(" "))
    if (state.solved) {
      return {
        text: chosen.join(" "),
        survivable: state.survivableDeletions,
        words: chosen.length,
      }
    }
  }
  const text = chosen.join(" ")
  const final = await encoder.evaluate(text)
  return {
    text,
    survivable: final.solved ? final.survivableDeletions : -1,
    words: chosen.length,
  }
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

describe("codec round-trip (multi-method)", () => {
  it("hides and recovers several secrets", async () => {
    const cases: [string, string][] = [
      ["MEET AT 8", "correct horse"],
      ["HELLO", "battery staple"],
      ["GO NOW", "swordfish"],
    ]
    for (const [secret, pass] of cases) {
      const { text, survivable } = await growSolvedCarrier(secret, pass)
      expect(survivable).toBeGreaterThanOrEqual(0)
      const result = await decode(text, pass)
      expect(result.secret).toBe(secret)
    }
  }, 120_000)

  it("fails to recover with the wrong passphrase", async () => {
    const { text } = await growSolvedCarrier("SECRET", "right pass")
    const result = await decode(text, "wrong pass")
    expect(result.secret).toBeNull()
  }, 120_000)

  it("recovers after deleting words up to the claimed durability", async () => {
    const { text, survivable } = await growSolvedCarrier("MEET AT 8", "key123")
    expect(survivable).toBeGreaterThan(0)
    for (let seed = 1; seed <= 5; seed++) {
      const damaged = dropWords(text, survivable, seed)
      const result = await decode(damaged, "key123")
      expect(result.secret).toBe("MEET AT 8")
    }
  }, 120_000)

  it("survives transport mangling (case, spacing, punctuation)", async () => {
    const { text } = await growSolvedCarrier("HELLO", "keyABC")
    const mangled = text
      .split(/\s+/)
      .map((w, i) => (i % 2 ? w.toUpperCase() : w) + (i % 3 ? "," : " —"))
      .join("   ")
    const result = await decode(mangled, "keyABC")
    expect(result.secret).toBe("HELLO")
  }, 120_000)

  it("lower density makes more words usable", async () => {
    const secret = "MEET AT 8"
    const pass = "density test"
    const tight = await createEncoder(secret, pass, DENSITY_PRESETS.tightest)
    const free = await createEncoder(secret, pass, DENSITY_PRESETS.free)
    const sample = wordlist.slice(0, 300).join(" ")
    const [a, b] = [await tight.evaluate(sample), await free.evaluate(sample)]
    expect(b.greenCount).toBeGreaterThan(a.greenCount)
  }, 120_000)

  it("round-trips at every density level", async () => {
    for (const density of Object.values(DENSITY_PRESETS)) {
      const { text, survivable } = await growSolvedCarrier(
        "GO NOW",
        "per-density",
        density,
      )
      expect(survivable).toBeGreaterThanOrEqual(0)
      const result = await decode(text, "per-density")
      expect(result.secret).toBe("GO NOW")
    }
  }, 180_000)
})
