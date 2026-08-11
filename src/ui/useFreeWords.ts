/**
 * Words that carry nothing, for free-write mode.
 *
 * Junk cannot be assigned — whether a word carries is HMAC(key, word), which
 * is exactly what lets the decoder identify junk from the text alone without
 * any extra data. So instead of tagging words, we offer words that already
 * classify as junk under this passphrase; anything inserted from here is
 * guaranteed not to disturb the payload.
 */
import { useEffect, useState } from "react"
import { deriveKeys } from "../codec"
import { isCarrierWord, wordDigests } from "../codec/equations"

const WANTED = 14
const MAX_PROBES = 900

export function useFreeWords(
  passphrase: string,
  vocabulary: readonly string[],
): string[] {
  const [words, setWords] = useState<string[]>([])

  useEffect(() => {
    if (!passphrase || vocabulary.length === 0) {
      setWords([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const keys = await deriveKeys(passphrase)
        const found: string[] = []
        // Start part-way in so the list is ordinary vocabulary, not the very
        // top function words, and varies between passphrases.
        const start = 300
        for (let i = 0; i < MAX_PROBES && found.length < WANTED; i++) {
          const word = vocabulary[(start + i) % vocabulary.length]
          if (!word || word.length < 3) continue
          if (!isCarrierWord(await wordDigests(word, keys))) found.push(word)
        }
        if (!cancelled) setWords(found)
      } catch {
        if (!cancelled) setWords([])
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [passphrase, vocabulary])

  return words
}
