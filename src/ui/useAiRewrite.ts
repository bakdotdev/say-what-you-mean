/**
 * AI-assisted carrier rewriting for v1.
 *
 * The codec stays authoritative. We compute the embed plan, collect the words
 * that satisfy each required slot, and ask the model to weave those choices
 * into natural prose. Then we re-plan the result and keep it only if it is
 * genuinely clean — so a disobedient model costs a retry, never a broken
 * carrier.
 */
import { useCallback, useState } from "react"
import {
  buildPayload,
  deriveKeys,
  planEmbedding,
  tokenizeSpans,
  wordParity,
} from "../codec"

export interface RewriteState {
  busy: boolean
  error: string | null
  attempts: number
}

const MAX_ATTEMPTS = 3
const OPTIONS_PER_SLOT = 10

/** Words that flip the parity at a slot, preferring natural, similar shapes. */
const optionsFor = async (
  word: string,
  keys: Awaited<ReturnType<typeof deriveKeys>>,
  vocabulary: readonly string[],
): Promise<string[]> => {
  const want = 1 - (await wordParity(word, keys))
  const out: string[] = []
  // Common words come first in the list, which is what we want the model to
  // see; bias slightly toward similar length so the rhythm survives.
  let probes = 0
  for (const candidate of vocabulary) {
    if (out.length >= OPTIONS_PER_SLOT || probes++ > 4000) break
    if (candidate === word) continue
    if (Math.abs(candidate.length - word.length) > 3) continue
    if ((await wordParity(candidate, keys)) !== want) continue
    out.push(candidate)
  }
  return out
}

export function useAiRewrite() {
  const [state, setState] = useState<RewriteState>({
    busy: false,
    error: null,
    attempts: 0,
  })

  const rewrite = useCallback(
    async (
      secret: string,
      passphrase: string,
      carrier: string,
      vocabulary: readonly string[],
      locked: readonly number[],
    ): Promise<string | null> => {
      setState({ busy: true, error: null, attempts: 0 })
      try {
        const keys = await deriveKeys(passphrase)
        const payload = await buildPayload(secret, keys)
        let current = carrier

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          setState((s) => ({ ...s, attempts: attempt }))

          const plan = await planEmbedding(current, payload, keys, locked)
          if (!plan) {
            setState({
              busy: false,
              error: "carrier too short for this secret",
              attempts: attempt,
            })
            return null
          }
          if (plan.clean) {
            setState({ busy: false, error: null, attempts: attempt })
            return current
          }

          const spans = tokenizeSpans(current)
          const slots = []
          for (const slot of plan.flips) {
            const span = spans[slot]
            if (!span) continue
            const options = await optionsFor(span.word, keys, vocabulary)
            if (options.length) slots.push({ from: span.word, options })
          }
          if (!slots.length) break

          const res = await fetch(`${import.meta.env.BASE_URL}api/rewrite`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ carrier: current, slots }),
          })
          if (!res.ok) {
            const detail = (await res.json().catch(() => ({}))) as {
              error?: string
            }
            setState({
              busy: false,
              error: detail.error ?? `rewrite failed (${res.status})`,
              attempts: attempt,
            })
            return null
          }
          const { rewritten } = (await res.json()) as { rewritten: string }
          if (!rewritten || rewritten === current) break
          current = rewritten
        }

        // Final check: only hand back text that actually carries the payload.
        const finalPlan = await planEmbedding(current, payload, keys, locked)
        if (finalPlan?.clean) {
          setState({ busy: false, error: null, attempts: MAX_ATTEMPTS })
          return current
        }
        setState({
          busy: false,
          error: `model got close but not exact — ${finalPlan?.flips.length ?? "?"} words still need swapping`,
          attempts: MAX_ATTEMPTS,
        })
        return current
      } catch (err) {
        setState({
          busy: false,
          error: err instanceof Error ? err.message : String(err),
          attempts: 0,
        })
        return null
      }
    },
    [],
  )

  return { ...state, rewrite }
}
