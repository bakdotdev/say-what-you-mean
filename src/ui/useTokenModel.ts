/**
 * Loads the v3 language model, with progress.
 *
 * The weights are ~145 MB and fetched from the Hugging Face CDN on first use.
 * That is the real cost of v3 and the UI has to be honest about it: both the
 * sender and the recipient pay it once, and nothing can happen until it lands.
 * The browser caches it afterwards.
 */
import { useCallback, useRef, useState } from "react"
import { loadModel } from "../codec/tokens"

export interface ModelState {
  ready: boolean
  loading: boolean
  /** 0..1 across the whole download, or null before any file reports size. */
  progress: number | null
  error: string | null
}

export function useTokenModel() {
  const [state, setState] = useState<ModelState>({
    ready: false,
    loading: false,
    progress: null,
    error: null,
  })
  // Per-file byte counts, since several files download concurrently and each
  // reports its own progress.
  const files = useRef(new Map<string, { loaded: number; total: number }>())

  const ensure = useCallback(async () => {
    setState((s) => (s.ready ? s : { ...s, loading: true, error: null }))
    try {
      await loadModel((p) => {
        if (p.total) {
          files.current.set(`${p.stage}:${p.total}`, {
            loaded: p.loaded ?? 0,
            total: p.total,
          })
        }
        let loaded = 0
        let total = 0
        for (const f of files.current.values()) {
          loaded += f.loaded
          total += f.total
        }
        setState((s) => ({
          ...s,
          loading: true,
          progress: total > 0 ? Math.min(1, loaded / total) : null,
        }))
      })
      setState({ ready: true, loading: false, progress: 1, error: null })
      return true
    } catch (err) {
      setState({
        ready: false,
        loading: false,
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }, [])

  return { ...state, ensure }
}
