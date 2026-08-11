/**
 * Burn-after-reading key escrow for v2.
 *
 * The recipient should need nothing but the paragraph and the passphrase — no
 * key to paste. So the sender stores the encrypted blob here, and the reader
 * fetches it once; the server deletes it immediately afterwards.
 *
 * What the server can and cannot see:
 *   lookupId = HMAC(passphrase, digest(carrier words))   computed client-side
 *   blob     = secret XOR HKDF(passphrase, digest)        computed client-side
 *
 * The id is a hash the server cannot invert, and the blob is a one-time-pad
 * ciphertext whose pad depends on both the exact words and the passphrase.
 * Neither the id nor the blob reveals the message, and the server never
 * receives the passphrase or the carrier text.
 *
 * Storage is a PRIVATE Vercel Blob store, so objects are not publicly
 * addressable even before deletion.
 *
 * Caveat worth stating: blobs that are never read are not auto-expired here.
 * A sweeper (or a store lifecycle rule) should clear stale keys.
 */
import { put, get, del } from "@vercel/blob"

// Edge runtime: this handler uses the Web Request/Response signature. Without
// this the function runs as Node.js, where `req` is an IncomingMessage whose
// `url` is a bare path — and `new URL(path)` throws "Invalid URL".
export const config = { runtime: "edge" }

const PREFIX = "swym/keys"
const MAX_BLOB_CHARS = 512

// Ids are client-computed hex digests; never trust them as paths.
const validId = (id) => typeof id === "string" && /^[0-9a-f]{32,64}$/.test(id)

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })

export default async function handler(req) {
  const url = new URL(req.url)

  if (req.method === "POST") {
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: "invalid json" }, 400)
    }
    const { id, blob } = body ?? {}
    if (!validId(id)) return json({ error: "invalid id" }, 400)
    if (typeof blob !== "string" || !blob || blob.length > MAX_BLOB_CHARS) {
      return json({ error: "invalid blob" }, 400)
    }
    try {
      await put(`${PREFIX}/${id}`, blob, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/plain",
      })
      return json({ stored: true })
    } catch (err) {
      return json({ error: describe(err) }, 502)
    }
  }

  if (req.method === "GET") {
    const id = url.searchParams.get("id")
    if (!validId(id)) return json({ error: "invalid id" }, 400)
    const pathname = `${PREFIX}/${id}`
    try {
      const result = await get(pathname, { access: "private" })
      if (!result) return json({ error: "not found" }, 404)

      const blob = await new Response(result.stream).text()

      // Burn after reading: the key exists for exactly one retrieval.
      try {
        await del(pathname)
      } catch {
        // A failed delete must not withhold the message from the recipient.
      }

      return json({ blob })
    } catch (err) {
      return json({ error: describe(err) }, 502)
    }
  }

  return json({ error: "method not allowed" }, 405)
}

const describe = (err) =>
  err instanceof Error ? err.message : "storage request failed"
