/**
 * Key derivation and keyed hashing, all via Web Crypto (SubtleCrypto).
 *
 * A passphrase is stretched with PBKDF2, then HKDF-expanded into three
 * independent secrets: `addr` (keys the word->equation map), `stream`
 * (keystream for the payload), and `mac` (authentication). Nothing here
 * touches the network; keys live only for the lifetime of the call chain.
 *
 * Protocol v1 constants — do not change without bumping the version:
 */
import { textToBytes } from "./bytes"

const PBKDF2_ITERS = 300_000
const SALT = textToBytes("swym-v1")
const HKDF_INFO_ADDR = textToBytes("swym-v1/addr")
const HKDF_INFO_STREAM = textToBytes("swym-v1/stream")
const HKDF_INFO_MAC = textToBytes("swym-v1/mac")

export interface Keys {
  addr: CryptoKey // HMAC key for equation addressing
  mac: CryptoKey // HMAC key for payload authentication
  stream: Uint8Array // 32 raw bytes seeding the keystream
}

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto?.subtle
  if (!c) throw new Error("Web Crypto (crypto.subtle) is unavailable")
  return c
}

/**
 * Cast a Uint8Array to BufferSource for the Web Crypto APIs. TS's DOM lib
 * types the generic as ArrayBufferLike (which includes SharedArrayBuffer);
 * our arrays are always ArrayBuffer-backed, so this cast is sound.
 */
export const asBuffer = (u: Uint8Array): BufferSource => u as BufferSource

const hkdfExpand = async (
  masterBits: ArrayBuffer,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> => {
  const master = await subtle().importKey("raw", masterBits, "HKDF", false, [
    "deriveBits",
  ])
  const out = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: asBuffer(new Uint8Array(0)), info: asBuffer(info) },
    master,
    bytes * 8,
  )
  return new Uint8Array(out)
}

const importHmacKey = (raw: Uint8Array): Promise<CryptoKey> =>
  subtle().importKey(
    "raw",
    asBuffer(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

export const deriveKeys = async (passphrase: string): Promise<Keys> => {
  const base = await subtle().importKey(
    "raw",
    asBuffer(textToBytes(passphrase)),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const masterBits = await subtle().deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asBuffer(SALT),
      iterations: PBKDF2_ITERS,
    },
    base,
    256,
  )
  const [addrRaw, streamRaw, macRaw] = await Promise.all([
    hkdfExpand(masterBits, HKDF_INFO_ADDR, 32),
    hkdfExpand(masterBits, HKDF_INFO_STREAM, 32),
    hkdfExpand(masterBits, HKDF_INFO_MAC, 32),
  ])
  const [addr, mac] = await Promise.all([
    importHmacKey(addrRaw),
    importHmacKey(macRaw),
  ])
  return { addr, mac, stream: streamRaw }
}

/** HMAC-SHA-256 of `data` under `key`, returned as 32 bytes. */
export const hmac = async (
  key: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array> => {
  const sig = await subtle().sign("HMAC", key, asBuffer(data))
  return new Uint8Array(sig)
}
