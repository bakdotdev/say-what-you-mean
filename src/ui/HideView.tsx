import { useCallback, useMemo, useState } from "react"
import { normalizeSecret, MAX_SECRET_LENGTH, tokenizeSpans } from "../codec"
import { useMatrixPlan, applyPlan } from "./useMatrixPlan"
import { useVocabulary } from "./useWordlist"
import {
  Button,
  CopyableField,
  Field,
  Meter,
  Panel,
  Tag,
  TextInput,
} from "./primitives"
import { HighlightedTextArea, type Mark } from "./HighlightedTextArea"
import { Columns } from "./Columns"
import { About } from "./About"
import { SwapPicker } from "./SwapPicker"
import { Telemetry } from "./Telemetry"
import { useAiRewrite } from "./useAiRewrite"
import { useCarrierGenerator } from "./useCarrierGenerator"

export function HideView() {
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [locked, setLocked] = useState<number[]>([])
  const [copied, setCopied] = useState(false)
  const [applying, setApplying] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)
  const ai = useAiRewrite()
  const generator = useCarrierGenerator()

  const vocabulary = useVocabulary()
  const status = useMatrixPlan(secret, passphrase, carrier, locked)
  const spans = useMemo(() => tokenizeSpans(carrier), [carrier])

  const flips = useMemo(() => status.plan?.flips ?? [], [status.plan])
  const flipSet = useMemo(() => new Set(flips), [flips])
  const lockedSet = useMemo(() => new Set(locked), [locked])

  // Box locked words solidly and to-be-swapped words dimly, in place.
  const marks: Mark[] = useMemo(
    () =>
      spans.flatMap<Mark>((span, i) => {
        if (lockedSet.has(i))
          return [{ start: span.start, end: span.end, kind: "locked" }]
        if (flipSet.has(i))
          return [{ start: span.start, end: span.end, kind: "carrier" }]
        return []
      }),
    [spans, flipSet, lockedSet],
  )

  const toggleLock = useCallback((slot: number) => {
    setLocked((prev) =>
      prev.includes(slot) ? prev.filter((i) => i !== slot) : [...prev, slot],
    )
  }, [])

  const onSecret = (raw: string) =>
    setSecret(normalizeSecret(raw).slice(0, MAX_SECRET_LENGTH))

  const apply = async () => {
    if (flips.length === 0) return
    setApplying(true)
    try {
      const next = await applyPlan(carrier, flips, passphrase, vocabulary)
      setCarrier(next)
      setCopied(false)
    } finally {
      setApplying(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(carrier)
    setCopied(true)
  }

  const generateCarrier = async () => {
    const next = await generator.generate(secret, passphrase, vocabulary)
    if (next) {
      setCarrier(next)
      setLocked([])
      setCopied(false)
    }
  }

  const aiRewrite = async () => {
    const next = await ai.rewrite(
      secret,
      passphrase,
      carrier,
      vocabulary,
      locked,
    )
    if (next) {
      setCarrier(next)
      setCopied(false)
    }
  }

  const ready = Boolean(secret && passphrase)

  const encodingPanel = (
    <Panel
      title="encoding"
      right={
        <span className="text-[10px] tracking-wider text-muted">matrix</span>
      }
    >
      <p className="text-[10px] leading-relaxed tracking-wider text-muted">
        // syndrome coding: the whole paragraph is one codeword, and only the
        minimum-weight correction changes. most of your text is left exactly as
        written.
      </p>
      <dl className="mt-2 space-y-1 text-[10px] tracking-wider">
        <div className="flex justify-between">
          <dt className="text-muted">payload</dt>
          <dd className="text-fg">{status.bits || "—"} bits</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">words</dt>
          <dd className="text-fg">{status.words}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">locked</dt>
          <dd className="text-fg">{locked.length}</dd>
        </div>
      </dl>
      {locked.length > 0 && (
        <button
          onClick={() => setLocked([])}
          className="mt-2 w-full border border-edge px-2 py-1 text-[10px] uppercase tracking-wider text-muted hover:border-accent hover:text-fg"
        >
          unlock all
        </button>
      )}
    </Panel>
  )

  const payloadPanel = (
    <Panel title="payload">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="secret message"
          hint={`${secret.length}/${MAX_SECRET_LENGTH}`}
        >
          <TextInput
            value={secret}
            onChange={(e) => onSecret(e.target.value)}
            placeholder="DOCK AT 9"
            aria-label="Secret message"
          />
        </Field>
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
  )

  const carrierPanel = (
    <Panel
      title="carrier"
      right={
        ready ? (
          <span className="text-[10px] tracking-wider text-muted">
            {status.embedded
              ? "embedded"
              : `${flips.length} to swap of ${status.words}`}
          </span>
        ) : undefined
      }
    >
      <div className="relative">
      <HighlightedTextArea
        value={carrier}
        onChange={(next) => {
          setCarrier(next)
          setCopied(false)
        }}
        marks={marks}
        rows={10}
        placeholder={
          ready
            ? "Paste or write anything. Only the boxed words need swapping — the rest stays exactly as you wrote it."
            : "Enter a secret and passphrase to begin."
        }
        disabled={!ready}
        ariaLabel="Carrier text"
      />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
        // shaded = being changed · solid = locked by you · click any word to lock it
      </p>
      <Button
        variant={status.embedded ? "ready" : "ghost"}
        onClick={copy}
        disabled={!status.embedded}
        className="mt-2 w-full"
      >
        {copied ? "copied ✓" : "copy carrier"}
      </Button>
    </Panel>
  )

  const statusPanel = ready ? (
    <Panel
      title="status"
      right={
        status.busy ? (
          <Tag>working</Tag>
        ) : status.problem ? (
          <Tag tone="red">blocked</Tag>
        ) : status.embedded ? (
          <Tag tone="green">embedded</Tag>
        ) : (
          <Tag>{flips.length} swaps</Tag>
        )
      }
    >
      <Meter
        value={status.embedded ? 1 : status.words}
        max={status.embedded ? 1 : Math.max(status.words, status.bits + 1)}
        tone={status.embedded ? "green" : "accent"}
      />
      {status.problem ? (
        <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-fg">
          // {status.problem}
        </p>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
          {status.embedded
            ? "// this text carries the message. copy it."
            : `// swap the ${flips.length} boxed words, or apply automatically`}
        </p>
      )}
      <div className="mt-3 space-y-1.5">
        <Button
          onClick={generateCarrier}
          disabled={generator.busy}
          className="w-full"
        >
          {generator.busy
            ? generator.stage || "generating…"
            : "generate a carrier for me"}
        </Button>
        {generator.error && (
          <p className="text-[10px] leading-relaxed tracking-wider text-fg">
            // {generator.error}
          </p>
        )}
        <Button
          onClick={aiRewrite}
          disabled={status.embedded || flips.length === 0 || ai.busy}
          className="w-full"
        >
          {ai.busy ? "choosing words…" : "pick words naturally · ai"}
        </Button>
        {ai.error && (
          <p className="text-[10px] leading-relaxed tracking-wider text-fg">
            // {ai.error}
          </p>
        )}
        <Button
          variant="ghost"
          onClick={apply}
          disabled={status.embedded || flips.length === 0 || applying}
          className="w-full"
        >
          {applying ? "applying…" : `blunt swap ×${flips.length}`}
        </Button>

      </div>
    </Panel>
  ) : null

  const wordPanel =
    ready && spans.length > 0 ? (
      <Panel
        title="word map"
        right={
          <span className="text-[10px] tracking-wider text-muted">
            click to lock
          </span>
        }
      >
        <div className="flex flex-wrap gap-1">
          {spans.map((span, i) => {
            const isLocked = lockedSet.has(i)
            const isFlip = flipSet.has(i)
            return (
              <button
                key={i}
                onClick={(e) => {
                  if (e.altKey || e.shiftKey || isLocked) toggleLock(i)
                  else if (isFlip) setPicking(i)
                  else toggleLock(i)
                }}
                title={
                  isLocked
                    ? "locked — never swapped"
                    : isFlip
                      ? "needs swapping"
                      : "kept as written"
                }
                className={
                  "border px-1.5 py-0.5 text-xs normal-case text-fg transition-opacity " +
                  (isLocked
                    ? "border-fg bg-accent/25 opacity-100"
                    : isFlip
                      ? "border-fg/50 bg-accent/10 opacity-100"
                      : "border-fg/20 opacity-20 hover:opacity-50")
                }
              >
                {span.word}
              </button>
            )
          })}
        </div>
      </Panel>
    ) : null

  return (
    <Columns
      left={encodingPanel}
      center={
        <>
          {payloadPanel}
          {carrierPanel}
          {wordPanel}
          <About />
        </>
      }
      right={
        <>
          {statusPanel}
          {picking !== null && spans[picking] && (
            <SwapPicker
              word={spans[picking].word}
              passphrase={passphrase}
              vocabulary={vocabulary}
              onPick={(replacement) => {
                const span = spans[picking]
                setCarrier(
                  carrier.slice(0, span.start) +
                    replacement +
                    carrier.slice(span.end),
                )
                setPicking(null)
                setCopied(false)
              }}
              onClose={() => setPicking(null)}
            />
          )}
          {ready && (
            <Telemetry
              carrier={carrier}
              passphrase={passphrase}
              bits={status.bits}
              flips={flips.length}
              locked={locked.length}
            />
          )}
        </>
      }
    />
  )
}
