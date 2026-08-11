/**
 * Loads the common-word list once (for the stuck-helper) and, given the
 * current encoder, precomputes each word's keyed digest so suggestions are a
 * fast synchronous filter. Digests depend only on the passphrase, so they are
 * recomputed when the encoder instance changes.
 */
import { useEffect, useState } from "react"
import type { Encoder, WordFeatureDigests } from "../codec"

/**
 * The full list is ~10k frequency-ordered words. Digesting all of them means
 * 4 HMACs each, which stalls the main thread, so suggestions draw from the
 * most common slice — those are the words a person would actually reach for.
 * The codec itself accepts any word the author types; this cap only bounds the
 * "stuck?" helper.
 */
const SUGGESTION_POOL = 2500

let wordsCache: string[] | null = null

const loadWords = async (): Promise<string[]> => {
  if (wordsCache) return wordsCache
  const res = await fetch(`${import.meta.env.BASE_URL}wordlist.txt`)
  const text = await res.text()
  wordsCache = [
    ...new Set(text.split("\n").map((w) => w.trim()).filter(Boolean)),
  ].slice(0, SUGGESTION_POOL)
  return wordsCache
}

export function useWordDigests(encoder: Encoder | null): WordFeatureDigests[] {
  const [digests, setDigests] = useState<WordFeatureDigests[]>([])

  useEffect(() => {
    let cancelled = false
    if (!encoder) {
      setDigests([])
      return
    }
    loadWords()
      .then(async (words) => {
        const out: WordFeatureDigests[] = []
        for (const word of words) {
          out.push(await encoder.digestsFor(word))
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
