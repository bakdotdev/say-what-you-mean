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
import {
  HighlightedTextArea,
  MARK_STYLES,
  type Mark,
} from "./HighlightedTextArea"
import { Columns } from "./Columns"
import { About } from "./About"
import { SwapPicker } from "./SwapPicker"
import { Telemetry } from "./Telemetry"
import { useAiRewrite } from "./useAiRewrite"
import { useCarrierGenerator } from "./useCarrierGenerator"
import { useDurableGenerator } from "./useDurableGenerator"
import { useDurablePlan } from "./useDurablePlan"

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
  const durableGen = useDurableGenerator()
  const [durable, setDurable] = useState(false)

  const vocabulary = useVocabulary()
  const status = useMatrixPlan(secret, passphrase, carrier, locked)
  const durablePlan = useDurablePlan(secret, passphrase, carrier, durable)
  const spans = useMemo(() => tokenizeSpans(carrier), [carrier])

  const flips = useMemo(
    () => (durable ? durablePlan.unfit : (status.plan?.flips ?? [])),
    [durable, durablePlan.unfit, status.plan],
  )
  const embedded = durable
    ? (durablePlan.state?.solved ?? false)
    : status.embedded
  const flipSet = useMemo(() => new Set(flips), [flips])
  const lockedSet = useMemo(() => new Set(locked), [locked])

  // Box locked words solidly and to-be-swapped words dimly, in place.
  // Every word is a target so any of them can be locked; only the meaningful
  // ones carry a fill.
  const marks: Mark[] = useMemo(
    () =>
      spans.map<Mark>((span, i) => ({
        start: span.start,
        end: span.end,
        slot: i,
        kind: lockedSet.has(i)
          ? "locked"
          : flipSet.has(i)
            ? "carrier"
            : "plain",
        title: lockedSet.has(i)
          ? "locked — click to unlock"
          : flipSet.has(i)
            ? "being changed — click to lock it"
            : "click to lock",
      })),
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
    const engine = durable ? durableGen : generator
    const next = await engine.generate(secret, passphrase, vocabulary)
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
        <span className="text-[10px] tracking-wider text-muted">
          {durable ? "per-word" : "matrix"}
        </span>
      }
    >
      <div className="mb-2 flex border border-edge">
        {(
          [
            { id: false, label: "compact" },
            { id: true, label: "durable" },
          ] as const
        ).map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => setDurable(opt.id)}
            aria-pressed={durable === opt.id}
            className={
              "flex-1 px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors " +
              (i > 0 ? "border-l border-edge " : "") +
              (durable === opt.id
                ? "bg-accent/15 text-fg"
                : "bg-panel text-muted hover:text-fg-dim")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed tracking-wider text-muted">
        {durable
          ? "// every word carries its own clue, so deleting or reordering words just drops clues and the rest still reconstruct the message. altering a word does break it. costs about twice the length."
          : "// syndrome coding: the whole paragraph is one codeword and only the minimum-weight correction changes. shortest carrier, but word edits break it."}
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
            {embedded
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
        onWordClick={toggleLock}
      />
      </div>
      {/* Swatches use MARK_STYLES, the same source as the text, so the
          legend cannot drift out of sync with what is rendered. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] tracking-wider text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className={`rounded-[2px] font-mono normal-case text-fg ${MARK_STYLES.carrier}`}
          >
            word
          </span>
          being changed
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={`rounded-[2px] font-mono normal-case text-fg ${MARK_STYLES.locked}`}
          >
            word
          </span>
          locked by you
        </span>
        <span>// click any word to lock it</span>
      </div>
      <Button
        variant={embedded ? "ready" : "ghost"}
        onClick={copy}
        disabled={!embedded}
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
        ) : embedded ? (
          <Tag tone="green">embedded</Tag>
        ) : (
          <Tag>{flips.length} swaps</Tag>
        )
      }
    >
      <Meter
        value={embedded ? 1 : status.words}
        max={embedded ? 1 : Math.max(status.words, status.bits + 1)}
        tone={embedded ? "green" : "accent"}
      />
      {status.problem ? (
        <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-fg">
          // {status.problem}
        </p>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
          {embedded
            ? "// this text carries the message. copy it."
            : `// swap the ${flips.length} boxed words, or apply automatically`}
        </p>
      )}
      <div className="mt-3 space-y-1.5">
        <Button
          onClick={generateCarrier}
          disabled={generator.busy || durableGen.busy}
          className="w-full"
        >
          {generator.busy || durableGen.busy
            ? generator.stage || durableGen.stage || "generating…"
            : "generate a carrier for me"}
        </Button>
        {(generator.error || durableGen.error) && (
          <p className="text-[10px] leading-relaxed tracking-wider text-fg">
            // {generator.error ?? durableGen.error}
          </p>
        )}
        <Button
          onClick={aiRewrite}
          disabled={embedded || flips.length === 0 || ai.busy || durable}
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
          disabled={embedded || flips.length === 0 || applying}
          className="w-full"
        >
          {applying ? "applying…" : `blunt swap ×${flips.length}`}
        </Button>

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
