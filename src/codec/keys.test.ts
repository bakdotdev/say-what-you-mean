import { describe, it, expect } from "vitest"
import { deriveKeys, hmac } from "./keys"
import { textToBytes, bytesToHex } from "./bytes"

describe("keys", () => {
  it("is deterministic for the same passphrase", async () => {
    const a = await deriveKeys("correct horse")
    const b = await deriveKeys("correct horse")
    const data = textToBytes("probe")
    expect(bytesToHex(await hmac(a.mac, data))).toBe(
      bytesToHex(await hmac(b.mac, data)),
    )
    expect(bytesToHex(a.stream)).toBe(bytesToHex(b.stream))
  })

  it("differs for different passphrases", async () => {
    const a = await deriveKeys("alpha")
    const b = await deriveKeys("beta")
    expect(bytesToHex(a.stream)).not.toBe(bytesToHex(b.stream))
    const data = textToBytes("probe")
    expect(bytesToHex(await hmac(a.addr, data))).not.toBe(
      bytesToHex(await hmac(b.addr, data)),
    )
  })

  it("separates the three derived keys", async () => {
    const k = await deriveKeys("shared")
    const data = textToBytes("x")
    const addrSig = bytesToHex(await hmac(k.addr, data))
    const macSig = bytesToHex(await hmac(k.mac, data))
    expect(addrSig).not.toBe(macSig)
    expect(bytesToHex(k.stream)).not.toBe(addrSig)
  })

  it("produces 32-byte HMAC output and 32-byte stream", async () => {
    const k = await deriveKeys("shared")
    expect(k.stream).toHaveLength(32)
    expect(await hmac(k.mac, textToBytes("x"))).toHaveLength(32)
  })

  it("matches a frozen known-answer vector (protocol v1)", async () => {
    const k = await deriveKeys("known answer test")
    // Captured on first correct run; guards against silent protocol drift.
    expect(bytesToHex(k.stream)).toBe(FROZEN_STREAM)
  })
})

// Filled in on first run, then frozen.
const FROZEN_STREAM =
  "4b31036817b7f6a63f313b2c5d7cbf21b356752be4aaf9c8c81e0893d3f08539"
