/**
 * Round 9 — the knob that actually controls how hard this is.
 *
 * "Use these words" is easy. What the model is really being asked is "use
 * these words and never, in 700 words, use any other content word that
 * happens to carry under a key you cannot see". JUNK_MODULUS decides how
 * many words carry: at 2, half of all content words do, so roughly one word
 * in eight that the model invents silently breaks the message.
 *
 * Raising it makes more words free — safer to write — at the cost of needing
 * a longer carrier for the same payload. This measures both sides.
 *
 * No network. Run with LAB_TOKEN=1.
 */
import { test } from "vitest"
import { readFileSync } from "node:fs"
import { createEncoder, decode, tokenizeSpans } from "../codec"
import { isFunctionWord } from "../codec/features"
import { deriveKeys } from "../codec/keys"
import { wordDigests } from "../codec/equations"

const VOCAB = readFileSync("public/wordlist.txt", "utf8")
  .split("\n").map((w) => w.trim()).filter(Boolean)
const PROSE = readFileSync("src/lab/sample-prose.txt", "utf8")

const SECRET = "DOCK AT 9"
const PASS = "swordfish"
const DENSITY = 2

const live = test.skipIf(!process.env.LAB_TOKEN)

live("carrier density trade-off", async () => {
  const keys = await deriveKeys(PASS)
  const encoder = await createEncoder(SECRET, PASS, DENSITY, true)
  console.log(`SETUP payload=${encoder.B} bits, prose=${tokenizeSpans(PROSE).length} words`)

  // Replicate isCarrierWord at an arbitrary modulus, without touching the app.
  const carriesAt = async (word: string, modulus: number) => {
    if (isFunctionWord(word)) return false
    const digest = (await wordDigests(word, keys)).features[0]?.digest
    return digest ? digest[6] % modulus === 0 : false
  }

  const spans = tokenizeSpans(PROSE)
  const state = await encoder.evaluate(PROSE)

  for (const modulus of [1, 2, 4, 8]) {
    // How often does a word the model wrote freely break the message? A word
    // breaks if it carries at this modulus AND does not already fit.
    let carriers = 0
    let breaks = 0
    const distinctFitting = new Set<string>()
    for (const [i, span] of spans.entries()) {
      if (!(await carriesAt(span.word, modulus))) continue
      carriers++
      if (state.words[i]?.green) distinctFitting.add(span.word)
      else breaks++
    }
    console.log(
      `MODULUS ${modulus}: carriers=${carriers} (${Math.round(carriers / spans.length * 100)}% of words)` +
        ` breakRate=${Math.round(breaks / spans.length * 100)}% of every word written` +
        ` distinctFittingPresent=${distinctFitting.size}`,
    )
  }

  // And the other side: how many distinct fitting carriers a decode needs.
  const pool = await encoder.suggestFrom("", VOCAB.slice(0, 9160), 4000, 0)
  for (const n of [40, 55, 70, 90, 120]) {
    const text = pool.slice(0, n).join(" ")
    if ((await decode(text, PASS)).secret === SECRET) {
      console.log(`NEEDED ${n} distinct fitting words for a real decode`)
      break
    }
  }
}, 300_000)
