/**
 * v3 — which local model to embed with.
 *
 * The model has to run in the browser on BOTH ends, identically, so the field
 * is small on-device models with ONNX builds. Kimi and friends are not
 * candidates: K2 is ~1T parameters, three orders of magnitude past anything
 * that downloads to a browser, and there is no transformers.js build.
 *
 * What matters, in order:
 *   determinism    — decoder must see the encoder's exact distribution
 *   retokenization — receiver re-encodes text to the same token ids
 *   entropy        — sets how many tokens a 74-bit secret needs
 *   prose quality  — the entire point of switching to this approach
 *   download size  — paid by both sender and recipient, on first use
 *
 * Run: node src/lab/v3-models.mjs
 */
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Tensor,
} from "@huggingface/transformers"

/**
 * Measured (drift 0 and a clean round trip for all of these):
 *
 *   onnx-community/gpt2-ONNX          q8   272 MB   5.57 bits/token
 *   SmolLM2-135M-Instruct             q8   145 MB   4.35
 *   SmolLM2-360M-Instruct             q8   355 MB   5.22
 *   Qwen2.5-0.5B-Instruct             q8   503 MB   5.72
 *   Xenova/gpt2                       fp32 480 MB   5.58  (no quantized build)
 *
 * The download is paid by sender AND recipient on first use, so it is the
 * dominant cost. Entropy only sets how many tokens a secret needs; at 4 bits
 * per token every one of these lands a 74-bit payload in 19 tokens.
 */
const CANDIDATES = [
  { id: "onnx-community/gpt2-ONNX", dtype: "q8", note: "2019, quantized" },
  { id: "HuggingFaceTB/SmolLM2-135M-Instruct", dtype: "q8", note: "2024, on-device" },
]

const PROMPT = "I got back from the shop and put the bags on the counter."
const BITS = 4

const logitsFor = async (model, ids) => {
  const out = await model({
    input_ids: new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    attention_mask: new Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
  })
  const [, seq, vocab] = out.logits.dims
  const start = (seq - 1) * vocab
  return out.logits.data.slice(start, start + vocab)
}

/**
 * Top 2^bits tokens, highest probability first, restricted to tokens that
 * survive a text round trip.
 *
 * The receiver re-encodes TEXT, so a token whose printed form re-tokenizes
 * differently desynchronises everything after it. Newlines and runs of
 * whitespace are the usual culprits — they are what made SmolLM2-360M fail
 * outright. Excluding them costs a little entropy and buys correctness.
 */
const candidates = (logits, bits, safe) => {
  const n = 1 << bits
  const best = []
  for (let i = 0; i < logits.length; i++) {
    if (!safe(i)) continue
    if (best.length < n) {
      best.push(i)
      if (best.length === n) best.sort((a, b) => logits[b] - logits[a])
    } else if (logits[i] > logits[best[n - 1]]) {
      best[n - 1] = i
      best.sort((a, b) => logits[b] - logits[a])
    }
  }
  return best
}

/** Cache of which token ids are safe to emit, per tokenizer. */
const safeChecker = (tokenizer) => {
  const cache = new Map()
  return (id) => {
    const hit = cache.get(id)
    if (hit !== undefined) return hit
    let ok = false
    try {
      const text = tokenizer.decode([id], { skip_special_tokens: false })
      ok =
        text.length > 0 &&
        !/[\n\r\t]/.test(text) &&
        !/\s\s/.test(text) &&
        text === text.normalize("NFC")
      if (ok) {
        const round = Array.from(tokenizer.encode(text))
        ok = round.length === 1 && round[0] === id
      }
    } catch {
      ok = false
    }
    cache.set(id, ok)
    return ok
  }
}

const toBits = (bytes) => {
  const out = []
  for (const b of bytes) for (let i = 7; i >= 0; i--) out.push((b >> i) & 1)
  return out
}

const PAYLOAD = toBits(
  new Uint8Array([0x8f, 0x2a, 0xd1, 0x77, 0x03, 0xbe, 0x45, 0x19, 0xc2, 0x60]),
).slice(0, 74)

const evaluate = async ({ id, dtype, note }) => {
  let tokenizer, model
  try {
    tokenizer = await AutoTokenizer.from_pretrained(id)
    model = await AutoModelForCausalLM.from_pretrained(id, { dtype, device: "cpu" })
  } catch (err) {
    console.log(`MODEL ${id} — UNAVAILABLE: ${String(err).slice(0, 120)}`)
    return
  }

  const prefix = Array.from(tokenizer.encode(PROMPT))
  const safe = safeChecker(tokenizer)

  // Determinism.
  const a = await logitsFor(model, prefix)
  const b = await logitsFor(model, prefix)
  let drift = 0
  for (let i = 0; i < a.length; i++) drift = Math.max(drift, Math.abs(a[i] - b[i]))

  // Entropy of the first step. Spreading a 150k-element vocab into Math.max
  // overflows the call stack, hence the loop.
  let max = -Infinity
  for (let i = 0; i < a.length; i++) if (a[i] > max) max = a[i]
  const ex = Array.from(a, (x) => Math.exp(x - max))
  const sum = ex.reduce((p, q) => p + q, 0)
  const entropy = -ex.reduce((acc, e) => {
    const p = e / sum
    return p > 0 ? acc + p * Math.log2(p) : acc
  }, 0)

  // Full round trip.
  const ids = [...prefix]
  const emitted = []
  for (let at = 0; at < PAYLOAD.length; at += BITS) {
    const cands = candidates(await logitsFor(model, ids), BITS, safe)
    let index = 0
    for (let k = 0; k < BITS; k++) index = (index << 1) | (PAYLOAD[at + k] ?? 0)
    ids.push(cands[index])
    emitted.push(cands[index])
  }
  const carrier = tokenizer.decode(emitted, { skip_special_tokens: true })
  const reencoded = Array.from(tokenizer.encode(carrier))
  const retokenizes =
    reencoded.length === emitted.length && reencoded.every((t, i) => t === emitted[i])

  let decodes = retokenizes
  if (retokenizes) {
    const cursor = [...prefix]
    const recovered = []
    for (const token of reencoded) {
      const cands = candidates(await logitsFor(model, cursor), BITS, safe)
      const index = cands.indexOf(token)
      if (index < 0) {
        decodes = false
        break
      }
      for (let k = BITS - 1; k >= 0; k--) recovered.push((index >> k) & 1)
      cursor.push(token)
    }
    decodes = decodes && PAYLOAD.every((x, i) => x === recovered[i])
  }

  console.log(
    `MODEL ${id} (${dtype}, ${note})\n` +
      `  determinism drift=${drift} entropy=${entropy.toFixed(2)} bits/token\n` +
      `  tokens=${emitted.length} retokenizes=${retokenizes} decodes=${decodes}\n` +
      `  text: ${JSON.stringify(carrier)}`,
  )
}

for (const candidate of CANDIDATES) {
  try {
    await evaluate(candidate)
  } catch (err) {
    console.log(`MODEL ${candidate.id} — FAILED: ${String(err).slice(0, 160)}`)
  }
}
