import { describe, it, expect } from "vitest"
import {
  ALPHABET,
  encodeSymbols,
  decodeSymbols,
  normalizeSecret,
  isEncodable,
  MAX_SECRET_LENGTH,
} from "./alphabet"

describe("alphabet", () => {
  it("has exactly 64 unique symbols", () => {
    expect(ALPHABET).toHaveLength(64)
    expect(new Set(ALPHABET).size).toBe(64)
  })

  it("round-trips a mixed secret (case-insensitive)", () => {
    const codes = encodeSymbols("Meet at 8!")
    expect(decodeSymbols(codes)).toBe("MEET AT 8!")
  })

  it("drops unencodable characters when normalizing", () => {
    // ~ and emoji are not in the alphabet
    expect(normalizeSecret("hi~there")).toBe("HITHERE")
  })

  it("reports encodable vs not", () => {
    expect(isEncodable("q")).toBe(true)
    expect(isEncodable("7")).toBe(true)
    expect(isEncodable("?")).toBe(true)
    expect(isEncodable("~")).toBe(false) // not in the table
    expect(isEncodable("€")).toBe(false)
  })

  it("rejects empty and over-length secrets", () => {
    expect(() => encodeSymbols("")).toThrow(RangeError)
    expect(() => encodeSymbols("~~~")).toThrow(RangeError) // normalizes to empty
    expect(() => encodeSymbols("A".repeat(MAX_SECRET_LENGTH + 1))).toThrow(
      RangeError,
    )
  })

  it("encodes to 6-bit codes in range", () => {
    for (const c of encodeSymbols("THE QUICK 9")) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(64)
    }
  })
})
