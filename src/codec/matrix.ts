/**
 * Matrix embedding (syndrome coding) for word-level text steganography.
 *
 * Classic construction — Westfeld's F5, generalized by Fridrich:
 *
 *   cover bit   b_i  = keyed parity of word i
 *   column      H_i  = keyed pseudorandom B-bit column for SLOT i
 *   syndrome    S    = XOR of H_i over all i where b_i = 1
 *   embedding        : choose a set F of slots to flip so that S becomes the
 *                      payload; flipping slot i changes S by exactly H_i
 *
 * The author only has to change the words in F — the minimum-weight coset
 * leader — instead of making every word satisfy its own constraint. Measured on
 * random text: ~16 swaps per 44-bit payload regardless of paragraph length,
 * versus 36-87 under the per-word scheme.
 *
 * Wet paper codes: the author may LOCK any slots (proper nouns, key phrases).
 * Locked slots are simply excluded from the solver's column set. The receiver
 * needs no knowledge of which were locked — it just reads every parity.
 *
 * Robustness note: columns are slot-derived, so this scheme is positional and
 * does NOT inherit the deletion-tolerance of the per-word codec. Deleting a
 * word shifts every later slot. Callers wanting both should carry an outer
 * code; that is deliberately out of scope here.
 */
import { tokenize } from "./tokenize"
import { hmac, type Keys } from "./keys"
import { textToBytes, type Bit } from "./bytes"
import { solveSyndrome, sparsify, type Vec } from "./gf2vec"

/** Keyed parity of a word: the cover bit it contributes. */
export const wordParity = async (
  word: string,
  keys: Keys,
): Promise<Bit> => {
  const digest = await hmac(keys.addr, textToBytes(`parity|${word}`))
  return (digest[0] & 1) as Bit
}

/** Keyed pseudorandom column for a slot index, as a B-bit vector. */
export const slotColumn = async (
  slot: number,
  B: number,
  keys: Keys,
): Promise<Vec> => {
  let col = 0n
  let produced = 0
  let counter = 0
  while (produced < B) {
    const digest = await hmac(keys.addr, textToBytes(`col|${slot}|${counter++}`))
    for (const byte of digest) {
      for (let bit = 0; bit < 8 && produced < B; bit++) {
        if ((byte >> bit) & 1) col |= 1n << BigInt(produced)
        produced++
      }
    }
  }
  return col
}

export interface CoverAnalysis {
  words: string[]
  parities: Bit[]
  columns: Vec[]
  /** Syndrome of the text as written. */
  syndrome: Vec
}

export const analyzeCover = async (
  text: string,
  B: number,
  keys: Keys,
): Promise<CoverAnalysis> => {
  const words = tokenize(text)
  const parities: Bit[] = []
  const columns: Vec[] = []
  let syndrome = 0n
  for (let i = 0; i < words.length; i++) {
    const p = await wordParity(words[i], keys)
    const col = await slotColumn(i, B, keys)
    parities.push(p)
    columns.push(col)
    if (p) syndrome ^= col
  }
  return { words, parities, columns, syndrome }
}

export interface EmbedPlan {
  /** Slot indices whose word must be swapped for one of opposite parity. */
  flips: number[]
  /** Slots the author locked; never selected. */
  locked: number[]
  /** True when the payload is already embedded (no swaps needed). */
  clean: boolean
}

/**
 * Work out the minimal set of word swaps that makes `text` carry `payload`.
 * Returns null if the payload cannot be reached — typically because too many
 * words are locked, or the text is far too short.
 */
export const planEmbedding = async (
  text: string,
  payload: readonly Bit[],
  keys: Keys,
  lockedSlots: readonly number[] = [],
): Promise<EmbedPlan | null> => {
  const B = payload.length
  const { words, columns, syndrome } = await analyzeCover(text, B, keys)
  if (words.length === 0) return null

  let target = syndrome
  for (let i = 0; i < B; i++) if (payload[i]) target ^= 1n << BigInt(i)

  const lockedSet = new Set(lockedSlots)
  const usable: number[] = []
  for (let i = 0; i < words.length; i++) if (!lockedSet.has(i)) usable.push(i)

  const solution = solveSyndrome(columns, usable, target)
  if (!solution) return null

  const minimal = sparsify(solution.flips, solution.nullspace)
  return {
    flips: [...minimal].sort((a, b) => a - b),
    locked: [...lockedSet].sort((a, b) => a - b),
    clean: minimal.size === 0,
  }
}

/** Read the payload back out of a received text. */
export const extractPayload = async (
  text: string,
  B: number,
  keys: Keys,
): Promise<Bit[]> => {
  const { syndrome } = await analyzeCover(text, B, keys)
  const bits: Bit[] = []
  for (let i = 0; i < B; i++) {
    bits.push(Number((syndrome >> BigInt(i)) & 1n) as Bit)
  }
  return bits
}
