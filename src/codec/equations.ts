/**
 * Turns each carrier word into SEVERAL linear equations over the payload bits
 * — one per applicable feature method (see features.ts).
 *
 *   for each feature f of word w:
 *     h = HMAC(k_addr, f)                       (32 pseudo-random bytes)
 *     degree d   <- Soliton-ish distribution from h
 *     subset     <- d distinct payload-bit indices drawn from h
 *     parity     <- one bit from h
 *     equation:  XOR(payload[i] for i in subset) == parity
 *
 * Each equation is a CONSTRAINT the writer satisfies by choosing words — not
 * an opinion to be averaged. (A fixed per-word "vote" carries no information,
 * because its value isn't selectable; see the design spec.)
 *
 * Because a feature depends only on its own word, deleting or reordering
 * words is a clean erasure: it removes that word's equations and manufactures
 * no false ones elsewhere.
 */
import type { Bit } from "./bytes"
import { hmac, type Keys } from "./keys"
import { textToBytes } from "./bytes"
import {
  featuresOf,
  FEATURE_METHODS,
  MAX_DENSITY,
  isFunctionWord,
} from "./features"

export interface Equation {
  /** Distinct payload-bit indices, ascending. */
  subset: number[]
  parity: Bit
  /** Which feature method produced this equation. */
  methodId: string
}

/** Degree distribution (low-degree heavy so the peeling decoder progresses). */
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

/** Small deterministic PRNG (mulberry32) seeded from four digest bytes. */
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

/** Derive one equation from a feature digest. */
export const equationFromDigest = (
  digest: Uint8Array,
  B: number,
  methodId = "id",
): Equation => {
  const degree = degreeFromByte(digest[0], B)
  const seed =
    (digest[1] << 24) | (digest[2] << 16) | (digest[3] << 8) | digest[4]
  const rng = seededRng(seed)
  const subset = new Set<number>()
  while (subset.size < degree) subset.add(Math.floor(rng() * B))
  return {
    subset: [...subset].sort((a, b) => a - b),
    parity: (digest[digest.length - 1] & 1) as Bit,
    methodId,
  }
}

/** Digests for every applicable feature of a word (independent of B). */
export interface WordFeatureDigests {
  word: string
  features: { methodId: string; digest: Uint8Array }[]
}

export const wordDigests = async (
  word: string,
  keys: Keys,
): Promise<WordFeatureDigests> => {
  // Always compute every method's digest; `density` selects how many are used.
  const features = await Promise.all(
    featuresOf(word, MAX_DENSITY).map(async ({ methodId, feature }) => ({
      methodId,
      digest: await hmac(keys.addr, textToBytes(feature)),
    })),
  )
  return { word, features }
}

/**
 * Equations a word asserts at payload size B, using the first `density`
 * feature methods (in FEATURE_METHODS order).
 */
export const equationsFor = (
  fd: WordFeatureDigests,
  B: number,
  density: number = MAX_DENSITY,
): Equation[] => {
  const active = new Set(
    FEATURE_METHODS.slice(0, density).map((m) => m.id),
  )
  return fd.features
    .filter(({ methodId }) => active.has(methodId))
    .map(({ methodId, digest }) => equationFromDigest(digest, B, methodId))
}

/**
 * Carrier selection.
 *
 * A word carries a clue only if its keyed digest says so. The test depends on
 * the KEY ALONE, never on the payload, so the decoder can apply it to received
 * text without knowing the secret — which is what makes the remaining words
 * genuinely free. Those "junk" words are ignored end to end, so prose can be
 * written around the carriers instead of every word having to fit.
 *
 * Function words never carry, whatever their hash says — they are
 * unsubstitutable, so constraining them only fights the writer. Among the
 * remaining content words, 1 in 2 carries, which keeps overall density close
 * to the previous 1-in-3-of-everything while freeing all the connective
 * tissue that makes prose read naturally.
 */
export const JUNK_MODULUS = 2

export const isCarrierWord = (fd: WordFeatureDigests): boolean => {
  if (isFunctionWord(fd.word)) return false
  const digest = fd.features[0]?.digest
  if (!digest) return false
  // Byte 6 is unused by equationFromDigest (which reads 0-4 and the last),
  // so carrier selection stays independent of the equation it produces.
  return digest[6] % JUNK_MODULUS === 0
}

/** Whether an equation is satisfied by the true payload. */
export const isSatisfied = (equation: Equation, payload: Bit[]): boolean => {
  let p = 0
  for (const idx of equation.subset) p ^= payload[idx]
  return p === equation.parity
}

/** Fraction of a word's equations satisfied by the payload (0..1). */
export const agreement = (equations: Equation[], payload: Bit[]): number => {
  if (equations.length === 0) return 0
  const ok = equations.filter((e) => isSatisfied(e, payload)).length
  return ok / equations.length
}
