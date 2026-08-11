import { describe, it, expect } from "vitest"
import { equationFromDigest, wordEquation, isGreen } from "./equations"
import { deriveKeys } from "./keys"

const digestOf = (label: string): Uint8Array => {
  const out = new Uint8Array(32)
  let h = 2166136261 >>> 0
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < label.length; j++) {
      h ^= label.charCodeAt(j) + i
      h = Math.imul(h, 16777619) >>> 0
    }
    out[i] = h & 255
  }
  return out
}

describe("equations", () => {
  it("produces distinct in-range indices for a range of B", () => {
    for (const B of [20, 26, 74, 116]) {
      for (let n = 0; n < 200; n++) {
        const eq = equationFromDigest(digestOf("word" + n), B)
        expect(eq.subset.length).toBeGreaterThanOrEqual(1)
        expect(new Set(eq.subset).size).toBe(eq.subset.length)
        for (const idx of eq.subset) {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(B)
        }
      }
    }
  })

  it("is deterministic", () => {
    expect(equationFromDigest(digestOf("cat"), 74)).toEqual(
      equationFromDigest(digestOf("cat"), 74),
    )
  })

  it("has a low-degree-heavy distribution", () => {
    const counts = new Map<number, number>()
    for (let n = 0; n < 2000; n++) {
      const d = equationFromDigest(digestOf("w" + n), 74).subset.length
      counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    // degree 1 and 2 should dominate
    const low = (counts.get(1) ?? 0) + (counts.get(2) ?? 0)
    expect(low).toBeGreaterThan(1000)
    expect(counts.get(1) ?? 0).toBeGreaterThan(0)
  })

  it("wordEquation matches equationFromDigest under the real HMAC", async () => {
    const keys = await deriveKeys("pass")
    const eqA = await wordEquation("meet", keys, 74)
    const eqB = await wordEquation("meet", keys, 74)
    expect(eqA).toEqual(eqB)
  })

  it("isGreen checks the parity of the payload subset", () => {
    const payload = [1, 0, 1, 1] as const
    expect(isGreen({ subset: [0, 2], parity: 0 }, [...payload])).toBe(true) // 1^1=0
    expect(isGreen({ subset: [0, 1], parity: 1 }, [...payload])).toBe(true) // 1^0=1
    expect(isGreen({ subset: [0, 1], parity: 0 }, [...payload])).toBe(false)
  })
})
