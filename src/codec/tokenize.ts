/**
 * Protocol-critical tokenizer. The sender and receiver MUST agree on exactly
 * which "words" a piece of text contains, or the equations won't line up.
 *
 * Contract (frozen as protocol v1):
 *   1. Unicode NFKC normalize (fold width/compatibility forms).
 *   2. Lower-case.
 *   3. Normalize smart quotes/backtick to a straight apostrophe.
 *   4. Words = maximal runs of [a-z0-9']. Everything else is a separator
 *      and is ignored entirely.
 *
 * Consequence: changes to CASE, WHITESPACE, and PUNCTUATION in transit are
 * no-ops. Only word-level edits change the token stream — and those are what
 * the erasure code is built to absorb.
 */

const SMART_QUOTES = /[‘’‛`´]/g

export const tokenize = (text: string): string[] =>
  tokenizeSpans(text).map((s) => s.word)

export interface TokenSpan {
  /** Normalized token, exactly as the codec hashes it. */
  word: string
  /** Offsets into the ORIGINAL text, for overlays and highlighting. */
  start: number
  end: number
}

/**
 * Same contract as `tokenize`, but keeps each token's offsets in the original
 * string so the UI can draw over the author's raw text.
 *
 * Normalization is done per-character so offsets stay aligned: NFKC can change
 * a character's length, so we normalize each character and keep the mapping
 * rather than normalizing the whole string up front.
 */
export const tokenizeSpans = (text: string): TokenSpan[] => {
  const spans: TokenSpan[] = []
  let current = ""
  let start = -1

  const flush = (end: number) => {
    if (current && /[a-z0-9]/.test(current)) {
      spans.push({ word: current, start, end })
    }
    current = ""
    start = -1
  }

  for (let i = 0; i < text.length; i++) {
    const normalized = text[i]
      .normalize("NFKC")
      .toLowerCase()
      .replace(SMART_QUOTES, "'")
    // A character may normalize to several; keep only word characters.
    const kept = normalized.replace(/[^a-z0-9']/g, "")
    if (kept) {
      if (start === -1) start = i
      current += kept
    } else {
      flush(i)
    }
  }
  flush(text.length)
  return spans
}
