import { describe, it, expect } from "vitest"
import { solve } from "./solver"
import { equationFromDigest, isSatisfied, type Equation } from "./equations"
import type { Bit } from "./bytes"

// Build a deterministic pseudo-random digest for a label.
const fakeDigest = (label: string): Uint8Array => {
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

// Collect green equations for a known payload until it solves.
const greenEquationsFor = (payload: Bit[], count: number): Equation[] => {
  const B = payload.length
  const eqs: Equation[] = []
  let n = 0
  while (eqs.length < count && n < count * 40) {
    const eq = equationFromDigest(fakeDigest("w" + n++), B)
    if (isSatisfied(eq, payload)) eqs.push(eq)
  }
  return eqs
}

describe("solver", () => {
  it("recovers a fully determined system", () => {
    const B = 74
    const payload: Bit[] = Array.from({ length: B }, (_, i) =>
      i % 3 === 0 ? 1 : 0,
    )
    const eqs = greenEquationsFor(payload, 400)
    const { bits, determined } = solve(eqs, B)
    expect(determined).toBe(B)
    expect(bits).toEqual(payload)
  })

  it("leaves untouched bits null (erasure) when under-constrained", () => {
    const B = 20
    const payload: Bit[] = new Array(B).fill(0)
    // Only a handful of equations — cannot determine everything.
    const eqs = greenEquationsFor(payload, 3)
    const { bits, determined } = solve(eqs, B)
    expect(determined).toBeLessThan(B)
    expect(bits.some((b) => b === null)).toBe(true)
  })

  it("solves a small hand-built coupled system via gaussian finish", () => {
    // bits: x0 x1 x2 ; x0=1
    // x0^x1 = 1  -> x1 = 0
    // x1^x2 = 1  -> x2 = 1
    const eqs: Equation[] = [
      { subset: [0], parity: 1, methodId: "id" },
      { subset: [0, 1], parity: 1, methodId: "id" },
      { subset: [1, 2], parity: 1, methodId: "id" },
    ]
    const { bits } = solve(eqs, 3)
    expect(bits).toEqual([1, 0, 1])
  })
})
