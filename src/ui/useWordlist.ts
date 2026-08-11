/**
 * Loads the vocabulary once. The list is large (~360k words: the Google 10k
 * common list first, then the dwyl english-words long tail), so we do NOT
 * precompute keyed digests — that would be over a million HMACs. Suggestions
 * hash on demand and stop as soon as enough fitting words are found.
 */
import { useEffect, useState } from "react"

/**
 * Where the frequency-ordered section ends.
 *
 * wordlist.txt is the Google 10k common-English list followed by the dwyl
 * dictionary, and the dictionary is ALPHABETICAL. So index 10,000 is
 * "abococket", 20,000 is "amphictyony", 29,000 is "arugula" — a band reaching
 * past this boundary is not "more vocabulary", it is twenty thousand archaic
 * words beginning with "a". Anything choosing replacement words must stop
 * here.
 */
export const COMMON_WORD_COUNT = 9439

let cache: string[] | null = null
let inflight: Promise<string[]> | null = null

const loadWords = (): Promise<string[]> => {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = fetch(`${import.meta.env.BASE_URL}wordlist.txt`)
      .then((r) => r.text())
      .then((text) => {
        cache = text
          .split("\n")
          .map((w) => w.trim())
          .filter(Boolean)
        return cache
      })
      .catch(() => {
        inflight = null
        return []
      })
  }
  return inflight
}

export function useVocabulary(): string[] {
  const [words, setWords] = useState<string[]>(cache ?? [])

  useEffect(() => {
    let cancelled = false
    loadWords().then((w) => {
      if (!cancelled) setWords(w)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return words
}
