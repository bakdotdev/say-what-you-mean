/**
 * Turns each carrier word into one linear equation over the payload bits.
 *
 *   h = HMAC(k_addr, word)                       (32 pseudo-random bytes)
 *   degree d   <- Soliton-ish distribution from h
 *   subset     <- d distinct payload-bit indices drawn from h
 *   parity     <- one bit from h
 *   equation:  XOR(payload[i] for i in subset) == parity
 *
 * Because the equation depends ONLY on the word (not its neighbours),
 * deleting or duplicating a word is a clean erasure — it never manufactures
 * a false equation. That is what makes the scheme deletion-robust.
 */
import type { Bit } from "./bytes"
import { hmac, type Keys } from "./keys"
import { textToBytes } from "./bytes"

export interface Equation {
  /** Distinct payload-bit indices, ascending. */
  subset: number[]
  parity: Bit
}

/**
 * Degree distribution (low-degree heavy so the peeling decoder makes
 * progress). Tuned against scratchpad/codec-sim.mjs.
 */
const degreeFromByte = (byte: number, B: number): number => {
  const r = byte / 256
  let d: number
  if (r < 0.08) d = 1
  else if (r < 0.55) d = 2
  else if (r < 0.8) d = 3
  else if (r < 0.92) d = 4
  else d = 5 + (byte & 3)
  return Math.min(d, B)
}

/** Small deterministic PRNG (mulberry32) seeded from four bytes. */
const seededRng = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Derive the equation for a word given its HMAC digest. */
export const equationFromDigest = (digest: Uint8Array, B: number): Equation => {
  const degree = degreeFromByte(digest[0], B)
  // Seed an unbounded index stream from the digest so we can always collect
  // `degree` distinct indices (degree <= B guarantees termination).
  const seed =
    (digest[1] << 24) | (digest[2] << 16) | (digest[3] << 8) | digest[4]
  const rng = seededRng(seed)
  const subset = new Set<number>()
  while (subset.size < degree) {
    subset.add(Math.floor(rng() * B))
  }
  const parity = (digest[digest.length - 1] & 1) as Bit
  return { subset: [...subset].sort((a, b) => a - b), parity }
}

/** The keyed 32-byte digest for a word — independent of B, so it can be
 * computed once and reused across every candidate payload length. */
export const wordDigest = (word: string, keys: Keys): Promise<Uint8Array> =>
  hmac(keys.addr, textToBytes(word))

/** Compute a single word's equation (async: uses HMAC). */
export const wordEquation = async (
  word: string,
  keys: Keys,
  B: number,
): Promise<Equation> => {
  const digest = await wordDigest(word, keys)
  return equationFromDigest(digest, B)
}

/**
 * Whether `word` would light green for `payload` — i.e. its equation is
 * satisfied by the true payload bits.
 */
export const isGreen = (equation: Equation, payload: Bit[]): boolean => {
  let p = 0
  for (const idx of equation.subset) p ^= payload[idx]
  return p === equation.parity
}
