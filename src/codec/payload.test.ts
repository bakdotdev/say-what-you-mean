import { describe, it, expect } from "vitest"
import {
  buildPayload,
  parsePayload,
  payloadBitLength,
  buildSealedPayload,
  parseSealedPayload,
  sealedPayloadBitLength,
  NONCE_BITS,
} from "./payload"
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

describe("sealed payload (per-message nonce)", () => {
  const nOf = (bits: Bit[]) => (bits.length - NONCE_BITS - 20) / 6
  const fixed = (b: number) => new Uint8Array([b, b, b, b])

  it("computes bit length as 52 + 6N", () => {
    expect(sealedPayloadBitLength(1)).toBe(58)
    expect(sealedPayloadBitLength(9)).toBe(106)
    expect(sealedPayloadBitLength(16)).toBe(148)
  })

  it("round-trips for N = 1, 9, 16", async () => {
    const keys = await deriveKeys("shared secret")
    for (const secret of ["X", "MEET AT 8", "SIXTEEN CHARS 16"]) {
      const bits = await buildSealedPayload(secret, keys)
      const parsed = await parseSealedPayload(bits, nOf(bits), keys)
      expect(parsed?.secret).toBe(secret)
    }
  })

  it("never repeats: the same secret and passphrase give different bits", async () => {
    const keys = await deriveKeys("shared")
    const a = await buildSealedPayload("MEET AT 8", keys)
    const b = await buildSealedPayload("MEET AT 8", keys)
    expect(a).not.toEqual(b)
  })

  it("does not reuse the keystream across messages", async () => {
    // Same secret, two nonces: with a shared keystream the ciphertext bodies
    // would be identical. They must differ.
    const keys = await deriveKeys("shared")
    const a = await buildSealedPayload("MEET AT 8", keys, fixed(1))
    const b = await buildSealedPayload("MEET AT 8", keys, fixed(2))
    const body = (bits: Bit[]) => bits.slice(NONCE_BITS, bits.length - 16)
    expect(body(a)).not.toEqual(body(b))
  })

  it("is deterministic for a fixed nonce", async () => {
    const keys = await deriveKeys("shared")
    expect(await buildSealedPayload("HI", keys, fixed(7))).toEqual(
      await buildSealedPayload("HI", keys, fixed(7)),
    )
  })

  it("fails with the wrong passphrase", async () => {
    const bits = await buildSealedPayload("MEET AT 8", await deriveKeys("right"))
    expect(
      await parseSealedPayload(bits, nOf(bits), await deriveKeys("wrong")),
    ).toBeNull()
  })

  it("fails when any single bit is flipped, nonce included", async () => {
    const keys = await deriveKeys("shared")
    const bits = await buildSealedPayload("HELLO", keys)
    let survived = 0
    for (let i = 0; i < bits.length; i++) {
      const mutated = [...bits]
      mutated[i] = (mutated[i] ^ 1) as Bit
      if (await parseSealedPayload(mutated, nOf(bits), keys)) survived++
    }
    expect(survived).toBe(0)
  })

  it("does not parse as the legacy layout, and vice versa", async () => {
    const keys = await deriveKeys("shared")
    const sealed = await buildSealedPayload("HI", keys, fixed(3))
    const legacy = await buildPayload("HI", keys)
    expect(await parsePayload(sealed.slice(0, payloadBitLength(2)), 2, keys)).toBeNull()
    expect(await parseSealedPayload(legacy, 2, keys)).toBeNull()
  })

  it("rejects a nonce of the wrong size", async () => {
    const keys = await deriveKeys("shared")
    await expect(
      buildSealedPayload("HI", keys, new Uint8Array(3)),
    ).rejects.toThrow(RangeError)
  })
})
