/**
 * v3 · hide — the secret writes the message.
 *
 * There is no carrier to supply and no words to change, so this view is much
 * simpler than v1's: a secret, a passphrase, and a button. The model does the
 * writing, and every token it emits was chosen by the secret.
 */
import { useState } from "react"
import { MAX_SECRET_LENGTH, normalizeSecret } from "../codec"
import { embed } from "../codec/tokens"
import { Button, Field, Panel, Tag, TextInput } from "./primitives"
import { Columns } from "./Columns"
import { useTokenModel } from "./useTokenModel"
import { TokenAbout, ModelPanel } from "./TokenShared"

export function TokenHideView() {
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const model = useTokenModel()

  const copy = async () => {
    await navigator.clipboard.writeText(carrier)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const ready = Boolean(secret && passphrase) && !busy
  const words = carrier ? carrier.split(/\s+/).filter(Boolean).length : 0

  const write = async () => {
    setBusy(true)
    setError(null)
    setCarrier("")
    setCopied(false)
    try {
      if (!(await model.ensure())) return
      const text = await embed(secret, passphrase, (done, total) =>
        setStep({ done, total }),
      )
      setCarrier(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setStep(null)
    }
  }

  return (
    <Columns
      left={
        <>
          <Panel title="encoding" right={<Tag>sampled</Tag>}>
            <p className="text-[10px] leading-relaxed tracking-wider text-muted">
              your message chooses each word as the model writes. nothing is
              swapped afterwards, so the text reads as written.
            </p>
          </Panel>
          <ModelPanel model={model} />
        </>
      }
      center={
        <>
          <Panel title="payload">
            <Field
              label="secret message"
              hint={
                <span className="text-muted">
                  {secret.length}/{MAX_SECRET_LENGTH}
                </span>
              }
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
            <div className="mt-3">
              <Field label="shared passphrase">
                <TextInput
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="the one you both know"
                  aria-label="Shared passphrase"
                />
              </Field>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
              // the passphrase also picks what the message is about, so
              nothing extra travels with it
            </p>
          </Panel>

          <Panel
            title="message"
            right={
              carrier ? (
                <span className="text-[10px] tracking-wider text-muted">
                  {words} words
                </span>
              ) : null
            }
          >
            {carrier ? (
              <p className="whitespace-pre-wrap border border-faint px-3 py-2 text-xs normal-case leading-relaxed text-fg">
                {carrier}
              </p>
            ) : (
              <p className="border border-faint px-3 py-2 text-[10px] leading-relaxed tracking-wider text-muted">
                {busy
                  ? step
                    ? `writing… ${step.done}/${step.total} bits placed`
                    : model.loading
                      ? "fetching the model…"
                      : "starting…"
                  : "enter a secret and a passphrase, then write the message."}
              </p>
            )}
            <Button
              variant={carrier ? "ready" : "ghost"}
              onClick={copy}
              disabled={!carrier}
              className="mt-3 w-full"
            >
              {copied ? "copied ✓" : "copy message"}
            </Button>
            {error && (
              <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-fg">
                {error}
              </p>
            )}
          </Panel>

          <TokenAbout />
        </>
      }
      right={
        <Panel title="status" right={<Tag>{carrier ? "ready" : "idle"}</Tag>}>
          <Button
            variant={ready && !carrier ? "ready" : "solid"}
            onClick={write}
            disabled={!ready}
            className="mb-3 w-full"
          >
            {busy ? "working…" : carrier ? "write another" : "write the message"}
          </Button>
          <dl className="space-y-1 text-[10px] tracking-wider">
            <Row label="words" value={carrier ? String(words) : "—"} />
            <Row
              label="chars"
              value={carrier ? String(carrier.length) : "—"}
            />
            <Row
              label="secret"
              value={secret ? `${secret.length}/${MAX_SECRET_LENGTH}` : "—"}
            />
            <Row label="model" value={model.ready ? "loaded" : "not loaded"} />
          </dl>
          <p className="mt-3 border-t border-edge pt-2 text-[10px] leading-relaxed tracking-wider text-muted">
            // every word must arrive exactly as written. unlike v1 this
            survives no edits at all.
          </p>
        </Panel>
      }
    />
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  )
}
