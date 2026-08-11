/**
 * One-click carrier generation.
 *
 * Generate a mundane paragraph, let the codec decide which few words must
 * change, have the model pick natural replacements, apply them at exact
 * offsets, and verify. If the result is not a complete match — usually because
 * the paragraph came back shorter than the payload needs — try again with a
 * longer target rather than handing back something that does not carry.
 */
import { useCallback, useState } from "react"
import {
  buildPayload,
  deriveKeys,
  planEmbedding,
  tokenizeSpans,
} from "../codec"
import { candidatesFor } from "./candidates"

export interface GeneratorState {
  busy: boolean
  stage: string
  error: string | null
}

const TOPICS = [
  "an ordinary afternoon at home",
  "running errands on a grey weekday",
  "tidying the kitchen after dinner",
  "waiting for a delayed train",
  "a slow morning with coffee",
  "sorting through a cupboard",
  "walking the same route as always",
  "a quiet evening with the radio on",
  "the weather turning over a weekend",
  "putting away the shopping",
  "a long drive with nothing much happening",
  "repotting plants on a windowsill",
]

const MAX_ROUNDS = 3

export function useCarrierGenerator() {
  const [state, setState] = useState<GeneratorState>({
    busy: false,
    stage: "",
    error: null,
  })

  const generate = useCallback(
    async (
      secret: string,
      passphrase: string,
      vocabulary: readonly string[],
    ): Promise<string | null> => {
      setState({ busy: true, stage: "writing…", error: null })
      try {
        const keys = await deriveKeys(passphrase)
        const payload = await buildPayload(secret, keys)
        const base = import.meta.env.BASE_URL

        for (let round = 1; round <= MAX_ROUNDS; round++) {
          // Matrix embedding needs more words than the payload has bits; ask
          // for comfortable headroom so the swaps stay a small fraction.
          const words = Math.round(payload.length * (1.8 + round * 0.4))
          const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]

          setState({ busy: true, stage: `writing… (${round}/3)`, error: null })
          const genRes = await fetch(`${base}api/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ words, topic }),
          })
          if (!genRes.ok) {
            const detail = (await genRes.json().catch(() => ({}))) as {
              error?: string
            }
            setState({
              busy: false,
              stage: "",
              error: detail.error ?? `generate failed (${genRes.status})`,
            })
            return null
          }
          const { carrier } = (await genRes.json()) as { carrier?: string }
          if (!carrier) continue

          setState({ busy: true, stage: "fitting words…", error: null })
          const plan = await planEmbedding(carrier, payload, keys, [])
          if (!plan) continue // too short for this payload; retry longer
          if (plan.clean) {
            setState({ busy: false, stage: "", error: null })
            return carrier
          }

          const spans = tokenizeSpans(carrier)
          const allWords = spans.map((s) => s.word)
          const used = new Set(allWords)
          const specs: {
            slot: number
            from: string
            options: string[]
            context: string
          }[] = []
          for (const slot of plan.flips) {
            const span = spans[slot]
            if (!span) continue
            const options = await candidatesFor(span.word, keys, vocabulary, used)
            if (!options.length) continue
            specs.push({
              slot,
              from: span.word,
              options,
              context: allWords
                .slice(Math.max(0, slot - 4), Math.min(allWords.length, slot + 5))
                .join(" "),
            })
          }
          if (specs.length !== plan.flips.length) continue

          const chosen = new Map<number, string>()
          try {
            const pickRes = await fetch(`${base}api/rewrite`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                carrier,
                slots: specs.map((s) => ({
                  from: s.from,
                  options: s.options,
                  context: s.context,
                })),
              }),
            })
            if (pickRes.ok) {
              const { picks } = (await pickRes.json()) as {
                picks?: { slot: number; word: string }[]
              }
              for (const pick of picks ?? []) {
                const spec = specs[pick.slot]
                if (spec && spec.options.includes(pick.word)) {
                  chosen.set(spec.slot, pick.word)
                }
              }
            }
          } catch {
            // Fall back to deterministic choices below.
          }

          let out = carrier
          for (const spec of [...specs].sort((a, b) => b.slot - a.slot)) {
            const span = spans[spec.slot]
            out =
              out.slice(0, span.start) +
              (chosen.get(spec.slot) ?? spec.options[0]) +
              out.slice(span.end)
          }

          const verify = await planEmbedding(out, payload, keys, [])
          if (verify?.clean) {
            setState({ busy: false, stage: "", error: null })
            return out
          }
        }

        setState({
          busy: false,
          stage: "",
          error: "could not reach a complete match — try again",
        })
        return null
      } catch (err) {
        setState({
          busy: false,
          stage: "",
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    },
    [],
  )

  return { ...state, generate }
}
