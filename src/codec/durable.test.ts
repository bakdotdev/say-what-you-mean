/**
 * Guards the durable-mode density choice.
 *
 * Two bugs lived here. `evaluate().solved` only asks whether the FITTING
 * words cover the payload, so generation reported success on text the real
 * decoder rejected — carriers that do not fit contribute contradictory
 * equations. And at density 1 a 74-bit payload needs ~180 distinct carrier
 * words, which ordinary prose (~1 distinct carrier per 10 words) reaches only
 * past 1800 words, so it never converged.
 *
 * These tests therefore assert against `decode`, never against `solved`.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, DURABLE_DENSITY, tokenizeSpans } from "."
import { isCarrierWord } from "./equations"

const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)
  .slice(0, 20000)

const SECRET = "DOCK AT 9"
const PASS = "swordfish"

/** Distinct words that both carry and already fit, in vocabulary order. */
const fittingCarriers = async (limit: number): Promise<string[]> => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  const pool = await encoder.suggestFrom("", VOCAB, 6000, 0)
  const out: string[] = []
  for (const word of pool) {
    if (isCarrierWord(await encoder.digestsFor(word))) out.push(word)
    if (out.length >= limit) break
  }
  return out
}

describe("durable mode", () => {
  it("round-trips through the real decoder", async () => {
    const words = await fittingCarriers(90)
    const result = await decode(words.join(" "), PASS)
    expect(result.secret).toBe(SECRET)
  }, 120_000)

  it("survives deleted words, which is the whole point of durable mode", async () => {
    const words = await fittingCarriers(90)
    let text = words.join(" ")
    for (let i = 0; i < 12; i++) {
      const spans = tokenizeSpans(text)
      const at = spans[Math.floor((i * 7 + 3) % spans.length)]
      text = text.slice(0, at.start) + text.slice(at.end)
    }
    expect((await decode(text, PASS)).secret).toBe(SECRET)
  }, 120_000)

  it("stays wrong for the wrong passphrase", async () => {
    const words = await fittingCarriers(90)
    expect((await decode(words.join(" "), "wrong")).secret).toBeNull()
  }, 120_000)

  it("needs far fewer distinct carriers than density 1 did", async () => {
    // The regression that mattered: at density 1 this count was ~180 and
    // unreachable in readable prose. Anything above ~120 means the generator
    // is back to demanding a carrier no one would send.
    const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
    const pool = await encoder.suggestFrom("", VOCAB, 6000, 0)
    const carriers: string[] = []
    for (const word of pool) {
      if (isCarrierWord(await encoder.digestsFor(word))) carriers.push(word)
      if (carriers.length >= 120) break
    }
    let needed = 0
    for (const n of [40, 55, 70, 90, 120]) {
      if ((await decode(carriers.slice(0, n).join(" "), PASS)).secret) {
        needed = n
        break
      }
    }
    expect(needed).toBeGreaterThan(0)
    expect(needed).toBeLessThanOrEqual(120)
  }, 180_000)
})
