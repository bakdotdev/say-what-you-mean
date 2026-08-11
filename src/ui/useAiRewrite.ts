/**
 * AI-assisted word choice for v1.
 *
 * The model never rewrites the paragraph — matrix embedding's syndrome depends
 * on every word's parity, so a model that touches anything beyond the planned
 * slots invalidates the plan. Instead it only *chooses* which candidate reads
 * best per slot, and we apply those choices ourselves at exact offsets.
 *
 * That makes the result correct by construction: exactly the planned slots
 * change, so the embedding holds on the first pass. Any slot the model skips
 * falls back to the first valid candidate, so the carrier always ends up clean.
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
  /** How many slots the model chose for, of the total needed. */
  chosen: number
  total: number
}

const OPTIONS_PER_SLOT = 24
const CONTEXT_WORDS = 4

/** Candidate words that flip this slot's parity, widest-fit first. */
const optionsFor = async (
  word: string,
  keys: Awaited<ReturnType<typeof deriveKeys>>,
  vocabulary: readonly string[],
  used: Set<string>,
): Promise<string[]> => {
  const want = 1 - (await wordParity(word, keys))
  const near: string[] = []
  const wide: string[] = []
  let probes = 0
  for (const candidate of vocabulary) {
    if (near.length + wide.length >= OPTIONS_PER_SLOT * 2 || probes++ > 12000)
      break
    if (candidate === word || used.has(candidate)) continue
    if ((await wordParity(candidate, keys)) !== want) continue
    const delta = Math.abs(candidate.length - word.length)
    if (delta <= 2) near.push(candidate)
    else if (delta <= 5) wide.push(candidate)
  }
  // Similar-length words first — they read better — then a wider net so the
  // model has genuine semantic choice rather than five near-identical stubs.
  return [...near, ...wide].slice(0, OPTIONS_PER_SLOT)
}

export function useAiRewrite() {
  const [state, setState] = useState<RewriteState>({
    busy: false,
    error: null,
    chosen: 0,
    total: 0,
  })

  const rewrite = useCallback(
    async (
      secret: string,
      passphrase: string,
      carrier: string,
      vocabulary: readonly string[],
      locked: readonly number[],
    ): Promise<string | null> => {
      setState({ busy: true, error: null, chosen: 0, total: 0 })
      try {
        const keys = await deriveKeys(passphrase)
        const payload = await buildPayload(secret, keys)
        const plan = await planEmbedding(carrier, payload, keys, locked)
        if (!plan) {
          setState({
            busy: false,
            error: "carrier too short for this secret",
            chosen: 0,
            total: 0,
          })
          return null
        }
        if (plan.clean) {
          setState({ busy: false, error: null, chosen: 0, total: 0 })
          return carrier
        }

        const spans = tokenizeSpans(carrier)
        const words = spans.map((s) => s.word)
        const used = new Set(words)

        // Build one request describing every slot plus its local context.
        const slotSpecs: {
          slot: number
          from: string
          options: string[]
          context: string
        }[] = []
        for (const slot of plan.flips) {
          const span = spans[slot]
          if (!span) continue
          const options = await optionsFor(span.word, keys, vocabulary, used)
          if (!options.length) continue
          const from = Math.max(0, slot - CONTEXT_WORDS)
          const to = Math.min(words.length, slot + CONTEXT_WORDS + 1)
          slotSpecs.push({
            slot,
            from: span.word,
            options,
            context: words.slice(from, to).join(" "),
          })
        }
        if (!slotSpecs.length) {
          setState({
            busy: false,
            error: "no valid replacements available",
            chosen: 0,
            total: 0,
          })
          return null
        }

        // Ask the model to choose. Failure here is survivable — we fall back to
        // the first valid candidate for every slot.
        const chosenBySlot = new Map<number, string>()
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}api/rewrite`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              carrier,
              slots: slotSpecs.map((s) => ({
                from: s.from,
                options: s.options,
                context: s.context,
              })),
            }),
          })
          if (res.ok) {
            const { picks } = (await res.json()) as {
              picks?: { slot: number; word: string }[]
            }
            for (const pick of picks ?? []) {
              const spec = slotSpecs[pick.slot]
              if (spec && spec.options.includes(pick.word)) {
                chosenBySlot.set(spec.slot, pick.word)
              }
            }
          } else if (res.status === 429) {
            setState({
              busy: false,
              error: "rate limited — try again shortly",
              chosen: 0,
              total: slotSpecs.length,
            })
            return null
          }
        } catch {
          // Offline or blocked: fall through to deterministic choices.
        }

        // Apply from the end so earlier offsets stay valid. Every slot gets a
        // word, model-chosen or not, so the plan is fully satisfied.
        let out = carrier
        const ordered = [...slotSpecs].sort((a, b) => b.slot - a.slot)
        for (const spec of ordered) {
          const span = spans[spec.slot]
          const word = chosenBySlot.get(spec.slot) ?? spec.options[0]
          out = out.slice(0, span.start) + word + out.slice(span.end)
        }

        const verify = await planEmbedding(out, payload, keys, locked)
        setState({
          busy: false,
          error: verify?.clean
            ? null
            : `still ${verify?.flips.length ?? "?"} words short — try again`,
          chosen: chosenBySlot.size,
          total: slotSpecs.length,
        })
        return out
      } catch (err) {
        setState({
          busy: false,
          error: err instanceof Error ? err.message : String(err),
          chosen: 0,
          total: 0,
        })
        return null
      }
    },
    [],
  )

  return { ...state, rewrite }
}
