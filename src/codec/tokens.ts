/**
 * v3 — the secret chooses the words, instead of being forced into them.
 *
 * v1 writes a paragraph and then swaps words until the maths works, which is
 * why ~1 word in 8 ends up chosen by constraint rather than meaning. This
 * inverts that. At each step the language model gives a probability
 * distribution over the next token; bits of the secret pick which of the
 * likely candidates to emit. Every token is one the model would plausibly
 * have produced, so the text is fluent by construction and nothing is ever
 * repaired.
 *
 * Decoding replays the same distributions over the received text and reads
 * back which choice was made at each step.
 *
 * Three things make this work, all measured (see src/lab/v3-*.mjs):
 *
 *   DETERMINISM    the decoder must see the encoder's exact distribution.
 *                  Logits are bitwise identical across runs — drift 0. This
 *                  is why the model runs locally: no API guarantees it, and
 *                  Anthropic exposes no logprobs at all.
 *
 *   RETOKENIZATION the receiver holds TEXT, and must re-encode it to the same
 *                  token ids. Tokens whose printed form does not re-encode to
 *                  themselves are excluded — newlines and whitespace runs are
 *                  the usual culprits, and one of them desynchronises
 *                  everything after it.
 *
 *   CAPACITY       ~4.35 bits of entropy per token, so a 74-bit payload fits
 *                  in 19 tokens. About twenty words, against the ~750 v1
 *                  needs for the same secret.
 *
 * The trade against v1 is stark and deliberate: this is position-dependent.
 * Delete or change one word and every word after it decodes garbage. v1
 * survives sixty deletions; this survives none.
 */
// Imported for its runtime only inside loadModel. A static import puts the
// whole library plus onnxruntime into the main bundle, which every v1 and v2
// visitor would then download without ever using it.
import type {
  PreTrainedModel,
  PreTrainedTokenizer,
  Tensor as TensorType,
} from "@huggingface/transformers"
import { deriveKeys, type Keys } from "./keys"
import { buildPayload, parsePayload, payloadBitLength } from "./payload"
import { MAX_SECRET_LENGTH } from "./alphabet"
import type { Bit } from "./bytes"

/**
 * 145 MB quantized, against 272 MB for gpt2 at comparable quality. Being
 * instruct-tuned it also follows a topic, so the carrier reads as a message
 * about something rather than a random continuation.
 */
export const MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct"

/**
 * How many next-token candidates a step chooses between. Larger carries more
 * bits per token but reaches further down the distribution; the Huffman code
 * keeps the unlikely tail cheap to skip, so this can be wider than the flat
 * scheme allowed.
 */
const CANDIDATE_COUNT = 32

/** Topics the prompt is drawn from, so a carrier reads as an ordinary note. */
const TOPICS = [
  "the weather this week",
  "a delayed train journey",
  "what to cook this evening",
  "tidying the kitchen",
  "a walk in the park",
  "a slow morning at home",
  "running errands in town",
  "a book someone is reading",
  "plans for the weekend",
  "a neighbour's new dog",
  "the queue at the post office",
  "a film watched last night",
  "moving some furniture around",
  "a phone that keeps dying",
  "waiting for a delivery",
  "the garden after the rain",
]

export interface LoadProgress {
  stage: string
  loaded?: number
  total?: number
}

type TensorCtor = new (
  type: string,
  data: BigInt64Array,
  dims: number[],
) => TensorType

let cached: Promise<{
  model: PreTrainedModel
  tokenizer: PreTrainedTokenizer
  Tensor: TensorCtor
}> | null = null

/**
 * Loads the model once per session. The weights are large and fetched from
 * the Hugging Face CDN, so the caller is given progress to show.
 */
export const loadModel = (onProgress?: (p: LoadProgress) => void) => {
  if (!cached) {
    cached = (async () => {
      const report = (item: {
        status?: string
        loaded?: number
        total?: number
      }) => {
        if (!onProgress) return
        onProgress({
          stage: item.status ?? "loading",
          loaded: item.loaded,
          total: item.total,
        })
      }
      const { AutoModelForCausalLM, AutoTokenizer, Tensor } = await import(
        "@huggingface/transformers"
      )
      const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: report,
      })
      const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
        dtype: "q8",
        progress_callback: report,
      })
      return { model, tokenizer, Tensor: Tensor as unknown as TensorCtor }
    })().catch((err) => {
      // A failed load must not poison every later attempt.
      cached = null
      throw err
    })
  }
  return cached
}

