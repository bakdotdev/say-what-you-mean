/**
 * Live Hide-side evaluation. Rebuilds the encoder when secret/passphrase
 * change, and re-evaluates the carrier (debounced) as the author types.
 * Serializes async work so stale results never overwrite fresh ones.
 */
import { useEffect, useRef, useState } from "react"
import {
  createEncoder,
  DENSITY_PRESETS,
  type EncodeState,
  type Encoder,
} from "../codec"

export interface EncoderStatus {
  state: EncodeState | null
  ready: boolean
  error: string | null
  encoder: Encoder | null
}

const DEBOUNCE_MS = 140

export function useEncoder(
  secret: string,
  passphrase: string,
  carrier: string,
  density: number = DENSITY_PRESETS.balanced,
): EncoderStatus {
  const [encoder, setEncoder] = useState<Encoder | null>(null)
  const [state, setState] = useState<EncodeState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runId = useRef(0)

  // (Re)build the encoder when the secret or passphrase changes.
  useEffect(() => {
    let cancelled = false
    setError(null)
    setState(null)
    if (!secret || !passphrase) {
      setEncoder(null)
      return
    }
    createEncoder(secret, passphrase, density)
      .then((e) => {
        if (!cancelled) setEncoder(e)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [secret, passphrase, density])

  // Evaluate the carrier, debounced, whenever it or the encoder changes.
  useEffect(() => {
    if (!encoder) return
    const id = ++runId.current
    const timer = setTimeout(() => {
      encoder
        .evaluate(carrier)
        .then((s) => {
          if (runId.current === id) setState(s)
        })
        .catch((err: unknown) => {
          if (runId.current === id)
            setError(err instanceof Error ? err.message : String(err))
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [encoder, carrier])

  return { encoder, state, ready: encoder !== null, error }
}
