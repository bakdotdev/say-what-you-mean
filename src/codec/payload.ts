/**
 * Assemble and disassemble the payload bit-vector that the carrier encodes.
 *
 *   layout:  len(4 bits = N-1) | secret(6N bits) | mac(16 bits)
 *   B        = 20 + 6N            (26..116 bits for N = 1..16)
 *
 * The `len | secret` portion is XORed with a keystream derived from
 * `keys.stream`; the MAC authenticates the PLAINTEXT `len | secret`, so a
 * wrong passphrase (wrong keystream + wrong MAC key) fails loudly instead of
 * returning garbage.
 */
import type { Bit } from "./bytes"
import {
  intToBits,
  bitsToInt,
  bitsToBytes,
  bytesToBits,
  concatBytes,
  textToBytes,
  bytesToHex,
} from "./bytes"
import { encodeSymbols, decodeSymbols, MAX_SECRET_LENGTH } from "./alphabet"
import { hmac, asBuffer, type Keys } from "./keys"

const LEN_BITS = 4
const SYMBOL_BITS = 6
const MAC_BITS = 16

export const payloadBitLength = (n: number): number =>
  LEN_BITS + SYMBOL_BITS * n + MAC_BITS

const bodyBits = (n: number): number => LEN_BITS + SYMBOL_BITS * n

/**
 * Keystream of `nBits` bits: HMAC(stream-key, label + counter) blocks
 * concatenated. The default label is the original v1 one, kept so payloads
 * already in the wild still decode.
 */
