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
import { Instructions } from "./Instructions"
import { useFreeWords } from "./useFreeWords"
import { SwapPicker } from "./SwapPicker"
import { Telemetry } from "./Telemetry"
import { useAiRewrite } from "./useAiRewrite"
import { useCarrierGenerator } from "./useCarrierGenerator"
import { useDurableGenerator } from "./useDurableGenerator"
import { useDurablePlan } from "./useDurablePlan"

export function HideView({
  durable,
  onDurableChange,
}: {
  durable: boolean
  onDurableChange: (durable: boolean) => void
}) {
  const [secret, setSecret] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [carrier, setCarrier] = useState("")
  const [locked, setLocked] = useState<number[]>([])
  const [copied, setCopied] = useState(false)
  const [applying, setApplying] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)
  const [freeWrite, setFreeWrite] = useState(false)
  const ai = useAiRewrite()
  const generator = useCarrierGenerator()
  const durableGen = useDurableGenerator()

  const vocabulary = useVocabulary()
  const freeWords = useFreeWords(freeWrite && durable, vocabulary)
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
  // Nothing is "required" until the payload can actually be embedded — a
  // carrier too short to carry anything has no load-bearing words.
  const hasPlan = durable
    ? durablePlan.state !== null && !durablePlan.busy
    : status.plan !== null

  const junkSet = useMemo(() => {
    const set = new Set<number>()
    durablePlan.state?.words.forEach((w, i) => {
      if (w.junk) set.add(i)
    })
    return set
  }, [durablePlan.state])

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
            : junkSet.has(i) || !hasPlan
              ? "plain"
              : "required",
        title: lockedSet.has(i)
          ? "locked — click to unlock"
          : flipSet.has(i)
            ? "must change — click to lock instead"
            : junkSet.has(i)
              ? "not used — write anything here"
              : hasPlan
                ? "required to decrypt — click to lock"
                : "click to lock",
      })),
    [spans, flipSet, lockedSet, hasPlan, junkSet],
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
            { id: true, label: "durable" },
            { id: false, label: "compact" },
          ] as const
        ).map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => onDurableChange(opt.id)}
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
          ? "Survives deleted or reordered words. Needs about twice the length."
          : "Shortest carrier. Any word edit breaks it."}
      </p>
      {durable && (
        <div className="mt-3 border-t border-edge pt-3">
          <button
            type="button"
            role="switch"
            aria-checked={freeWrite}
            aria-label="Free-write mode"
            onClick={() => setFreeWrite((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            {/* Square, amber, no native control — matches the terminal look. */}
            <span
              aria-hidden="true"
              className={
                "flex h-3 w-3 shrink-0 items-center justify-center border text-[8px] leading-none " +
                (freeWrite
                  ? "border-accent bg-accent text-ink"
                  : "border-edge bg-panel text-transparent")
              }
            >
              ×
            </span>
            <span
              className={
                "text-[10px] uppercase tracking-[0.18em] " +
                (freeWrite ? "text-fg" : "text-muted")
              }
            >
              free-write
            </span>
          </button>
          <p className="mt-1.5 text-left text-[10px] leading-relaxed tracking-wider text-muted">
            Only suggests words that aren't used for decryption, so anything
            you add is safe.
          </p>
        </div>
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
            ? "Write or paste anything."
            : "Enter a secret and passphrase."
        }
        disabled={!ready}
        ariaLabel="Carrier text"
        busyLabel={
          generator.busy || durableGen.busy
            ? generator.stage || durableGen.stage || "working…"
            : ai.busy
              ? "choosing words…"
              : applying
                ? "applying…"
                : null
        }
        onWordClick={(slot) => {
          // A word that needs changing wants replacements; anything else is
          // a lock toggle.
          if (flipSet.has(slot)) setPicking(slot)
          else toggleLock(slot)
        }}
      />
      </div>

      {/* Swatches use MARK_STYLES, the same source as the text, so the
          legend cannot drift out of sync with what is rendered. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] uppercase tracking-wider text-muted">
        <span className="flex items-center gap-2">
          <span className={`font-mono text-fg ${MARK_STYLES.carrier}`}>
            WORD
          </span>
          NEEDS CHANGING
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-mono text-fg ${MARK_STYLES.required}`}>
            WORD
          </span>
          REQUIRED TO DECRYPT
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-mono text-fg ${MARK_STYLES.locked}`}>
            WORD
          </span>
          LOCKED
        </span>
        <span>CLICK A WORD FOR OPTIONS</span>
      </div>
      <Button
        variant={embedded ? "ready" : "ghost"}
        onClick={copy}
        disabled={!embedded}
        className="mt-3 w-full"
      >
        {copied ? "copied ✓" : "copy carrier message"}
      </Button>
    </Panel>
  )

  const wordsPanel =
    freeWrite && durable && freeWords.length > 0 ? (
      <Panel
        title="free words"
        right={
          <span className="text-[10px] tracking-wider text-muted">
            never used to decrypt
          </span>
        }
      >
        {/* Open by default: the list is the point of the panel. It used to
            scroll inside a fixed height, which hid most of it. */}
        <details open>
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-muted">
            {freeWords.length} words you can add anywhere
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {freeWords.map((w) => (
              <button
                key={w}
                onClick={() => {
                  setCarrier((c) => (c.trim() ? `${c.trimEnd()} ${w}` : w))
                  setCopied(false)
                }}
                className="border border-edge bg-panel-2 px-1.5 py-0.5 text-xs normal-case text-fg-dim hover:border-accent hover:text-fg"
              >
                {w}
              </button>
            ))}
          </div>
        </details>
      </Panel>
    ) : null

  const statusPanel = (
    <Panel
      title="status"
      right={
        !ready ? (
          <Tag>idle</Tag>
        ) : status.busy ? (
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
      <div className="space-y-1.5">
        <Button
          onClick={generateCarrier}
          disabled={!ready || generator.busy || durableGen.busy}
          className="w-full"
        >
          {generator.busy || durableGen.busy
            ? "working…"
            : "generate a carrier for me"}
        </Button>
        {(generator.error || durableGen.error) && (
          <p className="text-[10px] leading-relaxed tracking-wider text-fg">
            {generator.error ?? durableGen.error}
          </p>
        )}
        <Button
          onClick={aiRewrite}
          disabled={!ready || embedded || flips.length === 0 || ai.busy || durable}
          className="w-full"
        >
          {ai.busy ? "choosing…" : "pick words naturally"}
        </Button>
        {ai.error && (
          <p className="text-[10px] leading-relaxed tracking-wider text-fg">
            {ai.error}
          </p>
        )}
        <Button
          variant="ghost"
          onClick={apply}
          disabled={!ready || embedded || flips.length === 0 || applying}
          className="w-full"
        >
          {applying ? "applying…" : `blunt swap ×${flips.length}`}
        </Button>

      </div>

      <div className="mt-3">
        <Meter
          value={embedded ? 1 : status.words}
          max={embedded ? 1 : Math.max(status.words, status.bits + 1)}
          tone={embedded ? "green" : "accent"}
          segments={28}
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-muted">
        {!ready
          ? "Enter a secret and passphrase to begin."
          : status.problem
            ? status.problem
            : embedded
              ? "Ready to copy."
              : `${flips.length} words to change.`}
      </p>
    </Panel>
  )

  return (
    <Columns
      left={encodingPanel}
      center={
        <>
          {payloadPanel}
          {carrierPanel}
          {wordsPanel}
          <Instructions durable={durable} />
          <About />
        </>
      }
      right={
        <>
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
          {statusPanel}
          <Telemetry
            carrier={carrier}
            passphrase={passphrase}
            bits={status.bits}
            flips={flips.length}
            locked={locked.length}
            inert={!ready}
          />
        </>
      }
    />
  )
}
