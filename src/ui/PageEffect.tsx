/**
 * Wraps the whole app in the Canvas UI decrypt-reveal cipher curtain, always on.
 *
 * This needs Chrome's HTML-in-Canvas API (origin trial 148-150, or
 * chrome://flags/#canvas-draw-element). Where it isn't available the children
 * render as ordinary DOM — no errors, just no cipher — so the app is fully
 * usable either way.
 */
import { useEffect, useState, type ReactNode } from "react"
import {
  DecryptReveal,
  supportsHtmlInCanvas,
} from "../components/canvasui/DecryptReveal"

const AMBER = "#ffb62e"

export function PageEffect({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(supportsHtmlInCanvas())
  }, [])

  if (!enabled) return <>{children}</>

  return (
    <DecryptReveal
      color={AMBER}
      radius={300}
      softness={0.55}
      cell={10}
      passthrough={0.14}
      edgeFlicker={1}
      className="block min-h-screen"
    >
      {children}
    </DecryptReveal>
  )
}
