/**
 * v3 spike — is distribution-driven steganography actually buildable here?
 *
 * The idea: instead of writing text and then damaging it, let the secret drive
 * the model's sampling. At each step the model gives a distribution over next
 * tokens; the secret's bits choose which token to emit, via arithmetic coding.
 * Every token is one the model would plausibly have produced, so the text is
 * fluent by construction — there is nothing to repair afterwards.
 *
 * Decoding runs the same model over the received text and reads back which
 * choice was made at each step.
 *
 * That only works if the decoder sees the EXACT same distribution the encoder
 * saw. This checks that first, because if logits are not reproducible the
 * whole approach is dead and nothing else matters.
 */
import { AutoModelForCausalLM, AutoTokenizer, Tensor } from "@huggingface/transformers"

const MODEL = "Xenova/distilgpt2"

const load = async () => {
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
  const model = await AutoModelForCausalLM.from_pretrained(MODEL, {
    dtype: "fp32",
    device: "cpu",
  })
  return { tokenizer, model }
}

/** Raw next-token logits for a token sequence. */
const logitsFor = async (model, ids, Tensor) => {
  const n = BigInt64Array.from(ids.map((i) => BigInt(i)))
  const input_ids = new Tensor("int64", n, [1, ids.length])
  const attention_mask = new Tensor(
    "int64",
    BigInt64Array.from(ids.map(() => 1n)),
    [1, ids.length],
  )
  const out = await model({ input_ids, attention_mask })
  const logits = out.logits
  const [, seq, vocab] = logits.dims
  const flat = logits.data
  const start = (seq - 1) * vocab
  return Array.from(flat.slice(start, start + vocab))
}

const main = async () => {
  console.time("load")
  const { tokenizer, model } = await load()
  console.timeEnd("load")

  const prompt = "I went to the corner shop this morning and"
  const ids = Array.from(tokenizer.encode(prompt))
  console.log(`SPIKE prompt tokens=${ids.length}`)

  // 1. Determinism across repeated forward passes.
  const a = await logitsFor(model, ids, Tensor)
  const b = await logitsFor(model, ids, Tensor)
  let maxDiff = 0
  for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]))
  console.log(`SPIKE vocab=${a.length} maxLogitDiff(sameCall)=${maxDiff}`)

  // 2. Determinism when the same prefix is reached by a different route —
  //    this is what decoding actually does: it re-runs the whole text.
  const longer = [...ids, 220]
  const c1 = await logitsFor(model, longer, Tensor)
  const c2 = await logitsFor(model, longer, Tensor)
  let d2 = 0
  for (let i = 0; i < c1.length; i++) d2 = Math.max(d2, Math.abs(c1[i] - c2[i]))
  console.log(`SPIKE maxLogitDiff(extendedPrefix)=${d2}`)

  // 3. How much entropy is available per token — this sets the capacity, i.e.
  //    how long a carrier a 74-bit secret needs.
  const softmax = (xs) => {
    const m = Math.max(...xs)
    const ex = xs.map((x) => Math.exp(x - m))
    const s = ex.reduce((p, q) => p + q, 0)
    return ex.map((x) => x / s)
  }
  const p = softmax(a)
  const sorted = [...p].sort((x, y) => y - x)
  const entropy = -p.reduce((acc, q) => (q > 0 ? acc + q * Math.log2(q) : acc), 0)
  const top16 = sorted.slice(0, 16).reduce((x, y) => x + y, 0)
  console.log(
    `SPIKE entropy=${entropy.toFixed(2)} bits/token, top1=${sorted[0].toFixed(3)}, top16mass=${top16.toFixed(3)}`,
  )
  console.log(
    `SPIKE => a 74-bit secret needs roughly ${Math.ceil(74 / Math.max(0.5, entropy))} tokens at this entropy`,
  )
}

main().catch((err) => {
  console.error("SPIKE FAILED", err)
  process.exit(1)
})
