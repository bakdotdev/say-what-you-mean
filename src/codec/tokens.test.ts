/**
 * @vitest-environment node
 *
 * Node, not jsdom: onnxruntime checks `data instanceof Float32Array`, and
 * jsdom's typed arrays come from a different realm so the check fails with
 * "a float32 tensor's data must be type of Float32Array".
 *
 * v3 round trip. Downloads a 145 MB model on first run, so it is gated on
 * V3_TESTS=1 rather than running in the normal suite.
 */
import { describe, expect, it } from "vitest"
import { embed, extract, loadModel, reencodes } from "./tokens"

const live = process.env.V3_TESTS ? describe : describe.skip

live("v3 token embedding", () => {
  it("round-trips a secret through generated text", async () => {
    const carrier = await embed("DOCK AT 9", "swordfish")
    console.log(`V3 carrier: ${JSON.stringify(carrier)}`)
    const result = await extract(carrier, "swordfish")
    expect(result.secret).toBe("DOCK AT 9")
  }, 600_000)

  it("spots neighbouring tokens that merge when re-encoded", async () => {
    const { tokenizer } = await loadModel()
    const [comm, ander, commander] = [" comm", "ander", " commander"].map(
      (text) =>
        Array.from(tokenizer.encode(text, { add_special_tokens: false })) as number[],
    )
    // Each is a single token on its own, so the per-token check passes all three.
    expect([comm, ander, commander].map((ids) => ids.length)).toEqual([1, 1, 1])
    expect(reencodes(tokenizer, [...comm, ...ander])).toBe(false)
    expect(reencodes(tokenizer, commander)).toBe(true)
  }, 600_000)

  it("opens every carrier it writes", async () => {
    // Before embed checked for merges, about one carrier in twenty failed
    // this, so twenty tries catch a regression more often than not.
    const passphrases = ["swordfish", "tangerine", "blue kettle", "riverbank"]
    for (let i = 0; i < 20; i++) {
      const passphrase = passphrases[i % passphrases.length]
      const carrier = await embed("DOCK AT 9", passphrase)
      const { secret } = await extract(carrier, passphrase)
      expect(secret, carrier).toBe("DOCK AT 9")
    }
  }, 1_200_000)

  it("yields nothing for the wrong passphrase", async () => {
    const carrier = await embed("MEET AT SIX", "swordfish")
    expect((await extract(carrier, "wrong")).secret).toBeNull()
  }, 600_000)

  it("is short — the whole point of the scheme", async () => {
    const carrier = await embed("DOCK AT 9", "swordfish")
    const words = carrier.split(/\s+/).filter(Boolean).length
    console.log(`V3 words=${words}`)
    // v1 needs ~750 words for the same secret. Anything near that means the
    // bits-per-token accounting has regressed.
    expect(words).toBeLessThan(60)
  }, 600_000)

  it("breaks when a word is removed, which is the documented trade", async () => {
    const carrier = await embed("DOCK AT 9", "swordfish")
    const words = carrier.split(/\s+/).filter(Boolean)
    words.splice(Math.floor(words.length / 2), 1)
    expect((await extract(words.join(" "), "swordfish")).secret).not.toBe(
      "DOCK AT 9",
    )
  }, 600_000)
})
