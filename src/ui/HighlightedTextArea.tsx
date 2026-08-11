/**
 * A textarea that draws boxes around specific words *in place*, as you type.
 *
 * Technique: a backdrop div sits exactly under a transparent-background
 * textarea and mirrors its text with `color: transparent`, so only the boxes
 * are visible; the real glyphs and caret come from the textarea on top.
 *
 * The boxes use `box-shadow` (a ring) rather than `border` or `padding`, so
 * they occupy NO layout space — line height and wrapping are byte-identical to
 * the plain textarea, which is what keeps the two layers in perfect register.
 *
 * Both layers must share font, size, line-height, letter-spacing, padding, and
 * wrapping rules; those live in SHARED below.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react"

export interface Mark {
  start: number
  end: number
  /**
   * `carrier` — being changed to carry the payload (faint fill).
   * `locked`  — you pinned it; the solver will never touch it (stronger fill).
   */
  kind: "locked" | "carrier"
}

const SHARED =
  "px-2.5 py-1.5 font-mono text-[13px] leading-relaxed tracking-normal whitespace-pre-wrap break-words"

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
  onWordClick?: (index: number) => void
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const backRef = useRef<HTMLDivElement | null>(null)

  // Keep the backdrop scrolled with the textarea.
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
        {renderMarked(value, marks)}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          if (!onWordClick) return
          const pos = e.currentTarget.selectionStart
          const hit = marks.findIndex((m) => pos >= m.start && pos <= m.end)
          if (hit >= 0) onWordClick(hit)
        }}
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

/** Split the text into plain runs and ringed runs at the mark offsets. */
function renderMarked(text: string, marks: readonly Mark[]): ReactNode[] {
  const ordered = [...marks]
    .filter((m) => m.end > m.start)
    .sort((a, b) => a.start - b.start)
  const out: ReactNode[] = []
  let cursor = 0
  ordered.forEach((m, i) => {
    if (m.start < cursor) return // skip overlaps
    if (m.start > cursor) out.push(text.slice(cursor, m.start))
    out.push(
      <span
        key={i}
        // Background fills only, no borders. box-shadow spreads the fill a
        // little beyond the glyphs without taking layout space, so the
        // backdrop stays in exact register with the textarea.
        className={
          m.kind === "locked"
            ? "rounded-[2px] bg-accent/40 shadow-[0_0_0_2px] shadow-accent/40"
            : "rounded-[2px] bg-accent/12 shadow-[0_0_0_2px] shadow-accent/12"
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
