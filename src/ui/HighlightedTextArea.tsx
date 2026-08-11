/**
 * A textarea whose words can be shaded and clicked in place.
 *
 * Technique: a backdrop mirrors the textarea's text exactly (transparent
 * glyphs, so only the fills show) and sits under a transparent-background
 * textarea. The real glyphs and caret come from the textarea on top.
 *
 * Interaction: the backdrop is normally click-through, but the marked word
 * spans re-enable pointer events, so a click lands on the word itself while
 * typing anywhere else still focuses the textarea. That removes the need for a
 * separate word map to click through.
 *
 * Fills use `box-shadow` rather than `border`/`padding`, so they take NO layout
 * space — line height and wrapping stay byte-identical to a plain textarea,
 * which is what keeps the two layers in register.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react"

export interface Mark {
  start: number
  end: number
  /**
   * `carrier`  — being changed to carry the payload (faint fill).
   * `locked`   — you pinned it; never touched (stronger fill).
   * `required` — already carrying a clue; keep it (faint outline).
   * `plain`    — carries nothing, but still clickable so it can be locked.
   */
  kind: "locked" | "carrier" | "required" | "plain"
  /** Index of the word in the tokenised carrier, for click handling. */
  slot?: number
  title?: string
}

const SHARED =
  "px-2.5 py-1.5 font-mono text-[13px] leading-relaxed tracking-normal whitespace-pre-wrap break-words"

/**
 * The only visual language for word state: background opacity. No borders or
 * outlines anywhere — the box-shadow is a spread of the SAME colour, which
 * widens the fill past the glyph edges without taking layout space, so it
 * reads as background rather than an edge.
 *
 * Exported so the legend can render swatches with these exact classes and stay
 * 1:1 with the text by construction, not by someone remembering to update it.
 */
export const MARK_STYLES: Record<Mark["kind"], string> = {
  // Fills hug the glyphs exactly — no shadow spread, no padding — so a marked
  // word occupies the same box as an unmarked one and the backdrop stays in
  // register with the textarea.
  /**
   * Solid amber with dark text. The backdrop sits ABOVE the textarea, so an
   * opaque fill hides the amber glyph underneath and this span's own dark
   * text renders on top — which is why `text-ink` must override the layer's
   * inherited `text-transparent`. Reserved for locked words, the strongest
   * statement in the field.
   */
  locked: "bg-accent text-ink",
  carrier: "bg-accent/15",
  /** Underline only — present but quiet, since most words end up here. */
  required: "border-b border-accent/60",
  plain: "",
}

export function HighlightedTextArea({
  value,
  onChange,
  marks,
  rows = 6,
  placeholder,
  disabled,
  ariaLabel,
  onWordClick,
  busyLabel,
}: {
  value: string
  onChange: (next: string) => void
  marks: readonly Mark[]
  rows?: number
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  /** Receives the mark's `slot` when a shaded word is clicked. */
  onWordClick?: (slot: number) => void
  /**
   * When set, covers the field with a centred progress line. Generation takes
   * tens of seconds across several runs, so the status belongs where the user
   * is looking rather than in a distant panel.
   */
  busyLabel?: string | null
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const backRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const ta = taRef.current
    const back = backRef.current
    if (!ta || !back) return
    const sync = () => {
      back.scrollTop = ta.scrollTop
      back.scrollLeft = ta.scrollLeft
    }
    sync()
    ta.addEventListener("scroll", sync)
    return () => ta.removeEventListener("scroll", sync)
  }, [value])

  return (
    <div className="relative border border-edge bg-panel focus-within:border-accent">
      <div
        ref={backRef}
        aria-hidden="true"
        // normal-case matters: the app shell sets `uppercase`, and required
        // words now render visible text from THIS layer, so without it they
        // would shout in caps while the textarea below stays lowercase.
        className={`pointer-events-none absolute inset-0 z-10 overflow-hidden normal-case text-transparent ${SHARED}`}
      >
        {renderMarked(value, marks, onWordClick)}
      </div>
      {busyLabel && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-panel/85 px-4 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-fg">
            <span className="mr-2 inline-block animate-pulse">▓</span>
            {busyLabel}
          </span>
        </div>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        spellCheck={false}
        className={`relative z-0 block w-full resize-y bg-transparent normal-case text-fg caret-accent outline-none placeholder:text-muted/60 ${SHARED}`}
      />
    </div>
  )
}

function renderMarked(
  text: string,
  marks: readonly Mark[],
  onWordClick?: (slot: number) => void,
): ReactNode[] {
  const ordered = [...marks]
    .filter((m) => m.end > m.start)
    .sort((a, b) => a.start - b.start)
  const out: ReactNode[] = []
  let cursor = 0

  ordered.forEach((m, i) => {
    if (m.start < cursor) return
    if (m.start > cursor) out.push(text.slice(cursor, m.start))

    const fill = MARK_STYLES[m.kind]

    const clickable = onWordClick && m.slot !== undefined

    out.push(
      <span
        key={i}
        title={m.title}
        onMouseDown={
          clickable
            ? (e) => {
                // Stop the click reaching the textarea, which would move the
                // caret and steal focus mid-interaction.
                e.preventDefault()
                e.stopPropagation()
                onWordClick(m.slot as number)
              }
            : undefined
        }
        className={
          fill +
          (clickable
            ? " pointer-events-auto cursor-pointer hover:bg-accent/30"
            : "")
        }
      >
        {text.slice(m.start, m.end)}
      </span>,
    )
    cursor = m.end
  })

  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}
