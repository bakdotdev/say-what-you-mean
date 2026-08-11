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
   * `carrier` — being changed to carry the payload (faint fill).
   * `locked`  — you pinned it; the solver will never touch it (stronger fill).
   * `plain`   — untouched, but still clickable so any word can be locked.
   */
  kind: "locked" | "carrier" | "plain"
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
  locked: "bg-accent/45 shadow-[0_0_0_2px] shadow-accent/45",
  carrier: "bg-accent/15 shadow-[0_0_0_2px] shadow-accent/15",
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
        className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${SHARED}`}
      >
        {renderMarked(value, marks, onWordClick)}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        spellCheck={false}
        className={`relative block w-full resize-y bg-transparent normal-case text-fg caret-accent outline-none placeholder:text-muted/60 ${SHARED}`}
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
          `rounded-[2px] ${fill}` +
          (clickable
            ? " pointer-events-auto cursor-pointer hover:bg-accent/25"
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
