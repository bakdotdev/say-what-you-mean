import { useMemo, useState } from "react"
import { normalizeSecret, MAX_SECRET_LENGTH } from "../codec"
import { useEncoder } from "./useEncoder"
import { useWordDigests } from "./useWordlist"
import {
  Button,
  Field,
  Meter,
  Tag,
  TextArea,
  TextInput,
} from "./primitives"
import { WordInspector } from "./WordInspector"

export function HideView() {
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [inspecting, setInspecting] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const { encoder, state, error } = useEncoder(secret, passphrase, carrier)
  const digests = useWordDigests(encoder)

  const suggestions = useMemo(() => {
    if (!encoder || digests.length === 0) return []
    return encoder.suggest(carrier, digests, 8)
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Secret message"
          hint={`${secret.length}/${MAX_SECRET_LENGTH}`}
        >
          <TextInput
            value={secret}
            onChange={(e) => onSecret(e.target.value)}
            placeholder="MEET AT 8"
            aria-label="Secret message"
          />
        </Field>
        <Field label="Shared passphrase">
          <TextInput
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="known to both of you"
            aria-label="Shared passphrase"
          />
        </Field>
      </div>

      <Field
        label="Write your carrier text"
        hint="keep every word green"
      >
        <TextArea
          value={carrier}
          onChange={(e) => {
            setCarrier(e.target.value)
            setCopied(false)
          }}
          rows={5}
          placeholder="Write ordinary sentences. Each word either fits the hidden message (green) or not (red). Keep going until the meter says the message is hidden."
          disabled={!ready}
          aria-label="Carrier text"
        />
      </Field>

      {error && <p className="text-sm text-red">{error}</p>}

      {ready && state && (
        <>
          <StatusPanel
            solved={solved}
            determined={state.determinedBits}
            total={state.totalBits}
            redCount={state.redCount}
            survivable={state.survivableDeletions}
          />

          {state.tokens.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {state.tokens.map((token, i) => (
                  <button
                    key={i}
                    data-flag={state.wordFlags[i] ? "green" : "red"}
                    onClick={() => setInspecting(i)}
                    className={
                      "rounded px-1.5 py-0.5 font-mono text-xs transition-colors " +
                      (state.wordFlags[i]
                        ? "bg-green/15 text-green hover:bg-green/25"
                        : "bg-red/20 text-red hover:bg-red/30")
                    }
                  >
                    {token}
                  </button>
                ))}
              </div>
              {inspecting !== null &&
                encoder &&
                state.tokens[inspecting] !== undefined && (
                  <WordInspector
                    word={state.tokens[inspecting]}
                    green={state.wordFlags[inspecting]}
                    encoder={encoder}
                    onClose={() => setInspecting(null)}
                  />
                )}
            </div>
          )}

          {suggestions.length > 0 && !solved && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">
                Stuck? These words fit — click to add:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((w) => (
                  <button
                    key={w}
                    onClick={() => appendWord(w)}
                    className="rounded border border-edge bg-panel-2 px-2 py-0.5 font-mono text-xs text-fg hover:border-accent"
                  >
                    + {w}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={copy} disabled={!solved}>
              {copied ? "Copied ✓" : "Copy carrier text"}
            </Button>
            {!solved && (
              <span className="text-xs text-muted">
                Copy unlocks once the message is fully hidden.
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
}: {
  solved: boolean
  determined: number
  total: number
  redCount: number
  survivable: number
}) {
  return (
    <div className="space-y-2 rounded-lg border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {solved ? "Message hidden" : "Hiding message…"}
        </span>
        {solved ? (
          <Tag tone="green">survives ~{survivable} deleted words</Tag>
        ) : redCount > 0 ? (
          <Tag tone="red">{redCount} word{redCount === 1 ? "" : "s"} to fix</Tag>
        ) : (
          <Tag tone="muted">
            {determined}/{total} bits
          </Tag>
        )}
      </div>
      <Meter
        value={solved ? survivable + total : determined}
        max={solved ? survivable + total : total}
        tone={solved ? "green" : "accent"}
      />
      <p className="text-xs text-muted">
        {solved
          ? "Keep writing to make it more durable — more words survive more deletions."
          : redCount > 0
            ? "Red words contradict the message. Replace them with green ones."
            : "Write more green words until every payload bit is covered."}
      </p>
    </div>
  )
}
