/**
 * Carrier generation for durable (edit-tolerant) mode.
 *
 * What actually decides success is the number of DISTINCT fitting carrier
 * words, and nothing before this measured it. Repeated words add no
 * information — a word's clue depends only on the word — so a 515-word
 * paragraph with 242 distinct words yields only ~50 distinct carriers however
 * long it grows. Measured against the real decoder at a 74-bit payload:
 *
 *   density 1 → ~180 distinct carriers   (≈1800 words: unreachable)
 *   density 2 → ~55                      (≈600 words)
 *
 * Two earlier designs failed on this. Harvesting sentences that already fit
 * kept only ~9% of each run, so sixteen runs still ended ~5 carriers short
 * while reading as stitched fragments. And the success test was
 * `evaluate().solved`, which only asks whether the FITTING words cover the
 * payload — the real decoder also rejects the contradictions thrown by
 * carriers that do not fit, so generation reported success on text that
 * decoded to null.
 *
 * So: write one long piece on one topic, replace every carrier that does not
 * fit, and confirm with an actual decode. On real output that is ~5% of words
 * changed, and one pass suffices because fitting is word-intrinsic — swapping
 * one word never unfits another.
 */
import { useCallback, useState } from "react"
import {
  createEncoder,
  decode,
  DURABLE_DENSITY,
  tokenizeSpans,
  type Encoder,
} from "../codec"
import { isCarrierWord } from "../codec/equations"

export interface DurableGenState {
  busy: boolean
  stage: string
  error: string | null
}

/**
 * Words per request. Prose runs ~1 distinct carrier per 10 words, so this
 * clears the ~55 needed with margin; the generate function has a 60s budget.
 */
const RUN_WORDS = 700
/** Extra passes when the first piece lands short of a decode. */
const MAX_RUNS = 4
/** Vocabulary band scanned for fitting replacements. */
const COMMON_BAND = 20000
const REPLACEMENT_POOL = 6000
const CANDIDATE_POOL = 60
const OPTIONS_PER_SLOT = 20

const TOPICS = [
  "an ordinary afternoon at home",
  "running errands on a grey weekday",
  "tidying the kitchen after dinner",
  "a slow morning with coffee",
  "sorting through a cupboard",
  "walking the same route as always",
  "a quiet evening with the radio on",
  "putting away the shopping",
  "the weather turning over a weekend",
  "a long drive with nothing much happening",
]

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
      setState({ busy: true, stage: "choosing vocabulary…", error: null })
      try {
        const base = import.meta.env.BASE_URL
        const encoder = await createEncoder(
          secret,
          passphrase,
          DURABLE_DENSITY,
          true,
        )

        // Whether a word fits depends only on the word and the key, so the
        // replacement pool is knowable before any text exists.
        const pool = await encoder.suggestFrom(
          "",
          vocabulary.slice(0, COMMON_BAND),
          REPLACEMENT_POOL,
          0,
        )
        const carrierCache = new Map<string, boolean>()
        const isCarrier = async (word: string) => {
          const hit = carrierCache.get(word)
          if (hit !== undefined) return hit
          const value = isCarrierWord(await encoder.digestsFor(word))
          carrierCache.set(word, value)
          return value
        }
        const fitting: string[] = []
        for (const word of pool) if (await isCarrier(word)) fitting.push(word)
        if (fitting.length === 0) {
          setState({ busy: false, stage: "", error: "no usable words found" })
          return null
        }

        const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]
        let text = ""

        for (let run = 1; run <= MAX_RUNS; run++) {
          setState({
            busy: true,
            stage: run === 1 ? "writing…" : `writing more (${run})…`,
            error: null,
          })
          const res = await fetch(`${base}api/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            // No allowed-list: measured at 42-47% adherence, which IS chance
            // given the list is ~half the vocabulary — the models ignore it,
            // and passing it made Sonnet return empty completions. Repairing
            // ~5% of words afterwards beats a constraint nobody honours.
            body: JSON.stringify({
              words: RUN_WORDS,
              topic:
                run === 1
                  ? topic
                  : `${topic} — continue the same account, same voice`,
            }),
          })
          if (!res.ok) {
            const detail = (await res.json().catch(() => ({}))) as {
              error?: string
            }
            if (!text) {
              setState({
                busy: false,
                stage: "",
                error: detail.error ?? `generate failed (${res.status})`,
              })
              return null
            }
            break
          }
          const { carrier } = (await res.json()) as { carrier?: string }
          if (!carrier) continue
          text = text ? `${text} ${carrier}` : carrier

          setState({ busy: true, stage: "fitting words…", error: null })
          const repaired = await repair(
            encoder,
            text,
            fitting,
            `${base}api/rewrite`,
          )
          // The real decoder is the only success test that means anything.
          setState({ busy: true, stage: "checking…", error: null })
          if ((await decode(repaired, passphrase)).secret !== null) {
            setState({ busy: false, stage: "", error: null })
            return repaired
          }
          text = repaired
        }

        setState({
          busy: false,
          stage: "",
          error: "not enough usable text — try again",
        })
        return text || null
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

/**
 * Replace every carrier word that does not fit.
 *
 * Replacements must be DISTINCT from each other and from words already in the
 * text: a repeated word repeats an equation it has already contributed, so
 * duplicates cost coverage without shortening the repair.
 */
async function repair(
  encoder: Encoder,
  carrier: string,
  fitting: readonly string[],
  endpoint: string,
): Promise<string> {
  const state = await encoder.evaluate(carrier)
  const spans = tokenizeSpans(carrier)
  const unfit = state.words
    .map((w, i) => (w.green ? -1 : i))
    .filter((i) => i >= 0)
  if (!unfit.length) return carrier

  const used = new Set(spans.map((s) => s.word))
  const specs: { slot: number; from: string; options: string[] }[] = []
  for (const [n, slot] of unfit.entries()) {
    const span = spans[slot]
    if (!span) continue
    const seed = (n * 137) % Math.max(1, fitting.length)
    const options: string[] = []
    for (let i = 0; i < fitting.length && options.length < OPTIONS_PER_SLOT; i++) {
      const word = fitting[(seed + i) % fitting.length]
      if (used.has(word) || word.length < 3) continue
      options.push(word)
      if (options.length >= CANDIDATE_POOL) break
    }
    if (!options.length) continue
    // Similar length reads least like a substitution.
    options.sort(
      (a, b) =>
        Math.abs(a.length - span.word.length) -
        Math.abs(b.length - span.word.length),
    )
    // Reserve them so no two slots can be offered the same word.
    for (const word of options) used.add(word)
    specs.push({ slot, from: span.word, options })
  }
  if (!specs.length) return carrier

  const chosen = new Map<number, string>()
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        carrier,
        slots: specs.map((s) => ({ from: s.from, options: s.options })),
      }),
    })
    if (res.ok) {
      const { picks } = (await res.json()) as {
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
    // Deterministic fallback below.
  }

  let out = carrier
  for (const spec of [...specs].sort((a, b) => b.slot - a.slot)) {
    const span = spans[spec.slot]
    out =
      out.slice(0, span.start) +
      (chosen.get(spec.slot) ?? spec.options[0]) +
      out.slice(span.end)
  }
  return out
}
