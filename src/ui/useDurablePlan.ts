/**
 * Durable (edit-tolerant) planning for v1.
 *
 * Matrix embedding indexes words by position, so deleting or inserting a word
 * shifts every slot after it and the message is lost. The per-word scheme does
 * not: each word's clue depends only on itself, so an edit drops that clue and
 * the fountain code reconstructs the rest — the QR-code property.
 *
 * The reason we moved away from per-word was that it required most of the
 * AUTHOR's words to change. That objection disappears when the carrier is
 * generated, which is why this mode pairs with the generator.
 *
 * Trade: roughly double the carrier length for the same secret.
 */
import { useEffect, useRef, useState } from "react"
import { createEncoder, tokenizeSpans, type EncodeState } from "../codec"

export interface DurableStatus {
  state: EncodeState | null
  /** Slots whose word does not yet fit and must be replaced. */
  unfit: number[]
  busy: boolean
  error: string | null
}

const DEBOUNCE_MS = 220

export function useDurablePlan(
  secret: string,
  passphrase: string,
  carrier: string,
  enabled: boolean,
): DurableStatus {
  const [status, setStatus] = useState<DurableStatus>({
    state: null,
    unfit: [],
    busy: false,
    error: null,
  })
  const runId = useRef(0)

  useEffect(() => {
    if (!enabled || !secret || !passphrase) {
      setStatus({ state: null, unfit: [], busy: false, error: null })
      return
    }
    const id = ++runId.current
    setStatus((s) => ({ ...s, busy: true }))
    const timer = setTimeout(async () => {
      try {
        // Density 1 keeps ~50% of words usable, which is the most forgiving
        // setting — the generator has to replace the fewest words.
        const encoder = await createEncoder(secret, passphrase, 1, true)
        const state = await encoder.evaluate(carrier)
        if (runId.current !== id) return
        const unfit = state.words
          .map((w, i) => (w.green ? -1 : i))
          .filter((i) => i >= 0)
        setStatus({ state, unfit, busy: false, error: null })
      } catch (err) {
        if (runId.current === id) {
          setStatus({
            state: null,
            unfit: [],
            busy: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, secret, passphrase, carrier])

  return status
}

/** Words currently in the carrier, for de-duplicating replacements. */
export const carrierWords = (carrier: string): Set<string> =>
  new Set(tokenizeSpans(carrier).map((s) => s.word))
