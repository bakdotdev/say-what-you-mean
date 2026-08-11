/**
 * Live matrix-embedding planning for the Hide view.
 *
 * Instead of demanding that every word satisfy its own constraint, this asks:
 * "given the paragraph you already wrote, which minimal set of words must
 * change so the whole text carries the payload?" — the coset leader.
 *
 * Locked words (wet paper codes) are excluded from the solver, so the author
 * can protect names and key phrases; the reader needs no knowledge of them.
 */
import { useEffect, useRef, useState } from "react"
import {
  buildPayload,
  deriveKeys,
  planEmbedding,
  tokenizeSpans,
  wordParity,
  type EmbedPlan,
} from "../codec"

export interface MatrixStatus {
  plan: EmbedPlan | null
  /** Payload size in bits — the carrier needs more words than this. */
  bits: number
  words: number
  /** True when the text already carries the payload. */
  embedded: boolean
  /** Set when the payload cannot be reached (too short, or too much locked). */
  problem: string | null
  busy: boolean
}

const DEBOUNCE_MS = 220

export function useMatrixPlan(
  secret: string,
  passphrase: string,
  carrier: string,
  locked: readonly number[],
): MatrixStatus {
  const [status, setStatus] = useState<MatrixStatus>({
    plan: null,
    bits: 0,
    words: 0,
    embedded: false,
    problem: null,
    busy: false,
  })
  const runId = useRef(0)

  useEffect(() => {
    if (!secret || !passphrase) {
      setStatus((s) => ({ ...s, plan: null, problem: null, busy: false }))
      return
    }
    const id = ++runId.current
    setStatus((s) => ({ ...s, busy: true }))
    const timer = setTimeout(async () => {
      try {
        const keys = await deriveKeys(passphrase)
        const payload = await buildPayload(secret, keys)
        const words = tokenizeSpans(carrier).length
        const bits = payload.length

        if (words === 0) {
          if (runId.current === id)
            setStatus({
              plan: null,
              bits,
              words,
              embedded: false,
              problem: null,
              busy: false,
            })
          return
        }

        const plan = await planEmbedding(carrier, payload, keys, locked)
        if (runId.current !== id) return

        const usable = words - locked.length
        const problem =
          plan === null
            ? usable <= bits
              ? `need more than ${bits} unlocked words — you have ${usable}`
              : "cannot embed in this text; try adding words"
            : null

        setStatus({
          plan,
          bits,
          words,
          embedded: plan?.clean ?? false,
          problem,
          busy: false,
        })
      } catch (err) {
        if (runId.current === id)
          setStatus((s) => ({
            ...s,
            busy: false,
            problem: err instanceof Error ? err.message : String(err),
          }))
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [secret, passphrase, carrier, locked])

  return status
}

/**
 * Rewrite the carrier so the planned slots hold words of the opposite keyed
 * parity, preserving the author's original text everywhere else (including
 * capitalisation and punctuation around untouched words).
 */
export const applyPlan = async (
  carrier: string,
  flips: readonly number[],
  passphrase: string,
  vocabulary: readonly string[],
): Promise<string> => {
  if (flips.length === 0) return carrier
  const keys = await deriveKeys(passphrase)
  const spans = tokenizeSpans(carrier)
  const flipSet = new Set(flips)

  // Pick a replacement whose parity differs from the current word.
  //
  // Scanning the frequency-ordered list top-down returns a wall of function
  // words ("in for this is with"), because those are simply first. Instead,
  // bucket the vocabulary by (first letter, length) and search the bucket that
  // matches the word being replaced, so a six-letter "l" word is swapped for
  // another six-letter "l" word and the sentence keeps its rhythm.
  const used = new Set(spans.map((s) => s.word))
  const replacements = new Map<number, string>()
  const buckets = bucketVocabulary(vocabulary)

  for (const slot of flipSet) {
    const span = spans[slot]
    if (!span) continue
    const original = span.word
    const want = 1 - (await wordParity(original, keys))

    // Try progressively looser buckets: exact shape, then +/-1 length, then
    // any word with the same initial, then anything at all.
    const tiers = [
      buckets.get(shapeKey(original[0], original.length)),
      buckets.get(shapeKey(original[0], original.length + 1)),
      buckets.get(shapeKey(original[0], original.length - 1)),
      buckets.get(initialKey(original[0])),
      vocabulary,
    ]

    let chosen: string | null = null
    for (const tier of tiers) {
      if (!tier || chosen) continue
      let probes = 0
      for (const candidate of tier) {
        if (probes++ > 400) break
        if (used.has(candidate) || candidate === original) continue
        if ((await wordParity(candidate, keys)) !== want) continue
        chosen = candidate
        break
      }
    }

    if (chosen) {
      used.add(chosen)
      replacements.set(slot, chosen)
    }
  }

  // Splice from the end so earlier offsets stay valid.
  let out = carrier
  const ordered = [...replacements.keys()].sort((a, b) => b - a)
  for (const slot of ordered) {
    const span = spans[slot]
    out = out.slice(0, span.start) + replacements.get(slot)! + out.slice(span.end)
  }
  return out
}

const shapeKey = (initial: string, length: number): string =>
  `${initial}:${length}`
const initialKey = (initial: string): string => `${initial}:*`

let bucketCache: {
  source: readonly string[]
  buckets: Map<string, string[]>
} | null = null

/**
 * Index the vocabulary by (first letter, length) and by first letter alone.
 * Built once per vocabulary array and reused across swaps.
 */
const bucketVocabulary = (
  vocabulary: readonly string[],
): Map<string, string[]> => {
  if (bucketCache && bucketCache.source === vocabulary) {
    return bucketCache.buckets
  }
  const buckets = new Map<string, string[]>()
  const push = (key: string, word: string) => {
    const list = buckets.get(key)
    if (list) list.push(word)
    else buckets.set(key, [word])
  }
  for (const word of vocabulary) {
    if (!word) continue
    push(shapeKey(word[0], word.length), word)
    push(initialKey(word[0]), word)
  }
  bucketCache = { source: vocabulary, buckets }
  return buckets
}
