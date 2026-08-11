/**
 * v2 · open — recover a message from carrier + passphrase + key.
 */
import { useEffect, useState } from "react"
import { unbindSecret, lookupIdFromPassphrase } from "../codec"
import { CopyableField, Field, Panel, Tag, TextArea, TextInput } from "./primitives"
import { Columns } from "./Columns"
import { About } from "./About"
import { DecryptText } from "./DecryptText"

export function BindRevealView() {
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [key, setKey] = useState("")
  const [opened, setOpened] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [source, setSource] = useState<"escrow" | "manual" | null>(null)

  // With carrier + passphrase we can derive the escrow id and pull the key
  // ourselves — the recipient pastes nothing else. Falls back to a manually
  // entered key if the escrow has already been burned.
  useEffect(() => {
    if (key.trim() || !passphrase || !carrier.trim()) return
    let cancelled = false
    setFetching(true)
    const timer = setTimeout(async () => {
      try {
        const id = await lookupIdFromPassphrase(passphrase, carrier)
        const res = await fetch(
          `${import.meta.env.BASE_URL}api/keys?id=${encodeURIComponent(id)}`,
        )
        if (!cancelled && res.ok) {
          const { blob } = (await res.json()) as { blob?: string }
          if (blob) {
            setKey(blob)
            setSource("escrow")
          }
        }
      } catch {
        // Escrow is optional; the manual key field still works.
      } finally {
        if (!cancelled) setFetching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, passphrase, carrier])

  useEffect(() => {
    if (!key.trim() || !passphrase || !carrier.trim()) {
      setOpened(null)
      setTried(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      unbindSecret(key, passphrase, carrier).then((r) => {
        if (cancelled) return
        setOpened(r)
        setTried(true)
      })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, passphrase, carrier])

  return (
    <Columns
      left={
        <Panel title="decoding" right={<span className="text-[10px] tracking-wider text-muted">bound</span>}>
          <p className="text-[10px] leading-relaxed tracking-wider text-muted">
            // all three must match: the exact carrier words, the passphrase,
            and the key. any one wrong and it fails closed.
          </p>
          <dl className="mt-2 space-y-1 text-[10px] tracking-wider">
            <div className="flex justify-between">
              <dt className="text-muted">carrier</dt>
              <dd className="text-fg">{carrier.trim() ? "✓" : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">passphrase</dt>
              <dd className="text-fg">{passphrase ? "✓" : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">key</dt>
              <dd className="text-fg">
                {key.trim()
                  ? source === "escrow"
                    ? "✓ escrow"
                    : "✓"
                  : fetching
                    ? "…"
                    : "—"}
              </dd>
            </div>
          </dl>
        </Panel>
      }
      center={
        <>
          <Panel title="received carrier">
            <TextArea
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              rows={10}
              className="normal-case"
              placeholder="Paste the text you received, exactly as received."
              aria-label="Received carrier text"
            />
          </Panel>

          <Panel title="credentials">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="key · auto-fetched if stored">
                <CopyableField value={key} label="copy key">
                  <TextInput
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={fetching ? "checking escrow…" : "paste only if not stored"}
                    aria-label="Bound key"
                    className="font-mono"
                  />
                </CopyableField>
              </Field>
              <Field label="shared passphrase">
                <CopyableField value={passphrase} label="copy passphrase">
                  <TextInput
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="the passphrase you agreed on"
                    aria-label="Shared passphrase"
                  />
                </CopyableField>
              </Field>
            </div>
          </Panel>

          <About />
        </>
      }
      right={
        <Panel
          title="output"
          right={
            !tried ? (
              <Tag>waiting</Tag>
            ) : opened ? (
              <Tag tone="green">recovered</Tag>
            ) : (
              <Tag tone="red">no match</Tag>
            )
          }
        >
          {opened ? (
            <p className="border border-fg/50 bg-accent/10 px-3 py-3">
              <DecryptText
                key={opened}
                text={opened}
                className="block break-all text-xl tracking-[0.3em]"
              />
            </p>
          ) : (
            <p className="text-[10px] leading-relaxed tracking-wider text-muted">
              {tried
                ? "// wrong key, wrong passphrase, or the carrier was edited"
                : "// paste the carrier, key and passphrase"}
            </p>
          )}
        </Panel>
      }
    />
  )
}
