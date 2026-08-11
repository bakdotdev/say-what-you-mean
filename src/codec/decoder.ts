/**
 * The Reveal-side engine. The receiver knows neither the secret length N nor
 * the density the writer used, so it searches both: for each (density, N) it
 * builds the equation set, solves, and MAC-checks.
 *
 * Because a green word satisfies every ACTIVE method, all equations at the
 * correct density are simultaneously true. That gives a cheap early reject:
 * if two equations over the same bit-subset disagree, the candidate density is
 * wrong (its extra methods are contributing arbitrary parities) and we skip it
 * before doing any linear algebra.
 */
import { tokenize } from "./tokenize"
import { deriveKeys } from "./keys"
import { parsePayload, payloadBitLength } from "./payload"
import {
  equationsFor,
  wordDigests,
  type Equation,
  type WordFeatureDigests,
} from "./equations"
import { MAX_SECRET_LENGTH } from "./alphabet"
import { MAX_DENSITY } from "./features"
import { solve } from "./solver"

export interface Diagnostics {
  words: number
  distinctWords: number
  /** Equations available at the accepted (or best) density. */
  equations: number
  /** Density that decoded (0 if none). */
  density: number
  bitsRecovered: number
  bitsTotal: number
}

export type DecodeResult = {
  secret: string | null
  diagnostics: Diagnostics
}

/**
 * Deduplicate equations; return null if any two contradict, which means this
 * density is wrong.
 */
const consistentRows = (equations: Equation[]): Equation[] | null => {
  const seen = new Map<string, Equation>()
  for (const eq of equations) {
    const key = eq.subset.join(",")
    const prior = seen.get(key)
    if (prior === undefined) seen.set(key, eq)
    else if (prior.parity !== eq.parity) return null
  }
  return [...seen.values()]
}

export const decode = async (
  text: string,
  passphrase: string,
): Promise<DecodeResult> => {
  const tokens = tokenize(text)
  const distinct = new Set(tokens)
  const base: Diagnostics = {
    words: tokens.length,
    distinctWords: distinct.size,
    equations: 0,
    density: 0,
    bitsRecovered: 0,
    bitsTotal: 0,
  }
  if (tokens.length === 0) return { secret: null, diagnostics: base }

  const keys = await deriveKeys(passphrase)

  const digestMap = new Map<string, WordFeatureDigests>()
  for (const w of distinct) digestMap.set(w, await wordDigests(w, keys))
  const perToken = tokens.map((t) => digestMap.get(t)!)

  let best: Diagnostics = base
  // Prefer higher density (more equations, fastest solve) but try all.
  for (let density = MAX_DENSITY; density >= 1; density--) {
    for (let n = 1; n <= MAX_SECRET_LENGTH; n++) {
      const B = payloadBitLength(n)
      const all = perToken.flatMap((fd) => equationsFor(fd, B, density))
      const rows = consistentRows(all)
      if (rows === null) continue // contradiction -> wrong density
      const { bits, determined } = solve(rows, B)
      const diag: Diagnostics = {
        ...base,
        equations: all.length,
        density,
        bitsRecovered: determined,
        bitsTotal: B,
      }
      if (determined > best.bitsRecovered) best = diag
      if (determined !== B) continue
      const parsed = await parsePayload(bits, n, keys)
      if (parsed) return { secret: parsed.secret, diagnostics: diag }
    }
  }
  return { secret: null, diagnostics: best }
}
