import { useMemo, useState } from "react"
import {
  normalizeSecret,
  MAX_SECRET_LENGTH,
  DENSITY_PRESETS,
  FEATURE_METHODS,
} from "../codec"
import { useEncoder } from "./useEncoder"
import { useWordDigests } from "./useWordlist"
import { Button, Field, Meter, Panel, Tag, TextArea, TextInput } from "./primitives"
import { WordInspector } from "./WordInspector"

const DENSITY_LABELS: Record<number, { name: string; blurb: string }> = {
  1: { name: "FREEST", blurb: "~50% of words fit · longest carrier" },
  2: { name: "BALANCED", blurb: "~25% of words fit · medium carrier" },
  3: { name: "COMPACT", blurb: "~12% of words fit · short carrier" },
  4: { name: "TIGHTEST", blurb: "~6% of words fit · shortest carrier" },
}

export function HideView() {
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [inspecting, setInspecting] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [density, setDensity] = useState<number>(DENSITY_PRESETS.balanced)

  const { encoder, state, error } = useEncoder(
    secret,
    passphrase,
    carrier,
    density,
  )
  const digests = useWordDigests(encoder)

  const suggestions = useMemo(() => {
    if (!encoder || digests.length === 0) return []
    return encoder.suggest(carrier, digests, 10)
  }, [encoder, digests, carrier])

  const onSecret = (raw: string) =>
    setSecret(normalizeSecret(raw).slice(0, MAX_SECRET_LENGTH))

  const appendWord = (word: string) => {
    setCarrier((c) => (c.trim() ? `${c.trimEnd()} ${word}` : word))
    setCopied(false)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(carrier)
    setCopied(true)
  }

  const ready = Boolean(secret && passphrase)
  const solved = state?.solved ?? false
  const info = DENSITY_LABELS[density]

  return (
    <div className="space-y-3">
      {/* 1. Encoding parameters */}
      <Panel
        title="encoding"
        right={
          <span className="text-[10px] tracking-wider text-muted">
            {density}/{FEATURE_METHODS.length} methods
          </span>
        }
      >
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
            density
          </span>
          <span className="text-[10px] tracking-wider text-fg-dim">
            {info.name} · {info.blurb}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={density}
          onChange={(e) => setDensity(Number(e.target.value))}
          aria-label="Density: writing freedom vs carrier length"
          className="w-full"
        />
        <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-[0.18em] text-muted">
          <span>← write freely</span>
          <span>shorter text →</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {FEATURE_METHODS.map((m, i) => (
            <span
              key={m.id}
              title={m.describe}
              className={
                "border px-1.5 py-0.5 text-[10px] tracking-wider " +
                (i < density
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-edge text-muted/50")
              }
            >
              {m.label}
            </span>
          ))}
        </div>
      </Panel>

      {/* 2. Inputs, below the slider */}
      <Panel title="payload">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="secret message"
            hint={`${secret.length}/${MAX_SECRET_LENGTH}`}
          >
            <TextInput
              value={secret}
              onChange={(e) => onSecret(e.target.value)}
              placeholder="MEET AT 8"
              aria-label="Secret message"
            />
          </Field>
          <Field label="shared passphrase">
            <TextInput
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="known to both parties"
              aria-label="Shared passphrase"
            />
          </Field>
        </div>
      </Panel>

      {/* 3. Carrier composition */}
      <Panel
        title="carrier"
        right={
          state ? (
            <span className="text-[10px] tracking-wider text-muted">
              {state.greenCount}/{state.tokens.length} words fit
            </span>
          ) : undefined
        }
      >
        <TextArea
          value={carrier}
          onChange={(e) => {
            setCarrier(e.target.value)
            setCopied(false)
          }}
          rows={6}
          placeholder={
            ready
              ? "Write ordinary sentences. Keep the words that light up; replace the ones that don't."
              : "Enter a secret and passphrase to begin."
          }
          disabled={!ready}
          aria-label="Carrier text"
        />
      </Panel>

      {error && (
        <p className="border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </p>
      )}

      {ready && state && (
        <>
          <StatusPanel
            solved={solved}
            determined={state.determinedBits}
            total={state.totalBits}
            redCount={state.redCount}
            survivable={state.survivableDeletions}
            equations={state.usableEquations}
          />

          {state.words.length > 0 && (
            <Panel title="word map">
              <div className="flex flex-wrap gap-1">
                {state.words.map((w, i) => (
                  <button
                    key={i}
                    data-flag={w.green ? "green" : "red"}
                    title={`${w.satisfied}/${w.total} methods fit`}
                    onClick={() => setInspecting(i)}
                    className={
                      "border px-1.5 py-0.5 text-xs transition-colors " +
                      (w.green
                        ? "border-green/40 bg-green/10 text-green hover:bg-green/20"
                        : "border-red/40 bg-red/10 text-red hover:bg-red/20")
                    }
                  >
                    {w.word}
                  </button>
                ))}
              </div>
              {inspecting !== null && encoder && state.words[inspecting] && (
                <div className="mt-3">
                  <WordInspector
                    report={state.words[inspecting]}
                    encoder={encoder}
                    onClose={() => setInspecting(null)}
                  />
                </div>
              )}
            </Panel>
          )}

          {suggestions.length > 0 && !solved && (
            <Panel title="candidates">
              <div className="flex flex-wrap gap-1">
                {suggestions.map((w) => (
                  <button
                    key={w}
                    onClick={() => appendWord(w)}
                    className="border border-edge bg-panel-2 px-1.5 py-0.5 text-xs text-fg-dim hover:border-accent hover:text-accent"
                  >
                    {w}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={copy} disabled={!solved}>
              {copied ? "copied ✓" : "copy carrier"}
            </Button>
            {!solved && (
              <span className="text-[10px] tracking-wider text-muted">
                locked until payload is fully embedded
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatusPanel({
  solved,
  determined,
  total,
  redCount,
  survivable,
  equations,
}: {
  solved: boolean
  determined: number
  total: number
  redCount: number
  survivable: number
  equations: number
}) {
  return (
    <Panel
      title="status"
      right={
        solved ? (
          <Tag tone="green">embedded</Tag>
        ) : redCount > 0 ? (
          <Tag tone="red">{redCount} to replace</Tag>
        ) : (
          <Tag>incomplete</Tag>
        )
      }
    >
      <Meter
        value={solved ? survivable + total : determined}
        max={solved ? survivable + total : total}
        tone={solved ? "green" : "accent"}
      />
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px] tracking-wider">
        <div>
          <dt className="text-muted">bits</dt>
          <dd className="text-fg">
            {determined}/{total}
          </dd>
        </div>
        <div>
          <dt className="text-muted">equations</dt>
          <dd className="text-fg">{equations}</dd>
        </div>
        <div>
          <dt className="text-muted">deletions survived</dt>
          <dd className={solved ? "text-green" : "text-muted"}>
            {solved ? `~${survivable}` : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
        {solved
          ? "// keep writing to raise durability — more words survive more deletions"
          : redCount > 0
            ? "// highlighted words contradict the payload; swap them out"
            : "// add more fitting words until every payload bit is covered"}
      </p>
    </Panel>
  )
}
