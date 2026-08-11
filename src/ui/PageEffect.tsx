/**
 * Optional page-wide decrypt-reveal cipher curtain (Canvas UI).
 *
 * Currently disabled. Flip PAGE_EFFECT_ENABLED to re-enable — the wiring,
 * props and colour are kept intact so it is a one-line change.
 *
 * When on, it needs Chrome's HTML-in-Canvas API: chrome://flags/#canvas-draw-element
 * locally, or the origin-trial token injected into <head> at build time from
 * HTML_IN_CANVAS. Without support the component renders children as ordinary
 * DOM, so it is always safe to mount.
 */
import type { ReactNode } from "react"
import { DecryptReveal } from "../components/canvasui/DecryptReveal"

/** Cipher colour — the app's amber. */
export const EFFECT_COLOR = "#ffb62e"

/** Master switch for the page-wide effect. */
export const PAGE_EFFECT_ENABLED = false

export function PageEffect({ children }: { children: ReactNode }) {
  if (!PAGE_EFFECT_ENABLED) return <>{children}</>

  return (
    <DecryptReveal
      color={EFFECT_COLOR}
      radius={320}
      softness={0.5}
      cell={10}
      passthrough={0.15}
      edgeFlicker={1}
      edgeGlow={2}
      scramble={0.1}
      scrambleSpeed={6}
      aberration={0}
      background="#0b0a08"
      className="block min-h-screen"
    >
      {children}
    </DecryptReveal>
  )
}
