/**
 * Burn-after-reading key escrow for v2.
 *
 * The recipient should need nothing but the paragraph and the passphrase — no
 * key to paste. So the sender stores the encrypted blob here, and the reader
 * fetches it once; the server deletes it immediately afterwards.
 *
 * What the server can and cannot see:
 *   lookupId = HMAC(mac key, digest(carrier words))   computed client-side
 *   blob     = secret XOR HKDF(passphrase, digest)    computed client-side
 *
 * The id is a hash the server cannot invert, and the blob is a one-time-pad
 * ciphertext whose pad depends on both the exact words and the passphrase.
 * Neither reveals the message, and the server never receives the passphrase
 * or the carrier text.
 *
 * Storage is a PRIVATE Vercel Blob store, so objects are not publicly
 * addressable even before deletion.
 *
 * Runtime note: this must be a Node.js function — @vercel/blob depends on Node
 * built-ins that the edge runtime does not provide. That means the handler
 * takes (req, res), NOT the Web Request/Response signature.
 *
 * Caveat worth stating: blobs that are never read are not auto-expired here.
 * A sweeper (or a store lifecycle rule) should clear stale keys.
 */
import { put, get, del } from "@vercel/blob"

const PREFIX = "swym/keys"
const MAX_BLOB_CHARS = 512

// Ids are client-computed hex digests; never trust them as paths.
const validId = (id) => typeof id === "string" && /^[0-9a-f]{32,64}$/.test(id)

const describe = (err) =>
  err instanceof Error ? err.message : "storage request failed"

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store")

  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? safeParse(req.body) : (req.body ?? {})
    const { id, blob } = body
    if (!validId(id)) return res.status(400).json({ error: "invalid id" })
    if (typeof blob !== "string" || !blob || blob.length > MAX_BLOB_CHARS) {
      return res.status(400).json({ error: "invalid blob" })
    }
    try {
      await put(`${PREFIX}/${id}`, blob, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/plain",
      })
      return res.status(200).json({ stored: true })
    } catch (err) {
      return res.status(502).json({ error: describe(err) })
    }
  }

  if (req.method === "GET") {
    const id = req.query?.id
    if (!validId(id)) return res.status(400).json({ error: "invalid id" })
    const pathname = `${PREFIX}/${id}`
    try {
      const result = await get(pathname, { access: "private" })
      if (!result) return res.status(404).json({ error: "not found" })

      const blob = await streamToString(result.stream)

      // Burn after reading: the key exists for exactly one retrieval.
      try {
        await del(pathname)
      } catch {
        // A failed delete must not withhold the message from the recipient.
      }

      return res.status(200).json({ blob })
    } catch (err) {
      return res.status(502).json({ error: describe(err) })
    }
  }

  return res.status(405).json({ error: "method not allowed" })
}

const safeParse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

const streamToString = async (stream) => {
  if (!stream) return ""
  // Web ReadableStream (what @vercel/blob returns) — read it fully.
  if (typeof stream.getReader === "function") {
    const chunks = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(typeof value === "string" ? value : Buffer.from(value))
    }
    return chunks.map((c) => c.toString()).join("")
  }
  // Node stream fallback.
  const parts = []
  for await (const chunk of stream) parts.push(Buffer.from(chunk))
  return Buffer.concat(parts).toString("utf8")
}
