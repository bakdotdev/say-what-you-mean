/**
 * Loads the common-word list once (for the stuck-helper) and, given the
 * current encoder, precomputes each word's keyed digest so suggestions are a
 * fast synchronous filter. Digests depend only on the passphrase, so they are
 * recomputed when the encoder instance changes.
 */
import { useEffect, useState } from "react"
import type { Encoder, WordDigest } from "../codec"

let wordsCache: string[] | null = null

const loadWords = async (): Promise<string[]> => {
  if (wordsCache) return wordsCache
  const res = await fetch(`${import.meta.env.BASE_URL}wordlist.txt`)
  const text = await res.text()
  wordsCache = [...new Set(text.split("\n").map((w) => w.trim()).filter(Boolean))]
  return wordsCache
}

export function useWordDigests(encoder: Encoder | null): WordDigest[] {
  const [digests, setDigests] = useState<WordDigest[]>([])

  useEffect(() => {
    let cancelled = false
    if (!encoder) {
      setDigests([])
      return
    }
    loadWords()
      .then(async (words) => {
        const out: WordDigest[] = []
        for (const word of words) {
          out.push({ word, digest: await encoder.digestFor(word) })
        }
        if (!cancelled) setDigests(out)
      })
      .catch(() => {
        if (!cancelled) setDigests([])
      })
    return () => {
      cancelled = true
    }
  }, [encoder])

  return digests
}
