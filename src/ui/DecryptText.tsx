/**
 * Character-scramble decrypt reveal for a short text string.
 *
 * The canvas-ui DecryptReveal component needs Chrome's experimental
 * "HTML in Canvas" API (`ctx.drawElementImage` + `canvas.requestPaint`), which
 * is undefined in every shipping browser, so it silently renders plain text.
 * Our payload is a short string, not arbitrary HTML — so we scramble
 * characters directly, which needs no experimental API and works everywhere.
 *
 * Each character locks in progressively left-to-right; unlocked characters
 * keep re-rolling from the cipher charset, with a brighter "edge" character at
 * the decrypt front.
 */
import { useEffect, useRef, useState } from "react"

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_\\/[]{}=+*^?#"

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

export function DecryptText({
  text,
  className,
  charMs = 55,
  scrambleMs = 26,
}: {
  text: string
  className?: string
  /** How long before each successive character locks in. */
  charMs?: number
  /** Re-roll interval for unlocked characters. */
  scrambleMs?: number
}) {
  const [display, setDisplay] = useState(text)
  const [revealed, setRevealed] = useState(text.length)
  const frame = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(text)
      setRevealed(text.length)
      return
    }

    let cancelled = false
    const start = performance.now()
    let lastRoll = 0
    let scrambled = text

    const tick = (now: number) => {
      if (cancelled) return
      const elapsed = now - start
      const locked = Math.min(text.length, Math.floor(elapsed / charMs))

      if (now - lastRoll >= scrambleMs) {
        lastRoll = now
        scrambled = [...text]
          .map((ch, i) => {
            if (i < locked) return ch
            if (ch === " ") return " "
            return CHARSET[Math.floor(Math.random() * CHARSET.length)]
          })
          .join("")
      }

      setDisplay(scrambled)
      setRevealed(locked)

      if (locked < text.length) {
        frame.current = requestAnimationFrame(tick)
      } else {
        setDisplay(text)
      }
    }

    setRevealed(0)
    frame.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [text, charMs, scrambleMs])

  return (
    <span className={className} aria-label={text}>
      {[...display].map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={
            i < revealed
              ? "text-fg"
              : i === revealed
                ? "text-fg"
                : "text-muted"
          }
        >
          {ch}
        </span>
      ))}
    </span>
  )
}
