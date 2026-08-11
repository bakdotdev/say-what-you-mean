import { useEffect, useRef, useState } from "react"
import { decode, type DecodeResult } from "../codec"
import { Field, TextArea, TextInput, Tag } from "./primitives"

export function RevealView() {
  const [carrier, setCarrier] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [result, setResult] = useState<DecodeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const runId = useRef(0)

  useEffect(() => {
    if (!carrier.trim() || !passphrase) {
      setResult(null)
      return
    }
    const id = ++runId.current
    setBusy(true)
    const timer = setTimeout(() => {
      decode(carrier, passphrase)
        .then((r) => {
          if (runId.current === id) setResult(r)
        })
        .finally(() => {
          if (runId.current === id) setBusy(false)
        })
    }, 160)
    return () => clearTimeout(timer)
  }, [carrier, passphrase])

  const found = result?.secret != null

  return (
    <div className="space-y-6">
      <Field label="Paste the carrier text">
        <TextArea
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          rows={5}
          placeholder="Paste the text you received."
          aria-label="Received carrier text"
        />
      </Field>
      <Field label="Shared passphrase">
        <TextInput
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="the passphrase you agreed on"
          aria-label="Shared passphrase"
        />
      </Field>

      {result && (
        <div
          className={
            "rounded-lg border p-4 " +
            (found
              ? "border-green/40 bg-green/10"
              : "border-red/40 bg-red/10")
          }
        >
          {found ? (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-green">
                Hidden message
              </p>
              <p className="font-mono text-lg text-fg">{result.secret}</p>
            </>
          ) : (
            <p className="text-sm text-red">
              No message found — wrong passphrase, or the text was damaged
              beyond recovery.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag>{result.diagnostics.words} words</Tag>
            <Tag>{result.diagnostics.distinctWords} distinct</Tag>
            {found && (
              <Tag tone="green">
                {result.diagnostics.bitsRecovered}/
                {result.diagnostics.bitsTotal} bits
              </Tag>
            )}
          </div>
        </div>
      )}
      {busy && !result && <p className="text-sm text-muted">Decoding…</p>}
    </div>
  )
}