const keystream = async (
  keys: Keys,
  nBits: number,
  label = "ks:",
): Promise<Bit[]> => {
  const streamKey = await crypto.subtle.importKey(
    "raw",
    asBuffer(keys.stream),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const bits: Bit[] = []
  let counter = 0
  while (bits.length < nBits) {
    const block = await hmac(streamKey, textToBytes(`${label}${counter++}`))
    bits.push(...bytesToBits(block))
  }
  return bits.slice(0, nBits)
}

const macBits = async (keys: Keys, bodyPlain: Bit[]): Promise<Bit[]> => {
  // pad body to whole bytes for a stable MAC input
  const padded = [...bodyPlain]
  while (padded.length % 8 !== 0) padded.push(0)
  const mac = await hmac(keys.mac, concatBytes(bitsToBytes(padded)))
  return bytesToBits(mac).slice(0, MAC_BITS)
}

/** Build the payload bit-vector for a secret. */
export const buildPayload = async (
  secret: string,
  keys: Keys,
): Promise<Bit[]> => {
  const codes = encodeSymbols(secret) // throws if invalid length
  const n = codes.length
  const lenBits = intToBits(n - 1, LEN_BITS)
  const secretBits = codes.flatMap((c) => intToBits(c, SYMBOL_BITS)) as Bit[]
  const bodyPlain = [...lenBits, ...secretBits]

  const ks = await keystream(keys, bodyBits(n))
  const bodyCipher = bodyPlain.map((b, i) => (b ^ ks[i]) as Bit)
  const mac = await macBits(keys, bodyPlain)
  return [...bodyCipher, ...mac]
}

export interface ParsedPayload {
  secret: string
}

/**
 * Parse a payload for a KNOWN symbol count `n`. Returns null if the MAC does
 * not verify (wrong passphrase, wrong n, or corrupted bits).
 */
export const parsePayload = async (
  bits: (Bit | null)[],
  n: number,
  keys: Keys,
): Promise<ParsedPayload | null> => {
  if (n < 1 || n > MAX_SECRET_LENGTH) return null
  const B = payloadBitLength(n)
  if (bits.length !== B) return null
  if (bits.some((b) => b === null)) return null
  const solid = bits as Bit[]

  const body = solid.slice(0, bodyBits(n))
  const mac = solid.slice(bodyBits(n))

  const ks = await keystream(keys, bodyBits(n))
  const bodyPlain = body.map((b, i) => (b ^ ks[i]) as Bit)

  const expectedMac = await macBits(keys, bodyPlain)
  if (!expectedMac.every((b, i) => b === mac[i])) return null

  const declaredN = bitsToInt(bodyPlain.slice(0, LEN_BITS)) + 1
  if (declaredN !== n) return null

  const codes: number[] = []
  for (let i = 0; i < n; i++) {
    const start = LEN_BITS + i * SYMBOL_BITS
    codes.push(bitsToInt(bodyPlain.slice(start, start + SYMBOL_BITS)))
  }
  return { secret: decodeSymbols(codes) }
}

/* ------------------------------------------------------------------------ */
/* Sealed payload (v3): a fresh random nonce per message                      */
/* ------------------------------------------------------------------------ */

/**
 *   layout:  nonce(32 bits) | len(4 bits = N-1) | secret(6N bits) | mac(16 bits)
 *   B        = 52 + 6N            (58..148 bits for N = 1..16)
 *
 * Without a nonce the keystream depends only on the passphrase. Two messages
 * under one passphrase then reuse it — XOR the two ciphertexts and the key
 * cancels, leaving the XOR of the two secrets — and the same secret always
 * produces the same carrier, word for word, which tells an observer when a
 * message repeats.
 *
 * The nonce travels in the clear at the front of the payload. It is uniformly
 * random, so it steers the sampler exactly like any other payload bits. It is
 * mixed into the keystream label and covered by the MAC, so tampering with it
 * fails verification rather than silently changing the plaintext.
 *
 * Cost: 32 bits, about seven more tokens at ~4.4 bits per token.
 */
export const NONCE_BITS = 32
const NONCE_BYTES = NONCE_BITS / 8

export const sealedPayloadBitLength = (n: number): number =>
  NONCE_BITS + payloadBitLength(n)

const sealedLabel = (nonce: Uint8Array): string => `ks:n1:${bytesToHex(nonce)}:`

const sealedMacBits = async (
  keys: Keys,
  nonce: Uint8Array,
  bodyPlain: Bit[],
): Promise<Bit[]> => {
  const padded = [...bodyPlain]
  while (padded.length % 8 !== 0) padded.push(0)
  const mac = await hmac(
    keys.mac,
    concatBytes(textToBytes("mac:n1:"), nonce, bitsToBytes(padded)),
  )
  return bytesToBits(mac).slice(0, MAC_BITS)
}

/**
 * Build a sealed payload. `nonce` is for tests only; in normal use a fresh
 * one is drawn from the platform CSPRNG for every message.
 */
export const buildSealedPayload = async (
  secret: string,
  keys: Keys,
  nonce: Uint8Array = crypto.getRandomValues(new Uint8Array(NONCE_BYTES)),
): Promise<Bit[]> => {
  if (nonce.length !== NONCE_BYTES)
    throw new RangeError(`nonce must be ${NONCE_BYTES} bytes`)
  const codes = encodeSymbols(secret) // throws if invalid length
  const n = codes.length
  const bodyPlain = [
    ...intToBits(n - 1, LEN_BITS),
    ...(codes.flatMap((c) => intToBits(c, SYMBOL_BITS)) as Bit[]),
  ]
  const ks = await keystream(keys, bodyBits(n), sealedLabel(nonce))
  const bodyCipher = bodyPlain.map((b, i) => (b ^ ks[i]) as Bit)
  const mac = await sealedMacBits(keys, nonce, bodyPlain)
  return [...bytesToBits(nonce), ...bodyCipher, ...mac]
}

/**
 * Parse a sealed payload for a KNOWN symbol count `n`. Returns null if the
 * MAC does not verify (wrong passphrase, wrong n, or corrupted bits).
 */
export const parseSealedPayload = async (
  bits: (Bit | null)[],
  n: number,
  keys: Keys,
): Promise<ParsedPayload | null> => {
  if (n < 1 || n > MAX_SECRET_LENGTH) return null
  if (bits.length !== sealedPayloadBitLength(n)) return null
  if (bits.some((b) => b === null)) return null
  const solid = bits as Bit[]

  const nonce = bitsToBytes(solid.slice(0, NONCE_BITS))
  const body = solid.slice(NONCE_BITS, NONCE_BITS + bodyBits(n))
  const mac = solid.slice(NONCE_BITS + bodyBits(n))

  const ks = await keystream(keys, bodyBits(n), sealedLabel(nonce))
  const bodyPlain = body.map((b, i) => (b ^ ks[i]) as Bit)

  const expectedMac = await sealedMacBits(keys, nonce, bodyPlain)
  if (!expectedMac.every((b, i) => b === mac[i])) return null

  const declaredN = bitsToInt(bodyPlain.slice(0, LEN_BITS)) + 1
  if (declaredN !== n) return null

  const codes: number[] = []
  for (let i = 0; i < n; i++) {
    const start = LEN_BITS + i * SYMBOL_BITS
    codes.push(bitsToInt(bodyPlain.slice(start, start + SYMBOL_BITS)))
  }
  return { secret: decodeSymbols(codes) }
}
