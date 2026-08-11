/**
 * Candidate replacement words for a slot.
 *
 * The vocabulary is frequency-ordered, so naively taking the first parity
 * matches returns a wall of function words ("this", "be", "more") — useless
 * when the word being replaced is a content word, and no amount of model
 * cleverness can pick well from a bad list.
 *
 * So: exclude function words when replacing a content word, and sample ACROSS
 * the whole vocabulary rather than off the top, so the model gets varied,
 * content-bearing options of a similar shape.
 */
import { wordParity, type deriveKeys } from "../codec"

/** Frequency rank below which a word is treated as a function word. */
const FUNCTION_WORD_RANK = 320

export const OPTIONS_PER_SLOT = 24

export interface CandidateOptions {
  /** Words that flip this slot's parity, best-reading first. */
  options: string[]
}

/**
 * @param word       the word being replaced
 * @param keys       derived keys (for parity)
 * @param vocabulary frequency-ordered word list
 * @param used       words already present in the carrier, to avoid repeats
 */
export const candidatesFor = async (
  word: string,
  keys: Awaited<ReturnType<typeof deriveKeys>>,
  vocabulary: readonly string[],
  used: Set<string>,
): Promise<string[]> => {
  const want = 1 - (await wordParity(word, keys))
  const isFunctionWord = vocabulary.indexOf(word) >= 0 &&
    vocabulary.indexOf(word) < FUNCTION_WORD_RANK

  const near: string[] = []
  const wide: string[] = []

  // Stride-sample the vocabulary so candidates come from across the frequency
  // range, not just the most common words. The stride is coprime-ish with the
  // list length so it wanders rather than clustering.
  const n = vocabulary.length
  if (n === 0) return []
  const stride = 7919
  const start = Math.floor(Math.random() * n)

  let probes = 0
  for (let i = 0; i < n && probes < 9000; i++) {
    if (near.length >= OPTIONS_PER_SLOT) break
    const idx = (start + i * stride) % n
    const candidate = vocabulary[idx]
    if (!candidate || candidate === word || used.has(candidate)) continue

    // Replacing a content word with "the" reads terribly; skip function words
    // unless the original was one itself.
    if (!isFunctionWord && idx < FUNCTION_WORD_RANK) continue
    // Very short words carry little meaning and rarely fit.
    if (!isFunctionWord && candidate.length < 4) continue

    probes++
    if ((await wordParity(candidate, keys)) !== want) continue

    const delta = Math.abs(candidate.length - word.length)
    if (delta <= 2) near.push(candidate)
    else if (delta <= 4 && wide.length < OPTIONS_PER_SLOT) wide.push(candidate)
  }

  const merged = [...near, ...wide].slice(0, OPTIONS_PER_SLOT)
  if (merged.length > 0) return merged

  // Last resort: any parity match at all, so a slot is never unfillable.
  const fallback: string[] = []
  let scanned = 0
  for (const candidate of vocabulary) {
    if (fallback.length >= 8 || scanned++ > 4000) break
    if (candidate === word || used.has(candidate)) continue
    if ((await wordParity(candidate, keys)) === want) fallback.push(candidate)
  }
  return fallback
}
