/**
 * v3 · reveal — replay the model over the received text.
 *
 * Decoding is not free here: it runs a forward pass per word, so unlike v1
 * this cannot decode as you type. It runs on demand.
 */
import { useState } from "react"
import { extract } from "../codec/tokens"
import { Button, Field, Panel, Tag, TextArea, TextInput } from "./primitives"
import { Columns } from "./Columns"
import { RevealOutput } from "./RevealOutput"
import { useTokenModel } from "./useTokenModel"
import { TokenAbout, ModelPanel } from "./TokenShared"

export function TokenRevealView() {
  const [carrier, setCarrier] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [result, setResult] = useState<{
    secret: string | null
    tokens: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const model = useTokenModel()

  const ready = Boolean(carrier.trim() && passphrase) && !busy

  const read = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      if (!(await model.ensure())) return
      const out = await extract(carrier, passphrase)
      setResult({ secret: out.secret, tokens: out.tokens })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Columns
      left={
        <>
          <Panel title="about">
            <p className="text-[10px] leading-relaxed tracking-wider text-muted">
              paste the message and enter the passphrase it was written with.
              the words must be exactly as sent — this one does not tolerate
              edits.
            </p>
          </Panel>
          <ModelPanel model={model} />
        </>
      }
      center={
        <>
          <Panel title="received message">
            <TextArea
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              rows={5}
              className="normal-case"
              placeholder="Paste the message you received."
              aria-label="Received carrier text"
            />
          </Panel>
          <Panel title="passphrase">
            <Field label="the one you both know">
              <TextInput
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="the passphrase you agreed on"
                aria-label="Shared passphrase"
              />
            </Field>
            <div className="mt-3">
              <Button
                variant={ready ? "ready" : "solid"}
                onClick={read}
                disabled={!ready}
                className="w-full"
              >
                {busy
                  ? model.loading
                    ? "fetching the model…"
                    : "reading…"
                  : "reveal the message"}
              </Button>
            </div>
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
        <Panel
          title="output"
          right={
            result ? (
              result.secret ? (
                <Tag tone="green">recovered</Tag>
              ) : (
                <Tag tone="red">no match</Tag>
              )
            ) : (
              <Tag>idle</Tag>
            )
          }
        >
          {result?.secret ? (
            <RevealOutput secret={result.secret} />
          ) : (
            <p className="border border-faint px-3 py-2 text-xs leading-relaxed text-muted">
              {result
                ? "wrong passphrase, or a word was changed in transit."
                : "Paste the message and enter the passphrase."}
            </p>
          )}
          {result && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px] tracking-wider">
              <div>
                <dt className="text-muted">words read</dt>
                <dd className="text-fg">{result.tokens}</dd>
              </div>
              <div>
                <dt className="text-muted">model</dt>
                <dd className="text-fg">local</dd>
              </div>
            </dl>
          )}
        </Panel>
      }
    />
  )
}
