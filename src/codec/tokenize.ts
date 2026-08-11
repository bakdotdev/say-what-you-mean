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

export const tokenize = (text: string): string[] => {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(SMART_QUOTES, "'")
  const matches = normalized.match(/[a-z0-9']+/g)
  if (!matches) return []
  // A token of only apostrophes carries no letters; drop it.
  return matches.filter((t) => /[a-z0-9]/.test(t))
}
