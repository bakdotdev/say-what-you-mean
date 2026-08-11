/**
 * Repair must leave NO unfit carrier behind. A single unfit carrier feeds the
 * decoder a contradictory equation and it rejects the entire text, so a repair
 * that silently skips slots makes generation fail no matter how much text it
 * writes — which is exactly what happened when options were reserved per slot
 * and a few dozen slots drained the pool.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, DURABLE_DENSITY } from "../codec"
import { isCarrierWord } from "../codec/equations"
import { repair } from "./useDurableGenerator"

const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n").map((w) => w.trim()).filter(Boolean).slice(0, 20000)

const SECRET = "DOCK AT 9"
const PASS = "swordfish"
/** No rewrite endpoint in tests, so the deterministic fallback does the work. */
const NO_ENDPOINT = "http://127.0.0.1:1/none"

const setup = async () => {
  const encoder = await createEncoder(SECRET, PASS, DURABLE_DENSITY, true)
  const pool = await encoder.suggestFrom("", VOCAB, 6000, 0)
  const fitting: string[] = []
  for (const w of pool) {
    if (isCarrierWord(await encoder.digestsFor(w))) fitting.push(w)
  }
  return { encoder, fitting }
}

describe("durable repair", () => {
  it("leaves no unfit word, even with far more slots than a pool window", async () => {
    const { encoder, fitting } = await setup()
    // Deliberately hostile: hundreds of words that mostly do not fit.
    const text = VOCAB.slice(2000, 2600).join(" ")
    const before = await encoder.evaluate(text)
    const unfitBefore = before.words.filter((w) => !w.green).length
    expect(unfitBefore).toBeGreaterThan(60)

    const out = await repair(encoder, text, fitting, NO_ENDPOINT)
    const after = await encoder.evaluate(out)
    expect(after.words.filter((w) => !w.green)).toHaveLength(0)
  }, 180_000)

  it("never repeats a replacement, since a repeat adds no coverage", async () => {
    const { encoder, fitting } = await setup()
    const text = VOCAB.slice(2000, 2400).join(" ")
    const out = await repair(encoder, text, fitting, NO_ENDPOINT)
    const words = out.split(/\s+/).filter(Boolean)
    expect(new Set(words).size).toBe(words.length)
  }, 180_000)

  it("produces a decodable carrier from unusable text", async () => {
    const { encoder, fitting } = await setup()
    const out = await repair(
      encoder,
      VOCAB.slice(2000, 2600).join(" "),
      fitting,
      NO_ENDPOINT,
    )
    expect((await decode(out, PASS)).secret).toBe(SECRET)
  }, 180_000)
})
