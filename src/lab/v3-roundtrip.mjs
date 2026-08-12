/**
 * v3 spike — steganography by perturbing the model's own sampling.
 *
 * Instead of writing text and then damaging it, the secret drives the choice
 * of every token. At each step the model gives a distribution over next
 * tokens; bits of the secret pick which one to emit. Every token is one the
 * model would plausibly have produced, so the text is fluent by construction
 * and there is nothing to repair. Decoding replays the same distributions
 * over the received text and reads back which choice was made.
 *
 * Three things had to hold, and all three do:
 *
 * 1. DETERMINISM. The decoder must see exactly the distribution the encoder
 *    saw. Measured with v3-spike.mjs: maxLogitDiff 0, bitwise identical,
 *    including when the same prefix is reached by a different route. This is
 *    why it needs a local model — no API guarantees this, and Anthropic
 *    exposes no logprobs at all.
 *
 * 2. RETOKENIZATION. The receiver gets TEXT and must re-encode it to the same
 *    token ids. Holds at 3 bits per token and above; at 1-2 bits the choices
 *    include newlines and quote marks that re-encode differently, and every
 *    step after the first mismatch decodes garbage.
 *
 * 3. CAPACITY. distilgpt2 offers ~6.4 bits of entropy per token, so a 74-bit
 *    payload fits in 19-25 tokens — about twenty words, against the ~750 the
 *    word-substitution scheme needs.
 *
 * Scheme is the simple one: top 2^BITS tokens by probability, BITS bits choose
 * among them. Arithmetic coding over the full distribution would read better
 * still — it samples proportional to probability instead of uniformly over a
 * truncated set — but this proves the mechanism.
 *
 * Run: node src/lab/v3-roundtrip.mjs
 */
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  Tensor,
} from "@huggingface/transformers"

const MODEL = "Xenova/distilgpt2"
const PROMPT = "I got back from the shop and put the bags on the counter."

const logitsFor = async (model, ids) => {
  const out = await model({
    input_ids: new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    attention_mask: new Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]),
  })
  const [, seq, vocab] = out.logits.dims
  const start = (seq - 1) * vocab
  return out.logits.data.slice(start, start + vocab)
}

/** Indices of the top 2^bits tokens, highest probability first. */
const candidates = (logits, bits) => {
  const n = 1 << bits
  const best = []
  for (let i = 0; i < logits.length; i++) {
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

const toBits = (bytes) => {
  const out = []
  for (const b of bytes) for (let i = 7; i >= 0; i--) out.push((b >> i) & 1)
  return out
}

const roundTrip = async (tokenizer, model, payload, bits) => {
  const prefix = Array.from(tokenizer.encode(PROMPT))

  // Encode: the secret chooses each token.
  const ids = [...prefix]
  const emitted = []
  for (let at = 0; at < payload.length; at += bits) {
    const cands = candidates(await logitsFor(model, ids), bits)
    let index = 0
    for (let k = 0; k < bits; k++) index = (index << 1) | (payload[at + k] ?? 0)
    ids.push(cands[index])
    emitted.push(cands[index])
  }
  const carrier = tokenizer.decode(emitted, { skip_special_tokens: true })

  // The receiver has the prompt and the text, nothing else.
  const reencoded = Array.from(tokenizer.encode(carrier))
  const retokenizes =
    reencoded.length === emitted.length &&
    reencoded.every((id, i) => id === emitted[i])

  // Decode: replay the distributions and read back the choices.
  const cursor = [...prefix]
  const recovered = []
  let intact = true
  for (const token of reencoded) {
    const cands = candidates(await logitsFor(model, cursor), bits)
    const index = cands.indexOf(token)
    if (index < 0) {
      intact = false
      break
    }
    for (let k = bits - 1; k >= 0; k--) recovered.push((index >> k) & 1)
    cursor.push(token)
  }
  const decodes = intact && payload.every((b, i) => b === recovered[i])

  console.log(
    `RT bits/token=${bits} tokens=${emitted.length} retokenizes=${retokenizes} decodes=${decodes}`,
  )
  console.log(`RT   ${JSON.stringify(carrier)}`)
}

const main = async () => {
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
  const model = await AutoModelForCausalLM.from_pretrained(MODEL, {
    dtype: "fp32",
    device: "cpu",
  })

  // 74 bits — the size of a real payload for "DOCK AT 9".
  const payload = toBits(
    new Uint8Array([0x8f, 0x2a, 0xd1, 0x77, 0x03, 0xbe, 0x45, 0x19, 0xc2, 0x60]),
  ).slice(0, 74)
  console.log(`RT payload=${payload.length} bits`)

  for (const bits of [1, 2, 3, 4, 6]) {
    await roundTrip(tokenizer, model, payload, bits)
  }
}

main().catch((err) => {
  console.error("RT FAILED", err)
  process.exit(1)
})
