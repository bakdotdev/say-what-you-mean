/**
 * The 64-symbol secret alphabet. Each symbol is one 6-bit code (index 0..63).
 * Case-insensitive: input is upper-cased before encoding.
 *
 * Layout (frozen as protocol v1):
 *   0..25   A–Z
 *   26..35  0–9
 *   36..63  space and 27 punctuation/symbol characters
 *
 * All 64 entries are distinct, so the table is a bijection code <-> char.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGITS = "0123456789"
const PUNCT = " .,'?!-:;/@&#()\"*+=_%$<>[]{}"

export const ALPHABET = LETTERS + DIGITS + PUNCT

if (ALPHABET.length !== 64 || new Set(ALPHABET).size !== 64) {
  throw new Error(
    `alphabet must be 64 distinct symbols, got ${ALPHABET.length} (${new Set(ALPHABET).size} unique)`,
  )
}

export const MAX_SECRET_LENGTH = 16

const INDEX = new Map<string, number>(
  [...ALPHABET].map((ch, i) => [ch, i] as const),
)

/** Whether a character can appear in a secret (after upper-casing). */
export const isEncodable = (ch: string): boolean =>
  INDEX.has(ch.toUpperCase())

/** Strip a raw secret to only encodable characters, upper-cased. */
export const normalizeSecret = (raw: string): string =>
  [...raw.toUpperCase()].filter((ch) => INDEX.has(ch)).join("")

/** Encode a secret string to an array of 6-bit codes. */
export const encodeSymbols = (secret: string): number[] => {
  const normalized = normalizeSecret(secret)
  if (normalized.length < 1 || normalized.length > MAX_SECRET_LENGTH) {
    throw new RangeError(
      `secret must be 1..${MAX_SECRET_LENGTH} encodable symbols, got ${normalized.length}`,
    )
  }
  return [...normalized].map((ch) => INDEX.get(ch)!)
}

/** Decode 6-bit codes back to a secret string. */
export const decodeSymbols = (codes: number[]): string =>
  codes
    .map((c) => {
      if (c < 0 || c >= 64) throw new RangeError(`code ${c} out of range`)
      return ALPHABET[c]
    })
    .join("")
