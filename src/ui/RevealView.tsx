import { useEffect, useRef, useState } from "react"
import { decode, type DecodeResult } from "../codec"
import { Field, Panel, Tag, TextArea, TextInput } from "./primitives"
import { RevealOutput } from "./RevealOutput"
import { Columns } from "./Columns"
import { About } from "./About"

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

  const carrierPanel = (
      <Panel title="received carrier">
        <TextArea
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          rows={6}
          className="normal-case"
          placeholder="Paste the text you received."
          aria-label="Received carrier text"
        />
      </Panel>
  )

  const keyPanel = (
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
  )

  const busyLine =
    busy && !result ? (
      <p className="text-[10px] tracking-[0.2em] text-muted">decoding…</p>
    ) : null

  const outputPanel = result ? (
        <Panel
          title="output"
          right={
            found ? <Tag tone="green">recovered</Tag> : <Tag tone="red">no match</Tag>
          }
        >
          {found ? (
            <RevealOutput secret={result.secret!} />
          ) : (
            <p className="border border-faint px-3 py-2 text-xs leading-relaxed text-muted">
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
  ) : null

  return (
    <Columns
      left={
        <Panel title="about">
          <p className="text-[10px] leading-relaxed tracking-wider text-muted">
            paste the text you received and enter the shared passphrase. the
            decoder recomputes every word's keyed clues and reassembles the
            payload; missing or reordered words are tolerated.
          </p>
        </Panel>
      }
      center={
        <>
          {carrierPanel}
          {keyPanel}
          <About />
        </>
      }
      right={
        <>
          {busyLine}
          {outputPanel}
        </>
      }
    />
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
