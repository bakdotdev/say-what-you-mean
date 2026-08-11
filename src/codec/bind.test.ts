import { describe, it, expect } from "vitest"
import { bindSecret, unbindSecret, digestWords } from "./bind"
import { deriveKeys } from "./keys"
import { bytesToHex } from "./bytes"

const CARRIER =
  "I finally shut my laptop and stretched, ready to leave the workday behind. " +
  "The second I walked into the kitchen my blue heeler was already doing his " +
  "familiar tap dance of anticipation."

describe("text-bound keys", () => {
  it("round-trips an arbitrary secret with the carrier untouched", async () => {
    for (const secret of ["DOCK AT 9", "X", "SIXTEEN CHARS 16"]) {
      const { key } = await bindSecret(secret, "swordfish", CARRIER)
      expect(await unbindSecret(key, "swordfish", CARRIER)).toBe(secret)
    }
  }, 60_000)

  it("produces a short key", async () => {
    const { key } = await bindSecret("DOCK AT 9", "swordfish", CARRIER)
    // 1 length byte + 9 symbols + 4 tag bytes = 14 bytes = 28 hex chars
    expect(key).toHaveLength(28)
    expect(key).toMatch(/^[0-9a-f]+$/)
  }, 60_000)

  it("fails with the wrong passphrase", async () => {
    const { key } = await bindSecret("SECRET", "right", CARRIER)
    expect(await unbindSecret(key, "wrong", CARRIER)).toBeNull()
  }, 60_000)

  it("fails when a word of the carrier changes", async () => {
    const { key } = await bindSecret("SECRET", "pass", CARRIER)
    const edited = CARRIER.replace("laptop", "notebook")
    expect(await unbindSecret(key, "pass", edited)).toBeNull()
  }, 60_000)

  it("tolerates case, spacing and punctuation changes", async () => {
    const { key } = await bindSecret("MEET AT 8", "pass", CARRIER)
    const mangled = CARRIER.toUpperCase().replace(/[,.]/g, " ").replace(/\s+/g, "   ")
    expect(await unbindSecret(key, "pass", mangled)).toBe("MEET AT 8")
  }, 60_000)

  it("gives a different key per message and per passphrase", async () => {
    const a = await bindSecret("ALPHA", "pass", CARRIER)
    const b = await bindSecret("BETA", "pass", CARRIER)
    const c = await bindSecret("ALPHA", "other", CARRIER)
    expect(a.key).not.toBe(b.key)
    expect(a.key).not.toBe(c.key)
  }, 60_000)

  it("binds to the carrier: same secret+passphrase, different text -> different key", async () => {
    const a = await bindSecret("ALPHA", "pass", CARRIER)
    const b = await bindSecret("ALPHA", "pass", CARRIER + " and then we left.")
    expect(a.key).not.toBe(b.key)
    expect(a.fingerprint).not.toBe(b.fingerprint)
  }, 60_000)

  it("rejects a malformed key", async () => {
    expect(await unbindSecret("zzzz", "pass", CARRIER)).toBeNull()
    expect(await unbindSecret("", "pass", CARRIER)).toBeNull()
  }, 60_000)

  it("digests words independently of formatting", async () => {
    const keys = await deriveKeys("pass")
    const a = await digestWords("The cow, ate!", keys)
    const b = await digestWords("the   COW ate", keys)
    expect(bytesToHex(a)).toBe(bytesToHex(b))
  }, 60_000)
})
