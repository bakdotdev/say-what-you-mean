import { useEffect, useRef, useState } from "react"
import { decode, type DecodeResult } from "../codec"
import { Field, Panel, Tag, TextArea, TextInput } from "./primitives"
import { DecryptReveal } from "../components/canvasui/DecryptReveal"

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
    <div className="space-y-3">
      <Panel title="received carrier">
        <TextArea
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          rows={6}
          placeholder="Paste the text you received."
          aria-label="Received carrier text"
        />
      </Panel>

      <Panel title="key">
        <Field label="shared passphrase">
          <TextInput
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="the passphrase you agreed on"
            aria-label="Shared passphrase"
          />
        </Field>
      </Panel>

      {busy && !result && (
        <p className="text-[10px] tracking-[0.2em] text-muted">// decoding…</p>
      )}

      {result && (
        <Panel
          title="output"
          right={
            found ? <Tag tone="green">recovered</Tag> : <Tag tone="red">no match</Tag>
          }
        >
          {found ? (
            <DecryptReveal
              key={result.secret}
              color="#ffb62e"
              radius={260}
              cell={11}
              passthrough={0.12}
              edgeFlicker={1}
              className="block"
            >
              <p className="break-all border border-green/40 bg-green/10 px-3 py-3 text-base tracking-widest text-green">
                {result.secret}
              </p>
            </DecryptReveal>
          ) : (
            <p className="border border-red/40 bg-red/10 px-3 py-2 text-xs leading-relaxed text-red">
              wrong passphrase, or the text was damaged beyond recovery.
            </p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px] tracking-wider sm:grid-cols-4">
            <Stat label="words" value={String(result.diagnostics.words)} />
            <Stat
              label="distinct"
              value={String(result.diagnostics.distinctWords)}
            />
            <Stat
              label="density"
              value={found ? String(result.diagnostics.density) : "—"}
            />
            <Stat
              label="bits"
              value={
                result.diagnostics.bitsTotal
                  ? `${result.diagnostics.bitsRecovered}/${result.diagnostics.bitsTotal}`
                  : "—"
              }
            />
          </dl>
        </Panel>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  )
}
