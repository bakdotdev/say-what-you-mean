import { describe, it, expect } from "vitest"
import { buildPayload, parsePayload, payloadBitLength } from "./payload"
import { deriveKeys } from "./keys"
import type { Bit } from "./bytes"

describe("payload", () => {
  it("computes bit length as 20 + 6N", () => {
    expect(payloadBitLength(1)).toBe(26)
    expect(payloadBitLength(9)).toBe(74)
    expect(payloadBitLength(16)).toBe(116)
  })

  it("round-trips for N = 1, 9, 16", async () => {
    const keys = await deriveKeys("shared secret")
    for (const secret of ["X", "MEET AT 8", "SIXTEEN CHARS 16"]) {
      const bits = await buildPayload(secret, keys)
      const n = (bits.length - 20) / 6
      const parsed = await parsePayload(bits, n, keys)
      expect(parsed?.secret).toBe(secret)
    }
  })

  it("fails with the wrong passphrase", async () => {
    const a = await deriveKeys("right")
    const b = await deriveKeys("wrong")
    const bits = await buildPayload("MEET AT 8", a)
    const n = (bits.length - 20) / 6
    expect(await parsePayload(bits, n, b)).toBeNull()
  })

  it("fails when any single bit is flipped (sampled)", async () => {
    const keys = await deriveKeys("shared")
    const bits = await buildPayload("HELLO", keys)
    const n = (bits.length - 20) / 6
    // flip each bit position once; none should verify
    let survived = 0
    for (let i = 0; i < bits.length; i++) {
      const mutated = [...bits]
      mutated[i] = (mutated[i] ^ 1) as Bit
      if (await parsePayload(mutated, n, keys)) survived++
    }
    expect(survived).toBe(0)
  })

  it("returns null for the wrong N or for erasures", async () => {
    const keys = await deriveKeys("shared")
    const bits = await buildPayload("HI", keys)
    const n = (bits.length - 20) / 6
    expect(await parsePayload(bits, n + 1, keys)).toBeNull()
    const withNull: (Bit | null)[] = [...bits]
    withNull[0] = null
    expect(await parsePayload(withNull, n, keys)).toBeNull()
  })
})
