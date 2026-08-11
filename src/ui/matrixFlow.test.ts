import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { applyPlan } from "./useMatrixPlan"
import {
  buildPayload,
  deriveKeys,
  planEmbedding,
  decode,
  tokenize,
} from "../codec"

const vocabulary = readFileSync(
  resolve(process.cwd(), "public/wordlist.txt"),
  "utf8",
)
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)
  .slice(0, 5000)

const PARAGRAPH =
  "I finally shut my laptop and stretched, ready to leave the workday behind. " +
  "The second I walked into the kitchen my blue heeler was already doing his " +
  "familiar tap dance of anticipation, so I scooped out his kibble before I " +
  "even took off my shoes. We headed out to the park to burn off some of that " +
  "endless herding energy, and watching him sprint circles around the other " +
  "dogs was exactly what I needed to clear my head after a long week at work."

describe("matrix flow (hide -> reveal)", () => {
  it("swaps only a minority of words and decodes back", async () => {
    const secret = "DOCK AT 9"
    const pass = "swordfish"
    const keys = await deriveKeys(pass)
    const payload = await buildPayload(secret, keys)

    const plan = await planEmbedding(PARAGRAPH, payload, keys)
    expect(plan).not.toBeNull()

    const total = tokenize(PARAGRAPH).length
    expect(plan!.flips.length).toBeLessThan(total * 0.5)

    const stego = await applyPlan(PARAGRAPH, plan!.flips, pass, vocabulary)
    const result = await decode(stego, pass)
    expect(result.secret).toBe(secret)
  }, 120_000)

  it("leaves unswapped words byte-identical, punctuation included", async () => {
    const pass = "keeper"
    const keys = await deriveKeys(pass)
    const payload = await buildPayload("HI", keys)
    const plan = await planEmbedding(PARAGRAPH, payload, keys)
    const stego = await applyPlan(PARAGRAPH, plan!.flips, pass, vocabulary)

    const before = tokenize(PARAGRAPH)
    const after = tokenize(stego)
    expect(after).toHaveLength(before.length)
    const flipped = new Set(plan!.flips)
    before.forEach((w, i) => {
      if (!flipped.has(i)) expect(after[i]).toBe(w)
    })
    // Sentence punctuation from the original survives untouched.
    expect(stego).toContain(".")
    expect(stego).toContain(",")
  }, 120_000)

  it("respects locked words end to end", async () => {
    const pass = "locking"
    const keys = await deriveKeys(pass)
    const payload = await buildPayload("GO", keys)
    const words = tokenize(PARAGRAPH)
    const locked = [0, 1, 2, 3, 4]
    const plan = await planEmbedding(PARAGRAPH, payload, keys, locked)
    expect(plan).not.toBeNull()
    for (const f of plan!.flips) expect(locked).not.toContain(f)

    const stego = await applyPlan(PARAGRAPH, plan!.flips, pass, vocabulary)
    const after = tokenize(stego)
    for (const i of locked) expect(after[i]).toBe(words[i])
    expect((await decode(stego, pass)).secret).toBe("GO")
  }, 120_000)

  it("fails clearly under the wrong passphrase", async () => {
    const keys = await deriveKeys("right")
    const payload = await buildPayload("SECRET", keys)
    const plan = await planEmbedding(PARAGRAPH, payload, keys)
    const stego = await applyPlan(PARAGRAPH, plan!.flips, "right", vocabulary)
    expect((await decode(stego, "wrong")).secret).toBeNull()
  }, 120_000)
})
