/**
 * The Hide-side engine. Given a fixed secret + passphrase, it evaluates a
 * carrier draft on every edit: how well each word fits, whether the payload is
 * recoverable yet, and how many word deletions the draft could survive.
 *
 * Each word asserts one equation per ACTIVE feature method (see `density`).
 * A word is "green" only when it satisfies all of them, which guarantees every
 * equation the decoder sees is true — so word loss is a clean erasure and the
 * linear system can never be corrupted.
 *
 * The density slider trades writing freedom against carrier length: measured on
 * the real wordlist, density 1 leaves ~50% of words usable, density 4 only ~6%,
 * but the carrier shrinks from ~340 words to ~93.
 */
import type { Bit } from "./bytes"
import { tokenize } from "./tokenize"
import { deriveKeys, type Keys } from "./keys"
import { buildPayload, parsePayload, payloadBitLength } from "./payload"
import {
  equationsFor,
  isCarrierWord,
  isSatisfied,
  wordDigests,
  type Equation,
  type WordFeatureDigests,
} from "./equations"
import { solve } from "./solver"

/**
 * Density = how many feature methods are active. A word is usable only if it
 * satisfies ALL active methods, so every equation the decoder sees is true —
 * deletions stay clean erasures and the solve can never be corrupted.
 * Higher density packs more equations per word (shorter carrier) but makes
 * fewer words usable (less writing freedom).
 */
export const DENSITY_PRESETS = {
  free: 1,
  balanced: 2,
  compact: 3,
  tightest: 4,
} as const

export type DensityName = keyof typeof DENSITY_PRESETS

/**
 * Density used by durable (per-word) mode, everywhere.
 *
 * Measured against the REAL decoder for a 74-bit payload — never against
 * `evaluate().solved`, which ignores the contradictions that non-fitting
 * carriers feed the decoder. This is how many DISTINCT fitting carrier words
 * the text must contain:
 *   density 1 → ~180        density 2 → 55-90        density 3 → ~56
 * The spread within a density is word diversity: varied prose reaches it
 * sooner than words taken in vocabulary order.
 *
 * Ordinary prose yields roughly one distinct carrier per ten words, so
 * density 1 needed a ~1800-word carrier and could never converge. Density 2
 * needs ~600-900 words, and it holds a much larger pool of fitting
 * replacements than density 3 (477 vs 221 words from the same band), so
 * repairs read more naturally.
 */
export const DURABLE_DENSITY = 2

export interface WordReport {
  word: string
  /** Fraction of this word's active equations satisfied (0..1). */
  agreement: number
  green: boolean
  satisfied: number
  total: number
  /**
   * True when the key says this word carries nothing. Junk words are ignored
   * by the decoder, so they are free text — the writer may use any word here.
   */
  junk: boolean
}

export interface EncodeState {
  B: number
  tokens: string[]
  words: WordReport[]
  greenCount: number
  redCount: number
  /** Equations contributed by green words. */
  usableEquations: number
  determinedBits: number
  totalBits: number
  solved: boolean
  survivableDeletions: number
}

export interface Encoder {
  readonly B: number
  readonly density: number
  evaluate(text: string): Promise<EncodeState>
  suggest(
    text: string,
    candidates: readonly WordFeatureDigests[],
    limit?: number,
  ): string[]
  /**
   * Scan a large vocabulary for fitting words, hashing on demand and stopping
   * as soon as `limit` are found. Lets the wordlist be hundreds of thousands
   * of words without precomputing (which would be millions of HMACs).
   * `offset` varies which part of the list is scanned so suggestions differ.
   */
  suggestFrom(
    text: string,
    vocabulary: readonly string[],
    limit?: number,
    offset?: number,
  ): Promise<string[]>
  digestsFor(word: string): Promise<WordFeatureDigests>
}

