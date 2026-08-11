/**
 * Carrier generation for durable (edit-tolerant) mode.
 *
 * Earlier versions generated one paragraph then mechanically swapped every
 * word that didn't fit. That is what wrecked the prose: replacing ~30% of a
 * paragraph with words chosen by constraint rather than meaning leaves
 * grammatical nonsense.
 *
 * This harvests instead. Per-word embedding is position-free — a fitting word
 * carries the same clue wherever it sits — so sentences concatenate freely.
 * We generate in short runs and keep the sentences that ALREADY fit best,
 * repairing only their handful of stray words.
 *
 * Demanding perfectly clean sentences does not work: at ~70% word adherence a
 * twelve-word sentence is fully clean about 1% of the time, and eight runs
 * yielded none. But sentences with one or two strays are common, and fixing
 * one word barely dents readability — where swapping 30% of a paragraph
 * destroys it. So we rank by how little repair a sentence needs and take the
 * cleanest.
 */
import { useCallback, useState } from "react"
import { createEncoder, tokenizeSpans, type Encoder } from "../codec"
import { isCarrierWord } from "../codec/equations"

export interface DurableGenState {
  busy: boolean
  stage: string
  error: string | null
}

/**
 * A large allowed list is what actually makes the model stay in-vocabulary.
 * 800 was far too few — it strayed constantly and almost no sentence survived
 * harvesting. Generation runs on a Node function with a 60s budget so the
 * prompt can be this big.
 */
const ALLOWED_SAMPLE = 3000
const COMMON_BAND = 9000
/** Words per run. Short runs hold the vocabulary far better than long ones. */
const RUN_WORDS = 300
const MAX_RUNS = 8
/** Keep a sentence only if at most this fraction of its words need changing. */
const MAX_STRAY_RATIO = 0.5
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

