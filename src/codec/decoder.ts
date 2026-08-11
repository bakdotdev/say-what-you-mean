/**
 * The Reveal-side engine. Given a received carrier + passphrase, recover the
 * secret. The receiver does not know the secret length N, so it tries each
 * N = 1..16: build the word equations at that B, solve, and accept the first
 * whose MAC verifies. Word digests are computed once and reused across N.
 */
import { tokenize } from "./tokenize"
import { deriveKeys } from "./keys"
import { parsePayload, payloadBitLength } from "./payload"
import { equationFromDigest, wordDigest } from "./equations"
import { MAX_SECRET_LENGTH } from "./alphabet"
import { solve } from "./solver"

export interface Diagnostics {
  words: number
  distinctWords: number
  /** Bits recovered for the accepted N (or best attempt). */
  bitsRecovered: number
  /** B for the accepted N (0 if none). */
  bitsTotal: number
}

export type DecodeResult =
  | { secret: string; diagnostics: Diagnostics }
  | { secret: null; diagnostics: Diagnostics }

export const decode = async (
  text: string,
  passphrase: string,
): Promise<DecodeResult> => {
  const tokens = tokenize(text)
  const distinct = new Set(tokens)
  const base: Diagnostics = {
    words: tokens.length,
    distinctWords: distinct.size,
    bitsRecovered: 0,
    bitsTotal: 0,
  }
  if (tokens.length === 0) return { secret: null, diagnostics: base }

  const keys = await deriveKeys(passphrase)

  // digest each distinct word once
  const digests = new Map<string, Uint8Array>()
  for (const w of distinct) digests.set(w, await wordDigest(w, keys))
  const tokenDigests = tokens.map((t) => digests.get(t)!)

  let best: Diagnostics = base
  for (let n = 1; n <= MAX_SECRET_LENGTH; n++) {
    const B = payloadBitLength(n)
    const equations = tokenDigests.map((d) => equationFromDigest(d, B))
    const { bits, determined } = solve(equations, B)
    if (determined > best.bitsRecovered) {
      best = { ...base, bitsRecovered: determined, bitsTotal: B }
    }
    if (determined !== B) continue
    const parsed = await parsePayload(bits, n, keys)
    if (parsed) {
      return {
        secret: parsed.secret,
        diagnostics: { ...base, bitsRecovered: determined, bitsTotal: B },
      }
    }
  }
  return { secret: null, diagnostics: best }
}
