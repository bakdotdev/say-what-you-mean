/**
 * Loads the vocabulary once. The list is large (~360k words: the Google 10k
 * common list first, then the dwyl english-words long tail), so we do NOT
 * precompute keyed digests — that would be over a million HMACs. Suggestions
 * hash on demand and stop as soon as enough fitting words are found.
 */
import { useEffect, useState } from "react"

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