/** Next-token logits for a token sequence. */
const logitsFor = async (
  model: PreTrainedModel,
  Tensor: TensorCtor,
  ids: number[],
): Promise<Float32Array> => {
  const out = (await model({
    input_ids: new Tensor(
      "int64",
      BigInt64Array.from(ids, (id) => BigInt(id)),
      [1, ids.length],
    ),
    attention_mask: new Tensor(
      "int64",
      BigInt64Array.from(ids, () => 1n),
      [1, ids.length],
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any
  const [, seq, vocab] = out.logits.dims as number[]
  const start = (seq - 1) * vocab
  return out.logits.data.slice(start, start + vocab) as Float32Array
}

/**
 * Whether a token may be emitted. The receiver re-encodes text, so a token
 * whose printed form tokenizes to anything other than itself desynchronises
 * the stream from that point on.
 */
const safeTokens = (tokenizer: PreTrainedTokenizer) => {
  const cache = new Map<number, boolean>()
  return (id: number): boolean => {
    const hit = cache.get(id)
    if (hit !== undefined) return hit
    let ok = false
    try {
      const text = tokenizer.decode([id], { skip_special_tokens: false })
      ok =
        text.length > 0 &&
        // Prose characters only. Instruct models reach for markdown given
        // half a chance — carriers came back as "**Clean-Ahead Spray" — and
        // asterisks and hashes are not something a text message contains.
        /^[A-Za-z0-9 .,!?;:'"()\u2019\u2018\u201c\u201d-]+$/.test(text) &&
        !/\s\s/.test(text) &&
        text === text.normalize("NFC")
      if (ok) {
        const round = Array.from(tokenizer.encode(text)) as number[]
        ok = round.length === 1 && round[0] === id
      }
    } catch {
      ok = false
    }
    cache.set(id, ok)
    return ok
  }
}

/** The likeliest safe tokens, most likely first, with their probabilities. */
const candidates = (
  logits: Float32Array,
  safe: (id: number) => boolean,
): { id: number; p: number }[] => {
  const best: number[] = []
  for (let i = 0; i < logits.length; i++) {
    if (!safe(i)) continue
    if (best.length < CANDIDATE_COUNT) {
      best.push(i)
      if (best.length === CANDIDATE_COUNT) {
        best.sort((a, b) => logits[b] - logits[a])
      }
    } else if (logits[i] > logits[best[CANDIDATE_COUNT - 1]]) {
      best[CANDIDATE_COUNT - 1] = i
      best.sort((a, b) => logits[b] - logits[a])
    }
  }
  const top = logits[best[0]]
  const weights = best.map((id) => Math.exp(logits[id] - top))
  const total = weights.reduce((a, b) => a + b, 0)
  return best.map((id, i) => ({ id, p: weights[i] / total }))
}

interface Node {
  p: number
  id?: number
  left?: Node
  right?: Node
}

/**
 * Huffman tree over the candidates.
 *
 * Choosing uniformly among the top 2^k tokens spends the same number of bits
 * on the likeliest token as on the 16th likeliest, so half of all choices
 * were improbable ones and the prose showed it — "Duct Tube Cleaners are
 * very". A Huffman code gives likely tokens short codes, so they are picked
 * far more often, and the text tracks what the model would actually have
 * said. It also carries more bits per token on average, which shortens the
 * carrier.
 *
 * Ties are broken by token id so both sides build an identical tree.
 */
const huffman = (cands: { id: number; p: number }[]): Node => {
  const nodes: Node[] = cands.map((c) => ({ p: c.p, id: c.id }))
  const pool = [...nodes]
  while (pool.length > 1) {
    pool.sort((a, b) => a.p - b.p || (a.id ?? 1e9) - (b.id ?? 1e9))
    const left = pool.shift() as Node
    const right = pool.shift() as Node
    pool.push({ p: left.p + right.p, left, right })
  }
  return pool[0]
}

/** Walk the tree consuming bits; returns the chosen token and bits used. */
const walk = (
  root: Node,
  bits: readonly Bit[],
  at: number,
): { id: number; used: number } => {
  let node = root
  let used = 0
  while (node.id === undefined) {
    const bit = bits[at + used] ?? 0
    node = (bit ? node.right : node.left) as Node
    used++
  }
  return { id: node.id, used }
}

/** The code for a token, or null if it is not in the tree. */
const codeFor = (root: Node, id: number): Bit[] | null => {
  const search = (node: Node, path: Bit[]): Bit[] | null => {
    if (node.id === id) return path
    if (node.id !== undefined) return null
    return (
      (node.left && search(node.left, [...path, 0])) ??
      (node.right && search(node.right, [...path, 1])) ??
      null
    )
  }
  return search(root, [])
}

/**
 * The opening the model continues from, as token ids.
 *
 * Derived from the passphrase, so both sides agree on it without anything
 * extra travelling with the message.
 *
 * Uses the model's own chat template. Handing an instruct model a bare
 * instruction as raw text made it answer in the shape of a document —
 * carriers came back as "**** Sentence A**: It wouldnt leave much mess" —
 * because nothing told it where its own turn began.
 */
export const promptIdsFor = (
  tokenizer: PreTrainedTokenizer,
  keys: Keys,
): number[] => {
  // keys.stream is 32 raw bytes derived from the passphrase; any of them
  // serves as a stable index both sides can compute.
  const topic = TOPICS[keys.stream[0] % TOPICS.length]
  // tokenize:false, then encode — apply_chat_template with tokenize:true
  // returns { input_ids, attention_mask } tensors, not a flat id array.
  const text = tokenizer.apply_chat_template(
    [
      {
        role: "user",
        content:
          `Write me a short, ordinary text message about ${topic}. ` +
          `Plain and chatty, one or two sentences, no greeting or sign-off.`,
      },
    ],
    { add_generation_prompt: true, tokenize: false },
  ) as string
  return Array.from(
    tokenizer.encode(text, { add_special_tokens: false }),
  ) as number[]
}

/** Hide `secret` in freshly generated text. */
export const embed = async (
  secret: string,
  passphrase: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string> => {
  const { model, tokenizer, Tensor } = await loadModel()
  const keys = await deriveKeys(passphrase)
  const payload = await buildPayload(secret, keys)
  const safe = safeTokens(tokenizer)

  const ids = promptIdsFor(tokenizer, keys)
  const emitted: number[] = []

  let at = 0
  while (at < payload.length) {
    const tree = huffman(candidates(await logitsFor(model, Tensor, ids), safe))
    const { id, used } = walk(tree, payload, at)
    ids.push(id)
    emitted.push(id)
    at += used
    onProgress?.(Math.min(at, payload.length), payload.length)
  }

  return tokenizer.decode(emitted, { skip_special_tokens: true }).trim()
}

export interface ExtractResult {
  secret: string | null
  tokens: number
  bits: number
}

/** Recover a secret from carrier text, or null if the passphrase is wrong. */
export const extract = async (
  carrier: string,
  passphrase: string,
): Promise<ExtractResult> => {
  const { model, tokenizer, Tensor } = await loadModel()
  const keys = await deriveKeys(passphrase)
  const safe = safeTokens(tokenizer)

  const cursor = promptIdsFor(tokenizer, keys)
  // The carrier begins a fresh assistant turn, so re-encoding it on its own
  // reproduces the ids that were emitted.
  const tokens = Array.from(
    tokenizer.encode(carrier.trim(), { add_special_tokens: false }),
  ) as number[]

  const recovered: Bit[] = []
  for (const token of tokens) {
    const tree = huffman(candidates(await logitsFor(model, Tensor, cursor), safe))
    const code = codeFor(tree, token)
    if (!code) break
    recovered.push(...code)
    cursor.push(token)
  }

  // The length is not known in advance, so try each and let the MAC decide.
  for (let n = 1; n <= MAX_SECRET_LENGTH; n++) {
    const size = payloadBitLength(n)
    if (recovered.length < size) break
    const parsed = await parsePayload(recovered.slice(0, size), n, keys)
    if (parsed) {
      return { secret: parsed.secret, tokens: tokens.length, bits: size }
    }
  }
  return { secret: null, tokens: tokens.length, bits: recovered.length }
}
