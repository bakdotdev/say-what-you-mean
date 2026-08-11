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
} from "./bytes"
import { encodeSymbols, decodeSymbols, MAX_SECRET_LENGTH } from "./alphabet"
import { hmac, asBuffer, type Keys } from "./keys"

const LEN_BITS = 4
const SYMBOL_BITS = 6
const MAC_BITS = 16

export const payloadBitLength = (n: number): number =>
  LEN_BITS + SYMBOL_BITS * n + MAC_BITS

const bodyBits = (n: number): number => LEN_BITS + SYMBOL_BITS * n

/** Keystream of `nBits` bits: HMAC(stream-key, counter) blocks concatenated. */
const keystream = async (keys: Keys, nBits: number): Promise<Bit[]> => {
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
    const block = await hmac(streamKey, textToBytes(`ks:${counter++}`))
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
