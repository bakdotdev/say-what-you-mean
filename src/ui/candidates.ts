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

/**
 * The wordlist is the Google 10k common-English list first, then the long tail
 * of the full dictionary. Candidates must come from a band inside that first
 * portion: past the function words ("this", "be", "more"), but well short of
 * the tail, which is full of archaic and technical junk ("holp", "jota",
 * "dighting"). Both extremes wreck the prose in opposite ways.
 */
const FUNCTION_WORD_RANK = 300
const COMMON_WORD_LIMIT = 9000

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
  const rank = vocabulary.indexOf(word)
  const isFunctionWord = rank >= 0 && rank < FUNCTION_WORD_RANK

  const near: string[] = []
  const wide: string[] = []

  // Search the common band, starting at a random point within it so repeated
  // slots don't all draw the same words.
  const lo = isFunctionWord ? 0 : FUNCTION_WORD_RANK
  const hi = Math.min(vocabulary.length, COMMON_WORD_LIMIT)
  const span = hi - lo
  if (span <= 0) return []
  const start = lo + Math.floor(Math.random() * span)

  let probes = 0
  for (let i = 0; i < span && probes < 6000; i++) {
    if (near.length >= OPTIONS_PER_SLOT) break
    const candidate = vocabulary[lo + ((start - lo + i) % span)]
    if (!candidate || candidate === word || used.has(candidate)) continue
    // Very short words carry little meaning and rarely fit a content slot.
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
