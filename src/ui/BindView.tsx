/**
 * v2 — text-bound keys. The carrier is never modified; a short key travels
 * with it, and only the exact paragraph + passphrase + key together recover
 * the message.
 */
import { useEffect, useState } from "react"
import { bindSecret, unbindSecret, normalizeSecret, MAX_SECRET_LENGTH } from "../codec"
import {
  CopyableField,
  Field,
  Panel,
  Tag,
  TextArea,
  TextInput,
} from "./primitives"
import { Columns } from "./Columns"
import { About } from "./About"
import { DecryptText } from "./DecryptText"

export function BindView() {
  const [mode, setMode] = useState<"bind" | "open">("bind")
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [key, setKey] = useState("")
  const [fingerprint, setFingerprint] = useState("")
  const [opened, setOpened] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Bind: derive the key from secret + passphrase + carrier.
  useEffect(() => {
    if (mode !== "bind") return
    if (!secret || !passphrase || !carrier.trim()) {
      setKey("")
      setFingerprint("")
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
          setError(null)
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setError(e instanceof Error ? e.message : String(e))
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, secret, passphrase, carrier])

  // Open: recover the secret from key + passphrase + carrier.
  useEffect(() => {
    if (mode !== "open") return
    if (!key.trim() || !passphrase || !carrier.trim()) {
      setOpened(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      unbindSecret(key, passphrase, carrier).then((r) => {
        if (!cancelled) setOpened(r)
      })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, key, passphrase, carrier])

  const modeSwitch = (
    <Panel title="mode">
      <div className="flex border border-edge">
        {(["bind", "open"] as const).map((m, i) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setOpened(null)
            }}
            className={
              "flex-1 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors " +
              (i > 0 ? "border-l border-edge " : "") +
              (mode === m
                ? "bg-accent/15 text-fg"
                : "bg-panel text-muted hover:text-fg-dim")
            }
          >
            {m}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
        // v2 · the carrier is never modified. the key is useless without this
        exact paragraph, and the paragraph is useless without the key and
        passphrase.
      </p>
    </Panel>
  )

  return (
    <Columns
      left={modeSwitch}
      center={
        <>
          <Panel title="payload">
            <div className="grid gap-3 sm:grid-cols-2">
              {mode === "bind" ? (
                <Field
                  label="secret message"
                  hint={`${secret.length}/${MAX_SECRET_LENGTH}`}
                >
                  <TextInput
                    value={secret}
                    onChange={(e) =>
                      setSecret(
                        normalizeSecret(e.target.value).slice(
                          0,
                          MAX_SECRET_LENGTH,
                        ),
                      )
                    }
                    placeholder="DOCK AT 9"
                    aria-label="Secret message"
                  />
                </Field>
              ) : (
                <Field label="key">
                  <CopyableField value={key} label="copy key">
                    <TextInput
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="paste the key"
                      aria-label="Bound key"
                    />
                  </CopyableField>
                </Field>
              )}
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
              fingerprint ? (
                <span className="text-[10px] tracking-wider text-muted">
                  fp {fingerprint}
                </span>
              ) : undefined
            }
          >
            <CopyableField value={carrier} label="copy carrier">
              <TextArea
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                rows={10}
                className="normal-case"
                placeholder="Write or paste anything at all. It is never modified."
                aria-label="Carrier text"
              />
            </CopyableField>
            <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
              // unmodified · case, spacing and punctuation may change in
              transit; words may not
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

          {mode === "bind" && key && (
            <Panel title="key" right={<Tag tone="green">bound</Tag>}>
              <CopyableField value={key} label="copy key">
                <TextInput
                  readOnly
                  value={key}
                  aria-label="Generated key"
                  className="font-mono"
                />
              </CopyableField>
              <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
                // send this alongside the carrier. {key.length / 2} bytes.
              </p>
            </Panel>
          )}

          {mode === "open" && (
            <Panel
              title="output"
              right={
                opened ? (
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
                  // needs the exact carrier, the passphrase and the key
                </p>
              )}
            </Panel>
          )}

          <Panel title="how v2 differs">
            <ul className="space-y-1 text-[10px] leading-relaxed tracking-wider text-muted">
              <li>— carrier: unchanged, byte for byte</li>
              <li>— message: arbitrary, full 16 characters</li>
              <li>— key: fresh per message and per passphrase</li>
              <li>— cost: a short key must travel with the text</li>
              <li>— any word-level edit breaks recovery</li>
            </ul>
          </Panel>
        </>
      }
    />
  )
}
