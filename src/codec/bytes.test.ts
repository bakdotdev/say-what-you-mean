import { describe, it, expect } from "vitest"
import {
  bytesToBits,
  bitsToBytes,
  intToBits,
  bitsToInt,
  concatBytes,
  bytesToHex,
} from "./bytes"

describe("bytes", () => {
  it("round-trips bytes through bits", () => {
    const bytes = new Uint8Array([0, 1, 128, 255, 42])
    expect(bitsToBytes(bytesToBits(bytes))).toEqual(bytes)
  })

  it("uses big-endian bit order", () => {
    expect(bytesToBits(new Uint8Array([0b1000_0001]))).toEqual([
      1, 0, 0, 0, 0, 0, 0, 1,
    ])
  })

  it("round-trips integers through bits at a given width", () => {
    for (const [v, w] of [
      [0, 4],
      [15, 4],
      [5, 6],
      [116, 8],
    ] as const) {
      expect(bitsToInt(intToBits(v, w))).toBe(v)
      expect(intToBits(v, w)).toHaveLength(w)
    }
  })

  it("throws when an integer does not fit", () => {
    expect(() => intToBits(16, 4)).toThrow(RangeError)
  })

  it("throws packing a non-multiple-of-8 bit array", () => {
    expect(() => bitsToBytes([1, 0, 1])).toThrow(RangeError)
  })

  it("concatenates byte arrays", () => {
    expect(concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]))).toEqual(
      new Uint8Array([1, 2, 3]),
    )
  })

  it("hex-encodes", () => {
    expect(bytesToHex(new Uint8Array([0, 255, 16]))).toBe("00ff10")
  })
})
