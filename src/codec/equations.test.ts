import { describe, it, expect } from "vitest"
import {
  equationFromDigest,
  equationsFor,
  wordDigests,
  isSatisfied,
  agreement,
} from "./equations"
import { featuresOf, FEATURE_METHODS } from "./features"
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

describe("features", () => {
  it("extracts all four methods for a normal word", () => {
    const ids = featuresOf("meeting").map((f) => f.methodId)
    expect(ids).toEqual(["id", "lr", "sh", "af"])
  })

  it("skips methods that do not apply to very short words", () => {
    const ids = featuresOf("a").map((f) => f.methodId)
    expect(ids).toEqual(["id"]) // no gaps, no shape, no affixes
  })

  it("letter-gap signature ignores absolute letters", () => {
    const gapOf = (w: string) =>
      FEATURE_METHODS.find((m) => m.id === "lr")!.of(w)
    // "abc" and "bcd" share the same consecutive gaps (+1,+1)
    expect(gapOf("abc")).toBe(gapOf("bcd"))
    expect(gapOf("abc")).not.toBe(gapOf("acb"))
  })
})

describe("equations", () => {
  it("produces distinct in-range indices for a range of B", () => {
    for (const B of [26, 74, 116]) {
      for (let n = 0; n < 100; n++) {
        const eq = equationFromDigest(digestOf("word" + n), B)
        expect(new Set(eq.subset).size).toBe(eq.subset.length)
        for (const idx of eq.subset) {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(B)
        }
      }
    }
  })

  it("gives a word one equation per applicable feature", async () => {
    const keys = await deriveKeys("pass")
    const fd = await wordDigests("meeting", keys)
    const eqs = equationsFor(fd, 74)
    expect(eqs).toHaveLength(4)
    expect(eqs.map((e) => e.methodId)).toEqual(["id", "lr", "sh", "af"])
  })

  it("is deterministic", async () => {
    const keys = await deriveKeys("pass")
    const a = equationsFor(await wordDigests("river", keys), 74)
    const b = equationsFor(await wordDigests("river", keys), 74)
    expect(a).toEqual(b)
  })

  it("isSatisfied and agreement compute subset parity", () => {
    const payload = [1, 0, 1, 1] as const
    expect(
      isSatisfied({ subset: [0, 2], parity: 0, methodId: "id" }, [...payload]),
    ).toBe(true)
    expect(
      isSatisfied({ subset: [0, 1], parity: 0, methodId: "id" }, [...payload]),
    ).toBe(false)
    expect(
      agreement(
        [
          { subset: [0, 2], parity: 0, methodId: "id" },
          { subset: [0, 1], parity: 0, methodId: "sh" },
        ],
        [...payload],
      ),
    ).toBe(0.5)
  })
})
