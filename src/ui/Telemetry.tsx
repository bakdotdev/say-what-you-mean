/**
 * Technical readout for the right column — the machine's view of the text.
 * Always populated, so the column is never empty.
 */
import { useEffect, useState } from "react"
import { analyzeCover, deriveKeys, tokenizeSpans } from "../codec"
import { Panel } from "./primitives"

const hex = (v: bigint, bits: number): string =>
  v.toString(16).padStart(Math.ceil(bits / 4), "0")

export function Telemetry({
  carrier,
  passphrase,
  bits,
  flips,
  locked,
  /** Dim the panel and hold values at em-dash until there is a passphrase. */
  inert = false,
}: {
  carrier: string
  passphrase: string
  bits: number
  flips: number
  locked: number
  inert?: boolean
}) {
  const [syndrome, setSyndrome] = useState<string>("—")

  useEffect(() => {
    let cancelled = false
    if (!passphrase || !carrier.trim() || !bits) {
      setSyndrome("—")
      return
    }
    ;(async () => {
      try {
        const keys = await deriveKeys(passphrase)
        const { syndrome: s } = await analyzeCover(carrier, bits, keys)
        if (!cancelled) setSyndrome(hex(s, bits))
      } catch {
        if (!cancelled) setSyndrome("—")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [carrier, passphrase, bits])

  const spans = tokenizeSpans(carrier)
  const words = spans.length
  const distinct = new Set(spans.map((s) => s.word)).size
  const chars = carrier.length
  const avgLen = words ? (spans.reduce((n, s) => n + s.word.length, 0) / words) : 0
  const usable = Math.max(0, words - locked)
  const headroom = usable - bits
  const density = words ? (bits / words) : 0

  const dash = (value: string) => (inert ? "—" : value)

  return (
    <Panel
      title="telemetry"
      right={
        inert ? (
          <span className="text-[10px] tracking-wider text-muted">idle</span>
        ) : undefined
      }
    >
      <dl
        className={
          "space-y-1 text-[10px] tracking-wider " + (inert ? "opacity-40" : "")
        }
      >
        <Row k="syndrome" v={dash(syndrome)} mono />
        <Row k="payload" v={dash(`${bits} bits`)} />
        <Row k="cover" v={dash(`${words} words / ${chars} chars`)} />
        <Row k="distinct" v={dash(`${distinct}`)} />
        <Row k="avg word" v={dash(`${avgLen.toFixed(1)} chars`)} />
        <Row k="usable slots" v={dash(`${usable}`)} />
        <Row
          k="headroom"
          v={dash(headroom >= 0 ? `+${headroom}` : `${headroom}`)}
          warn={!inert && headroom < 0}
        />
        <Row k="load" v={dash(`${(density * 100).toFixed(1)}% bits/word`)} />
        <Row k="changes" v={dash(`${flips}`)} />
        <Row
          k="efficiency"
          v={dash(flips ? `${(bits / flips).toFixed(2)} bits/change` : "—")}
        />
      </dl>
      <p className="mt-2 border-t border-edge pt-2 text-[9px] leading-relaxed tracking-wider text-muted">
        pbkdf2-sha256 300k · hkdf split addr/stream/mac · 16-bit tag
        <br />
        gf(2) syndrome coding · coset-leader sparsify
      </p>
    </Panel>
  )
}

function Row({
  k,
  v,
  mono,
  warn,
}: {
  k: string
  v: string
  mono?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd
        className={
          "truncate text-right " +
          (warn ? "text-fg" : "text-fg-dim ") +
          (mono ? " font-mono" : "")
        }
        title={v}
      >
        {v}
      </dd>
    </div>
  )
}