/** Split into sentences, keeping their terminating punctuation. */
const sentencesOf = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

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
        const encoder = await createEncoder(secret, passphrase, 1, true)

        // Whether a word fits depends only on the word and the key, so the
        // usable vocabulary is knowable before any text exists.
        const allowed = await encoder.suggestFrom(
          "",
          vocabulary.slice(0, COMMON_BAND),
          ALLOWED_SAMPLE,
          0,
        )
        const allowedSet = new Set(allowed)
        // Carrier membership is key-only, so it can be memoised per word.
        const carrierCache = new Map<string, boolean>()
        const isCarrier = async (word: string) => {
          const hit = carrierCache.get(word)
          if (hit !== undefined) return hit
          const value = isCarrierWord(await encoder.digestsFor(word))
          carrierCache.set(word, value)
          return value
        }

        const chosenTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)]
        const kept: { sentence: string; strays: number }[] = []

        for (let run = 1; run <= MAX_RUNS; run++) {
          setState({
            busy: true,
            stage: `writing… (run ${run}, ${kept.length} sentences kept)`,
            error: null,
          })

          // ONE topic for the whole generation. Rotating topics per run made
          // the harvested sentences read as unrelated fragments — a kettle
          // sentence beside a train-platform sentence — which is the main
          // reason the result felt "all over the place".
          const topic = chosenTopic
          const res = await fetch(`${base}api/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            // No allowed-list: measured at 42-47% adherence, which IS chance
            // given the list is ~half the vocabulary — the models ignore it,
            // and passing it made Sonnet return empty completions. Junk words
            // and the function-word exemption already cut the constrained
            // share to ~23%, so free prose plus a small repair beats a
            // constraint nobody honours.
            body: JSON.stringify({ words: RUN_WORDS, topic }),
          })
          if (!res.ok) {
            const detail = (await res.json().catch(() => ({}))) as {
              error?: string
            }
            if (kept.length === 0) {
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

          // Only CARRIER words have to fit; junk words are ignored by the
          // decoder, so they never count as strays however unusual they are.
          for (const sentence of sentencesOf(carrier)) {
            const words = tokenizeSpans(sentence).map((s) => s.word)
            if (words.length < 4) continue
            let carriers = 0
            let strays = 0
            for (const w of words) {
              if (!(await isCarrier(w))) continue
              carriers++
              if (!allowedSet.has(w)) strays++
            }
            if (carriers === 0 || strays / carriers <= MAX_STRAY_RATIO) {
              kept.push({ sentence, strays })
            }
          }
          if (kept.length === 0) continue
          // Cleanest first, so the least-repaired text leads.
          kept.sort((a, b) => a.strays - b.strays)

          // Repair BEFORE testing. Harvested sentences still contain stray
          // carriers, so raw accumulated text never reports solved — which is
          // why earlier runs piled up 700+ words and still failed. Repairing
          // each round means the loop actually converges, and it stops at the
          // first length that works instead of running to the cap.
          const raw = kept.map((k) => k.sentence).join(" ")
          const candidate = await repair(
            encoder,
            raw,
            vocabulary,
            `${base}api/rewrite`,
          )
          if ((await encoder.evaluate(candidate)).solved) {
            // Harvested sentences come from different runs and topics, so they
            // read as fragments. Ask for one coherent paragraph built ONLY
            // from words already proven to fit — every word in that pool is
            // known-good, so the result needs no repair at all.
            setState({ busy: true, stage: "composing…", error: null })
            const proven = [
              ...new Set(
                tokenizeSpans(candidate)
                  .map((sp) => sp.word)
                  .filter((w) => allowedSet.has(w)),
              ),
            ]
            const polished = await composeFrom(
              `${base}api/generate`,
              proven,
              Math.round(tokenizeSpans(candidate).length * 1.15),
              `${chosenTopic}, as one continuous account`,
            )
            if (polished) {
              const check = await encoder.evaluate(polished)
              if (check.solved) {
                setState({ busy: false, stage: "", error: null })
                return polished
              }
            }
            setState({ busy: false, stage: "", error: null })
            return candidate
          }
        }

        if (kept.length === 0) {
          setState({
            busy: false,
            stage: "",
            error: "no usable sentences came back — try again",
          })
          return null
        }

        // Final attempt on everything harvested.
        setState({ busy: true, stage: "fitting the last few words…", error: null })
        const repaired = await repair(
          encoder,
          kept.map((k) => k.sentence).join(" "),
          vocabulary,
          `${base}api/rewrite`,
        )
        const final = await encoder.evaluate(repaired)
        setState({
          busy: false,
          stage: "",
          error: final.solved ? null : "not enough usable text — try again",
        })
        return repaired
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
 * Ask for a single coherent paragraph using only words already proven to fit.
 * Returns null on any failure — the caller keeps the harvested text instead.
 */
async function composeFrom(
  endpoint: string,
  provenWords: readonly string[],
  words: number,
  topic: string,
): Promise<string | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        words,
        topic,
        allowed: provenWords,
      }),
    })
    if (!res.ok) return null
    const { carrier } = (await res.json()) as { carrier?: string }
    return carrier ?? null
  } catch {
    return null
  }
}

/** Last-resort word substitution, used only when harvesting cannot finish. */
async function repair(
  encoder: Encoder,
  carrier: string,
  vocabulary: readonly string[],
  endpoint: string,
): Promise<string> {
  const state = await encoder.evaluate(carrier)
  if (state.solved) return carrier
  const spans = tokenizeSpans(carrier)
  const unfit = state.words
    .map((w, i) => (w.green ? -1 : i))
    .filter((i) => i >= 0)
  if (!unfit.length) return carrier

  const specs: { slot: number; from: string; options: string[] }[] = []
  for (const [n, slot] of unfit.entries()) {
    const span = spans[slot]
    if (!span) continue
    const pool = await encoder.suggestFrom(
      carrier,
      vocabulary,
      CANDIDATE_POOL,
      n * 137,
    )
    const options = pool
      .filter((w) => w !== span.word && w.length >= 3)
      .sort(
        (a, b) =>
          Math.abs(a.length - span.word.length) -
          Math.abs(b.length - span.word.length),
      )
      .slice(0, OPTIONS_PER_SLOT)
    if (options.length) specs.push({ slot, from: span.word, options })
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
