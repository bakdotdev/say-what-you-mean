/**
 * Words that carry nothing, for free-write mode.
 *
 * Only function words are listed. Content words that happen to hash as
 * non-carriers ("usa", "shopping", "john") are also free, but they are free
 * by accident of the key: they read as an arbitrary jumble, and they stop
 * being free the moment the passphrase changes. Function words are free by
 * definition under every key, so the list is stable, honest, and made of the
 * words you actually reach for while writing.
 *
 * Being key-independent, this needs no derivation and no async work.
 */
import { useMemo } from "react"
import { FUNCTION_WORDS } from "../codec/features"

export function useFreeWords(
  enabled: boolean,
  vocabulary: readonly string[],
): string[] {
  return useMemo(() => {
    if (!enabled) return []
    // Vocabulary is frequency-ordered, so this comes out commonest-first.
    const seen = new Set<string>()
    const out: string[] = []
    for (const word of vocabulary) {
      if (seen.has(word) || !FUNCTION_WORDS.has(word)) continue
      seen.add(word)
      out.push(word)
    }
    return out
  }, [enabled, vocabulary])
}
