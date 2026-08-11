/**
 * Text-bound keys — the carrier is never modified at all.
 *
 * The other schemes in this codec buy "no separate key" by changing words.
 * This one inverts the trade: the paragraph stays byte-for-byte as written,
 * arbitrary secrets work, and instead a short key travels alongside.
 *
 *   pad    = HKDF(passphrase, digest(words))   // both sides can compute
 *   key    = secret XOR pad                    // solved directly, no search
 *   secret = key XOR pad
 *
 * What this actually protects: the key is meaningless without that exact
 * paragraph, and the paragraph is meaningless without the key AND the
 * passphrase. Three things must meet. It is a binding/second-factor scheme,
 * not concealment of the message's existence — the message content rides in
 * the key, not in the text. Callers must not oversell it.
 *
 * The digest covers the tokenized words in order, so any word-level edit
 * breaks recovery (case, spacing and punctuation are still free, per the
 * tokenizer contract).
 */
import { tokenize } from "./tokenize"
import { hmac, deriveKeys, type Keys } from "./keys"
import {
  textToBytes,
  bytesToHex,
  concatBytes,
  type Bit,
} from "./bytes"
import { encodeSymbols, decodeSymbols, MAX_SECRET_LENGTH } from "./alphabet"

const LEN_BYTES = 1
const MAC_BYTES = 4

/** Stable digest of the carrier's words, independent of case/spacing/punct. */
export const digestWords = async (
  text: string,
  keys: Keys,
): Promise<Uint8Array> => {
  const words = tokenize(text)
  return hmac(keys.addr, textToBytes(`bind|${words.length}|${words.join(" ")}`))
}

/** `keys.stream` is raw bytes; import it as an HMAC key for the keystream. */
const importStream = (keys: Keys): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    keys.stream as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

/** Keystream of `n` bytes bound to both the passphrase and the carrier. */
const pad = async (
  digest: Uint8Array,
  stream: CryptoKey,
  n: number,
): Promise<Uint8Array> => {
  const out: number[] = []
  let counter = 0
  while (out.length < n) {
    const block = await hmac(
      stream,
      concatBytes(digest, textToBytes(`|pad|${counter++}`)),
    )
    out.push(...block)
  }
  return new Uint8Array(out.slice(0, n))
}

export interface BoundKey {
  /** Share this alongside the carrier. Hex, short. */
  key: string
  /** Bytes of the carrier's word digest, for display. */
  fingerprint: string
  /**
   * Server-side lookup id for burn-after-reading escrow. A hash of the
   * passphrase and the carrier's words, so the server can neither invert it
   * nor derive the pad that decrypts the stored blob.
   */
  lookupId: string
}

export const bindSecret = async (
  secret: string,
  passphrase: string,
  carrier: string,
): Promise<BoundKey> => {
  const codes = encodeSymbols(secret) // throws on invalid length
  const keys = await deriveKeys(passphrase)
  const stream = await importStream(keys)
  const digest = await digestWords(carrier, keys)

  const plain = new Uint8Array(LEN_BYTES + codes.length)
  plain[0] = codes.length - 1
  plain.set(codes, LEN_BYTES)

  const mask = await pad(digest, stream, plain.length)
  const cipher = plain.map((b, i) => b ^ mask[i])

  const tag = (await hmac(keys.mac, concatBytes(digest, plain))).slice(
    0,
    MAC_BYTES,
  )

  return {
    key: bytesToHex(concatBytes(cipher, tag)),
    fingerprint: bytesToHex(digest.slice(0, 4)),
    lookupId: await lookupIdFor(carrier, keys),
  }
}

/**
 * Escrow lookup id: HMAC over the carrier digest under the mac key. Requires
 * both the exact words and the passphrase, so it cannot be guessed from either
 * alone, and it is unrelated to the pad that actually decrypts the blob.
 */
export const lookupIdFor = async (
  carrier: string,
  keys: Keys,
): Promise<string> => {
  const digest = await digestWords(carrier, keys)
  const id = await hmac(keys.mac, concatBytes(digest, textToBytes("|lookup")))
  return bytesToHex(id.slice(0, 16))
}

/** Convenience: the id for a passphrase + carrier, without binding a secret. */
export const lookupIdFromPassphrase = async (
  passphrase: string,
  carrier: string,
): Promise<string> => {
  const keys = await deriveKeys(passphrase)
  return lookupIdFor(carrier, keys)
}

export const unbindSecret = async (
  key: string,
  passphrase: string,
  carrier: string,
): Promise<string | null> => {
  const clean = key.trim().toLowerCase().replace(/[^0-9a-f]/g, "")
  if (clean.length < (LEN_BYTES + 1 + MAC_BYTES) * 2 || clean.length % 2)
    return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }

  const keys = await deriveKeys(passphrase)
  const stream = await importStream(keys)
  const digest = await digestWords(carrier, keys)

  const cipher = bytes.slice(0, bytes.length - MAC_BYTES)
  const tag = bytes.slice(bytes.length - MAC_BYTES)

  const mask = await pad(digest, stream, cipher.length)
  const plain = cipher.map((b, i) => b ^ mask[i])

  const expected = (await hmac(keys.mac, concatBytes(digest, plain))).slice(
    0,
    MAC_BYTES,
  )
  for (let i = 0; i < MAC_BYTES; i++) if (expected[i] !== tag[i]) return null

  const n = plain[0] + 1
  if (n < 1 || n > MAX_SECRET_LENGTH || plain.length !== LEN_BYTES + n)
    return null
  const codes = [...plain.slice(LEN_BYTES)]
  if (codes.some((c) => c < 0 || c > 63)) return null
  return decodeSymbols(codes)
}

export type { Bit }
