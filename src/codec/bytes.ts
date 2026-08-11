/**
 * Small pure helpers for moving between bytes, bits, and text.
 * No DOM, no crypto — just data shuffling used across the codec.
 */

export type Bit = 0 | 1

export const textToBytes = (s: string): Uint8Array =>
  new TextEncoder().encode(s)

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

/** Big-endian bits of a byte array, most-significant bit first. */
export const bytesToBits = (bytes: Uint8Array): Bit[] => {
  const bits: Bit[] = []
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push(((b >> i) & 1) as Bit)
  }
  return bits
}

/** Pack big-endian bits back into bytes (length must be a multiple of 8). */
export const bitsToBytes = (bits: Bit[]): Uint8Array => {
  if (bits.length % 8 !== 0)
    throw new RangeError(`bit length ${bits.length} not a multiple of 8`)
  const out = new Uint8Array(bits.length / 8)
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 3] |= 1 << (7 - (i & 7))
  }
  return out
}

/** Encode an unsigned integer as `width` big-endian bits. */
export const intToBits = (value: number, width: number): Bit[] => {
  if (value < 0 || value >= 2 ** width)
    throw new RangeError(`value ${value} does not fit in ${width} bits`)
  const bits: Bit[] = []
  for (let i = width - 1; i >= 0; i--) bits.push(((value >> i) & 1) as Bit)
  return bits
}

export const bitsToInt = (bits: Bit[]): number =>
  bits.reduce<number>((acc, b) => acc * 2 + b, 0)

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
