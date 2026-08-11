/**
 * v2 · bind — produce a key for a carrier that is never modified.
 */
import { useEffect, useState } from "react"
import { bindSecret, normalizeSecret, MAX_SECRET_LENGTH } from "../codec"
import {
  Button,
  CopyableField,
  Field,
  Panel,
  Tag,
  TextArea,
  TextInput,
} from "./primitives"
import { Columns } from "./Columns"
import { About } from "./About"

export function BindHideView() {
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [key, setKey] = useState("")
  const [fingerprint, setFingerprint] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [lookupId, setLookupId] = useState("")
  const [escrow, setEscrow] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  )
  const [escrowError, setEscrowError] = useState<string | null>(null)

  useEffect(() => {
    if (!secret || !passphrase || !carrier.trim()) {
      setKey("")
      setFingerprint("")
      setLookupId("")
      setEscrow("idle")
      setError(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      bindSecret(secret, passphrase, carrier)
        .then((r) => {
          if (cancelled) return
          setKey(r.key)
          setFingerprint(r.fingerprint)
          setLookupId(r.lookupId)
          setEscrow("idle")
          setError(null)
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e))
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [secret, passphrase, carrier])

  const words = carrier.trim() ? carrier.trim().split(/\s+/).length : 0

  /**
   * Hand the encrypted blob to the escrow so the recipient needs nothing but
   * the paragraph and the passphrase. The server sees an un-invertible id and
   * a ciphertext it cannot decrypt.
   */
  const sendToEscrow = async () => {
    if (!key || !lookupId) return
    setEscrow("sending")
    setEscrowError(null)
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: lookupId, blob: key }),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        setEscrowError(detail.error ?? `store failed (${res.status})`)
        setEscrow("failed")
        return
      }
      setEscrow("sent")
    } catch (err) {
      setEscrowError(err instanceof Error ? err.message : String(err))
      setEscrow("failed")
    }
  }

  return (
    <Columns
      left={
        <Panel
          title="encoding"
          right={<span className="text-[10px] tracking-wider text-muted">bound</span>}
        >
          <p className="text-[10px] leading-relaxed tracking-wider text-muted">
            // a pad is derived from your passphrase and the words themselves,
            then solved directly for the key. no search, no word changes.
          </p>
          <dl className="mt-2 space-y-1 text-[10px] tracking-wider">
            <div className="flex justify-between">
              <dt className="text-muted">carrier</dt>
              <dd className="text-fg">{words} words</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">fingerprint</dt>
              <dd className="text-fg">{fingerprint || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">key size</dt>
              <dd className="text-fg">{key ? `${key.length / 2} bytes` : "—"}</dd>
            </div>
          </dl>
        </Panel>
      }
      center={
        <>
          <Panel title="payload">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="secret message"
                hint={`${secret.length}/${MAX_SECRET_LENGTH}`}
              >
                <TextInput
                  value={secret}
                  onChange={(e) =>
                    setSecret(
                      normalizeSecret(e.target.value).slice(0, MAX_SECRET_LENGTH),
                    )
                  }
                  placeholder="DOCK AT 9"
                  aria-label="Secret message"
                />
              </Field>
              <Field label="shared passphrase">
                <CopyableField value={passphrase} label="copy passphrase">
                  <TextInput
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="known to both parties"
                    aria-label="Shared passphrase"
                  />
                </CopyableField>
              </Field>
            </div>
          </Panel>

          <Panel
            title="carrier"
            right={
              <span className="text-[10px] tracking-wider text-muted">
                never modified
              </span>
            }
          >
            <CopyableField value={carrier} label="copy carrier">
              <TextArea
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                rows={10}
                className="normal-case"
                placeholder="Write or paste anything at all. Not one word will change."
                aria-label="Carrier text"
              />
            </CopyableField>
            <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
              // case, spacing and punctuation may change in transit; words may not
            </p>
          </Panel>

          <About />
        </>
      }
      right={
        <>
          {error && (
            <Panel title="error">
              <p className="text-[10px] tracking-wider text-fg">// {error}</p>
            </Panel>
          )}
          <Panel
            title="key"
            right={key ? <Tag tone="green">bound</Tag> : <Tag>waiting</Tag>}
          >
            {key ? (
              <>
                <CopyableField value={key} label="copy key">
                  <TextInput
                    readOnly
                    value={key}
                    aria-label="Generated key"
                    className="font-mono"
                  />
                </CopyableField>
                <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
                  // send this alongside the carrier, by any separate channel
                </p>
              </>
            ) : (
              <p className="text-[10px] leading-relaxed tracking-wider text-muted">
                // enter a secret, a passphrase and some carrier text
              </p>
            )}
          </Panel>

          <Panel
            title="escrow"
            right={
              escrow === "sent" ? (
                <Tag tone="green">stored</Tag>
              ) : escrow === "failed" ? (
                <Tag tone="red">failed</Tag>
              ) : (
                <Tag>optional</Tag>
              )
            }
          >
            <p className="text-[10px] leading-relaxed tracking-wider text-muted">
              // store the key so your recipient pastes nothing but the
              paragraph. it is deleted the first time it is read.
            </p>
            <Button
              onClick={sendToEscrow}
              disabled={!key || escrow === "sending" || escrow === "sent"}
              className="mt-2 w-full"
            >
              {escrow === "sending"
                ? "storing…"
                : escrow === "sent"
                  ? "stored ✓ — send only the text"
                  : "store key · burn after reading"}
            </Button>
            {escrowError && (
              <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-fg">
                // {escrowError}
              </p>
            )}
          </Panel>

          <Panel title="properties">
            <ul className="space-y-1 text-[10px] leading-relaxed tracking-wider text-muted">
              <li>— carrier: unchanged, byte for byte</li>
              <li>— message: arbitrary, up to 16 characters</li>
              <li>— key: fresh per message and per passphrase</li>
              <li>— cost: the key must travel with the text</li>
              <li>— any word-level edit breaks recovery</li>
            </ul>
          </Panel>
        </>
      }
    />
  )
}
