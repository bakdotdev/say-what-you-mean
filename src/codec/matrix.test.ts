import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { deriveKeys } from "./keys"
import { buildPayload } from "./payload"
import {
  planEmbedding,
  extractPayload,
  wordParity,
  analyzeCover,
} from "./matrix"
import { tokenize } from "./tokenize"
import type { Bit } from "./bytes"

const vocab = readFileSync(resolve(process.cwd(), "public/wordlist.txt"), "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)
  .slice(0, 6000)

// Matrix embedding needs more words than payload bits (each slot contributes
// one column; B bits require B independent columns). A 9-character secret is
// 74 bits, so the carrier must comfortably exceed that.
const PARAGRAPH =
  "i finally shut my laptop and stretched ready to leave the workday behind " +
  "the second i walked into the kitchen my blue heeler was already doing his " +
  "familiar tap dance of anticipation so i scooped out his kibble before i " +
  "even took off my shoes and we headed out to the park to burn off some of " +
  "that endless energy before dinner in the quiet of the evening while the " +
  "rain tapped against the window and the kettle began to whistle softly in " +
  "the background as i sorted through the mail that had piled up all week " +
  "beside the door where we always drop our keys and gloves after a long walk"

/** Apply a plan by swapping each flipped word for one of opposite parity. */
const applyPlan = async (
  text: string,
  flips: readonly number[],
  keys: Awaited<ReturnType<typeof deriveKeys>>,
): Promise<string> => {
  const words = tokenize(text)
  const flipSet = new Set(flips)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    if (!flipSet.has(i)) {
      out.push(words[i])
      continue
    }
    const want = 1 - (await wordParity(words[i], keys))
    let chosen: string | null = null
    for (const cand of vocab) {
      if ((await wordParity(cand, keys)) === want) {
        chosen = cand
        break
      }
    }
    out.push(chosen ?? words[i])
  }
  return out.join(" ")
}

describe("matrix embedding", () => {
  it("embeds and extracts a payload with few swaps", async () => {
    const keys = await deriveKeys("matrix key")
    const payload = await buildPayload("DOCK AT 9", keys)
    const plan = await planEmbedding(PARAGRAPH, payload, keys)
    expect(plan).not.toBeNull()

    const words = tokenize(PARAGRAPH).length
    // Should be far below the "every word must fit" regime.
    expect(plan!.flips.length).toBeLessThan(words / 2)

    const stego = await applyPlan(PARAGRAPH, plan!.flips, keys)
    const recovered = await extractPayload(stego, payload.length, keys)
    expect(recovered).toEqual([...payload])
  }, 120_000)

  it("never selects locked slots (wet paper codes)", async () => {
    const keys = await deriveKeys("locked key")
    const payload = await buildPayload("HI", keys)
    const total = tokenize(PARAGRAPH).length
    // Lock the first third of the text.
    const locked = Array.from({ length: Math.floor(total / 3) }, (_, i) => i)
    const plan = await planEmbedding(PARAGRAPH, payload, keys, locked)
    expect(plan).not.toBeNull()
    for (const f of plan!.flips) expect(locked).not.toContain(f)

    const stego = await applyPlan(PARAGRAPH, plan!.flips, keys)
    const recovered = await extractPayload(stego, payload.length, keys)
    expect(recovered).toEqual([...payload])
  }, 120_000)

  it("keeps every locked word byte-identical in the output", async () => {
    const keys = await deriveKeys("preserve")
    const payload = await buildPayload("GO", keys)
    const words = tokenize(PARAGRAPH)
    const locked = [0, 1, 2, 3, 4, 5]
    const plan = await planEmbedding(PARAGRAPH, payload, keys, locked)
    const stego = await applyPlan(PARAGRAPH, plan!.flips, keys)
    const after = tokenize(stego)
    for (const i of locked) expect(after[i]).toBe(words[i])
  }, 120_000)

  it("extracts nothing meaningful under the wrong key", async () => {
    const right = await deriveKeys("right key")
    const wrong = await deriveKeys("wrong key")
    const payload = await buildPayload("SECRET", right)
    const plan = await planEmbedding(PARAGRAPH, payload, right)
    const stego = await applyPlan(PARAGRAPH, plan!.flips, right)
    const bad = await extractPayload(stego, payload.length, wrong)
    expect(bad).not.toEqual([...payload])
  }, 120_000)

  it("reports a clean plan when the text already carries the payload", async () => {
    const keys = await deriveKeys("clean")
    const payload = await buildPayload("OK", keys)
    const plan = await planEmbedding(PARAGRAPH, payload, keys)
    const stego = await applyPlan(PARAGRAPH, plan!.flips, keys)
    // Re-planning the already-embedded text should need no further swaps.
    const again = await planEmbedding(stego, payload, keys)
    expect(again!.clean).toBe(true)
    expect(again!.flips).toEqual([])
  }, 120_000)

  it("analyzes cover consistently", async () => {
    const keys = await deriveKeys("analyze")
    const a = await analyzeCover(PARAGRAPH, 44, keys)
    const b = await analyzeCover(PARAGRAPH, 44, keys)
    expect(a.syndrome).toBe(b.syndrome)
    expect(a.parities.length).toBe(tokenize(PARAGRAPH).length)
  }, 60_000)
})

describe("matrix embedding efficiency", () => {
  it("needs dramatically fewer changes than per-word fitting", async () => {
    const keys = await deriveKeys("efficiency")
    const payload: Bit[] = await buildPayload("DOCK AT 9", keys)
    const plan = await planEmbedding(PARAGRAPH, payload, keys)
    const total = tokenize(PARAGRAPH).length
    const pct = (100 * plan!.flips.length) / total
    // Per-word fitting demanded ~75-80% of words be replaced.
    expect(pct).toBeLessThan(45)
  }, 120_000)
})
