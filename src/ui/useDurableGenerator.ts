/**
 * Carrier generation for durable (edit-tolerant) mode.
 *
 * Per-word embedding needs EVERY word to fit, which means replacing roughly
 * half of a generated paragraph. That is far more slots than matrix mode, so
 * the model picks in chunks: one oversized prompt makes it skip slots, and a
 * skipped slot silently falls back to a mechanical choice.
 *
 * The codec stays authoritative throughout — we only ever offer words that
 * already satisfy their own equation, so whatever the model picks (or fails to
 * pick) the carrier still decodes.
 */
import { useCallback, useState } from "react"
import { createEncoder, tokenizeSpans, type Encoder } from "../codec"

export interface DurableGenState {
  busy: boolean
  stage: string
  error: string | null
}

const CHUNK_SIZE = 40
const CANDIDATE_POOL = 60
const OPTIONS_PER_SLOT = 20
const MAX_ROUNDS = 4
/**
 * Hand the model as much of the usable vocabulary as is practical. A small
 * sample (700) forced it outside the list constantly, and every stray word
 * then had to be swapped mechanically — which is what wrecked the prose. With
 * a few thousand words it can write naturally AND stay inside the constraint,
 * so the repair pass has almost nothing left to do.
 */
const ALLOWED_SAMPLE = 4000
/** Draw them from the common end of the list so the prose stays plain. */
const COMMON_BAND = 9000

const TOPICS = [
  "an ordinary afternoon at home",
  "running errands on a grey weekday",
  "tidying the kitchen after dinner",
  "a slow morning with coffee",
  "sorting through a cupboard",
  "walking the same route as always",
  "a quiet evening with the radio on",
  "putting away the shopping",
]

/** Green words for a slot, closest in shape to the word being replaced. */
const greenOptionsFor = async (
  encoder: Encoder,
  word: string,
  carrier: string,
  vocabulary: readonly string[],
  offset: number,
): Promise<string[]> => {
  const pool = await encoder.suggestFrom(
    carrier,
    vocabulary,
    CANDIDATE_POOL,
    offset,
  )
  return pool
    .filter((w) => w !== word && w.length >= 3)
    .sort(
      (a, b) =>
        Math.abs(a.length - word.length) - Math.abs(b.length - word.length),
    )
    .slice(0, OPTIONS_PER_SLOT)
}

export function useDurableGenerator() {
  const [state, setState] = useState<DurableGenState>({
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
        const base = import.meta.env.BASE_URL
        const encoder = await createEncoder(secret, passphrase, 1)

        // Whether a word fits depends only on the word and the key, never on
        // its neighbours — so the usable vocabulary is knowable before any
        // text exists. Constraining composition beats repairing prose after
        // the fact, which is what mangled earlier drafts.
        setState({ busy: true, stage: "choosing vocabulary…", error: null })
        const allowed = await encoder.suggestFrom(
          "",
          vocabulary.slice(0, COMMON_BAND),
          ALLOWED_SAMPLE,
          0,
        )

        for (let round = 1; round <= MAX_ROUNDS; round++) {
          // Per-word needs far more words than matrix: every word carries, and
          // only the fitting ones count toward the payload.
          const words = 260 + round * 90
          const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]

          setState({ busy: true, stage: `writing… (${round}/4)`, error: null })
          const genRes = await fetch(`${base}api/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ words, topic, allowed }),
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

          let current = carrier
          // A couple of passes: replacing words changes which others are used,
          // so re-evaluate and mop up the remainder.
          for (let pass = 0; pass < 3; pass++) {
            const state0 = await encoder.evaluate(current)
            if (state0.solved) break

            const spans = tokenizeSpans(current)
            const unfit = state0.words
              .map((w, i) => (w.green ? -1 : i))
              .filter((i) => i >= 0)
            if (!unfit.length) break

            setState({
              busy: true,
              stage: `fitting ${unfit.length} words… (pass ${pass + 1})`,
              error: null,
            })

            const specs: {
              slot: number
              from: string
              options: string[]
              context: string
            }[] = []
            const allWords = spans.map((s) => s.word)
            for (const [n, slot] of unfit.entries()) {
              const span = spans[slot]
              if (!span) continue
              const options = await greenOptionsFor(
                encoder,
                span.word,
                current,
                vocabulary,
                n * 137,
              )
              if (!options.length) continue
              specs.push({
                slot,
                from: span.word,
                options,
                context: allWords
                  .slice(
                    Math.max(0, slot - 4),
                    Math.min(allWords.length, slot + 5),
                  )
                  .join(" "),
              })
            }
            if (!specs.length) break

            // Chunked so the model attends to every slot.
            const chosen = new Map<number, string>()
            for (let i = 0; i < specs.length; i += CHUNK_SIZE) {
              const batch = specs.slice(i, i + CHUNK_SIZE)
              setState({
                busy: true,
                stage: `choosing words… (${Math.min(i + CHUNK_SIZE, specs.length)}/${specs.length})`,
                error: null,
              })
              try {
                const res = await fetch(`${base}api/rewrite`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    carrier: current,
                    slots: batch.map((s) => ({
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
                    const spec = batch[pick.slot]
                    if (spec && spec.options.includes(pick.word)) {
                      chosen.set(spec.slot, pick.word)
                    }
                  }
                }
              } catch {
                // Batch failed: those slots fall back to a valid option.
              }
            }

            let out = current
            for (const spec of [...specs].sort((a, b) => b.slot - a.slot)) {
              const span = spans[spec.slot]
              out =
                out.slice(0, span.start) +
                (chosen.get(spec.slot) ?? spec.options[0]) +
                out.slice(span.end)
            }
            current = out
          }

          const final = await encoder.evaluate(current)
          if (final.solved) {
            setState({ busy: false, stage: "", error: null })
            return current
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