const DELETION_PROBE_STEPS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const
const PROBE_TRIALS = 6

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
  density: number = DENSITY_PRESETS.balanced,
  junkAware = false,
): Promise<Encoder> => {
  const keys: Keys = await deriveKeys(passphrase)
  const payload: Bit[] = await buildPayload(secret, keys)
  const B = payload.length
  const n = (B - 20) / 6
  const cache = new Map<string, WordFeatureDigests>()

  const digestsFor = async (word: string): Promise<WordFeatureDigests> => {
    const hit = cache.get(word)
    if (hit) return hit
    const fd = await wordDigests(word, keys)
    cache.set(word, fd)
    return fd
  }

  const parses = async (bits: (Bit | null)[]): Promise<boolean> =>
    (await parsePayload(bits, n, keys)) !== null

  const reportFor = (fd: WordFeatureDigests): [WordReport, Equation[]] => {
    // Junk words carry nothing and are skipped by the decoder, so they can be
    // anything at all — never report them as needing to change.
    if (junkAware && !isCarrierWord(fd)) {
      return [
        {
          word: fd.word,
          agreement: 1,
          green: true,
          satisfied: 0,
          total: 0,
          junk: true,
        },
        [],
      ]
    }
    const eqs = equationsFor(fd, B, density)
    const good = eqs.filter((e) => isSatisfied(e, payload))
    const ratio = eqs.length === 0 ? 0 : good.length / eqs.length
    // Green requires EVERY active equation to hold, so the decoder never
    // receives a false equation.
    return [
      {
        word: fd.word,
        agreement: ratio,
        green: eqs.length > 0 && good.length === eqs.length,
        satisfied: good.length,
        total: eqs.length,
        junk: false,
      },
      good,
    ]
  }

  const evaluate = async (text: string): Promise<EncodeState> => {
    const tokens = tokenize(text)
    const words: WordReport[] = []
    const usable: Equation[] = []
    for (const token of tokens) {
      const [report, good] = reportFor(await digestsFor(token))
      words.push(report)
      if (report.green) usable.push(...good)
    }
    const greenCount = words.filter((w) => w.green).length

    const { bits, determined } = solve(usable, B)
    const recoverable = determined === B && (await parses(bits))
    const solved = recoverable

    let survivableDeletions = 0
    if (solved) {
      survivableDeletions = await estimateDurability(
        words,
        (w) => reportFor(cache.get(w)!)[1],
        B,
        parses,
      )
    }

    return {
      B,
      tokens,
      words,
      greenCount,
      redCount: tokens.length - greenCount,
      usableEquations: usable.length,
      determinedBits: determined,
      totalBits: B,
      solved,
      survivableDeletions,
    }
  }

  const suggest = (
    text: string,
    candidates: readonly WordFeatureDigests[],
    limit = 8,
  ): string[] => {
    const used = new Set(tokenize(text))
    const out: string[] = []
    for (const fd of candidates) {
      if (out.length >= limit) break
      if (used.has(fd.word)) continue
      if (reportFor(fd)[0].green) out.push(fd.word)
    }
    return out
  }

  const suggestFrom = async (
    text: string,
    vocabulary: readonly string[],
    limit = 10,
    offset = 0,
  ): Promise<string[]> => {
    const used = new Set(tokenize(text))
    const out: string[] = []
    const n = vocabulary.length
    if (n === 0) return out
    // Bounded scan so a miss-heavy pass can never block the UI.
    const maxProbe = Math.min(n, 4000)
    for (let probe = 0; probe < maxProbe && out.length < limit; probe++) {
      const word = vocabulary[(offset + probe) % n]
      if (!word || used.has(word)) continue
      if (reportFor(await digestsFor(word))[0].green) out.push(word)
    }
    return out
  }

  return { B, density, evaluate, suggest, suggestFrom, digestsFor }
}

/** Probe increasing deletion counts; return the largest that always decodes. */
const estimateDurability = async (
  words: WordReport[],
  goodEqsOf: (word: string) => Equation[],
  B: number,
  parses: (bits: (Bit | null)[]) => Promise<boolean>,
): Promise<number> => {
  const green = words.filter((w) => w.green).map((w) => w.word)
  const rng = makeRng(green.length * 2654435761)
  let best = 0
  for (const d of DELETION_PROBE_STEPS) {
    if (d >= green.length) break
    let allOk = true
    for (let t = 0; t < PROBE_TRIALS; t++) {
      const kept = deleteRandom(green, d, rng)
      const eqs = kept.flatMap(goodEqsOf)
      const { bits, determined } = solve(eqs, B)
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
