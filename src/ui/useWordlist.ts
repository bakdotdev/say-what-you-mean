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
 * wordlist.txt is the Google common-English list followed by the dwyl
 * dictionary, and the dictionary is ALPHABETICAL. Past the boundary index
 * 10,000 is "abococket", 20,000 "amphictyony", 29,000 "arugula" — a band
 * reaching beyond it is not "more vocabulary", it is twenty thousand archaic
 * words beginning with "a". Anything choosing replacement words must stop
 * here.
 *
 * Detected rather than hard-coded, because cleaning the list shifts the index
 * and a stale constant silently reopens the bug. The signal is one letter
 * taking over — not sort order, since the dictionary's collation puts "abay"
 * after "abaft" and so is not strictly ascending.
 */
const WINDOW = 200
const TAKEOVER = 0.9

let boundary: { list: readonly string[]; index: number } | null = null

export const commonWordCount = (words: readonly string[]): number => {
  if (boundary?.list === words) return boundary.index
  let index = words.length
  for (let i = 0; i + WINDOW < words.length; i += 10) {
    const counts = new Map<string, number>()
    for (let k = i; k < i + WINDOW; k++) {
      const c = words[k][0]
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    if (Math.max(...counts.values()) / WINDOW > TAKEOVER) {
      index = i
      break
    }
  }
  boundary = { list: words, index }
  return index
}

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
