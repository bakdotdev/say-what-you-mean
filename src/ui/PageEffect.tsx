/**
 * Wraps the whole app in the Canvas UI decrypt-reveal cipher curtain.
 *
 * The component handles its own capability detection: where Chrome's
 * HTML-in-Canvas API is unavailable it renders children as ordinary DOM with
 * no errors. So we always mount it and let it decide — gating it ourselves
 * only risks never mounting it at all.
 *
 * Enabled by chrome://flags/#canvas-draw-element locally, or by the
 * origin-trial token injected into <head> at build time for deployed visitors.
 */
import type { ReactNode } from "react"
import { DecryptReveal } from "../components/canvasui/DecryptReveal"

const AMBER = "#ffb62e"

export function PageEffect({ children }: { children: ReactNode }) {
  return (
    <DecryptReveal
      color={AMBER}
      radius={320}
      softness={0.5}
      cell={10}
      passthrough={0.15}
      edgeFlicker={1}
      edgeGlow={2}
      scramble={0.1}
      scrambleSpeed={6}
      // Chromatic aberration off — set through the documented prop so the
      // vendored component stays byte-identical to upstream.
      aberration={0}
      background="#0b0a08"
      className="block min-h-screen"
    >
      {children}
    </DecryptReveal>
  )
}
