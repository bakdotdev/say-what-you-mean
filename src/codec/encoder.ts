/**
 * The Hide-side engine. Given a fixed secret + passphrase, it evaluates a
 * carrier draft on every edit: which words are "green" (their equation is
 * consistent with the true payload), whether the payload is fully recoverable
 * yet, and roughly how many word deletions the current draft could survive.
 *
 * A finished carrier is ALL green: guided composition means the author keeps
 * only green words. A red word is an inconsistent (false) equation, so the
 * draft is not considered solved until every word is green.
 */
import type { Bit } from "./bytes"
import { tokenize } from "./tokenize"
import { deriveKeys, type Keys } from "./keys"
import { buildPayload, parsePayload, payloadBitLength } from "./payload"
import {
  equationFromDigest,
  isGreen,
  wordDigest,
  type Equation,
} from "./equations"
import { solve } from "./solver"

export interface EncodeState {
  B: number
  tokens: string[]
  /** true = green (consistent with payload), false = red (should be changed). */
  wordFlags: boolean[]
  greenCount: number
  redCount: number
  determinedBits: number
  totalBits: number
  /** Fully recoverable AND no red words. */
  solved: boolean
  /** Conservative estimate of how many word deletions still decode. */
  survivableDeletions: number
}

export interface Encoder {
  readonly B: number
  evaluate(text: string): Promise<EncodeState>
  /** Up to `limit` fresh, currently-unused words from `candidates` that are
   *  green for this payload. */
  suggest(
    text: string,
    candidates: readonly WordDigest[],
    limit?: number,
  ): string[]
  /** Expose a word's digest so callers can precompute candidate lists. */
  digestFor(word: string): Promise<Uint8Array>
}

export interface WordDigest {
  word: string
  digest: Uint8Array
}

const DELETION_PROBE_STEPS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const
const PROBE_TRIALS = 8

/** Deterministic-ish RNG so durability estimates are stable across renders. */
const makeRng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const createEncoder = async (
  secret: string,
  passphrase: string,
): Promise<Encoder> => {
  const keys: Keys = await deriveKeys(passphrase)
  const payload: Bit[] = await buildPayload(secret, keys)
  const B = payload.length
  const n = (B - 20) / 6
  const digestCache = new Map<string, Uint8Array>()

  const digestFor = async (word: string): Promise<Uint8Array> => {
    const cached = digestCache.get(word)
    if (cached) return cached
    const d = await wordDigest(word, keys)
    digestCache.set(word, d)
    return d
  }

  const parses = async (bits: (Bit | null)[]): Promise<boolean> =>
    (await parsePayload(bits, n, keys)) !== null

  const evaluate = async (text: string): Promise<EncodeState> => {
    const tokens = tokenize(text)
    const equations: Equation[] = []
    const wordFlags: boolean[] = []
    for (const token of tokens) {
      const eq = equationFromDigest(await digestFor(token), B)
      equations.push(eq)
      wordFlags.push(isGreen(eq, payload))
    }
    const greenEqs = equations.filter((_, i) => wordFlags[i])
    const greenCount = greenEqs.length
    const redCount = tokens.length - greenCount

    const { bits, determined } = solve(greenEqs, B)
    const recoverable = determined === B && (await parses(bits))
    const solved = recoverable && redCount === 0

    let survivableDeletions = 0
    if (solved) {
      survivableDeletions = await estimateDurability(greenEqs, B, parses)
    }

    return {
      B,
      tokens,
      wordFlags,
      greenCount,
      redCount,
      determinedBits: determined,
      totalBits: B,
      solved,
      survivableDeletions,
    }
  }

  const suggest = (
    text: string,
    candidates: readonly WordDigest[],
    limit = 8,
  ): string[] => {
    const used = new Set(tokenize(text))
    const out: string[] = []
    for (const { word, digest } of candidates) {
      if (out.length >= limit) break
      if (used.has(word)) continue
      if (isGreen(equationFromDigest(digest, B), payload)) out.push(word)
    }
    return out
  }

  return { B, evaluate, suggest, digestFor }
}

/** Probe increasing deletion counts; return the largest that always decodes. */
const estimateDurability = async (
  greenEqs: Equation[],
  B: number,
  parses: (bits: (Bit | null)[]) => Promise<boolean>,
): Promise<number> => {
  const rng = makeRng(greenEqs.length * 2654435761)
  let best = 0
  for (const d of DELETION_PROBE_STEPS) {
    if (d >= greenEqs.length) break
    let allOk = true
    for (let t = 0; t < PROBE_TRIALS; t++) {
      const kept = deleteRandom(greenEqs, d, rng)
      const { bits, determined } = solve(kept, B)
      if (determined !== B || !(await parses(bits))) {
        allOk = false
        break
      }
    }
    if (allOk) best = d
    else break
  }
  return best
}

const deleteRandom = <T>(items: T[], count: number, rng: () => number): T[] => {
  const doomed = new Set<number>()
  while (doomed.size < count && doomed.size < items.length) {
    doomed.add(Math.floor(rng() * items.length))
  }
  return items.filter((_, i) => !doomed.has(i))
}

export { payloadBitLength }
