/**
 * The decoded-secret display, with a layered reveal effect.
 *
 * Canvas UI's DecryptReveal renders a WebGL cipher curtain over live HTML that
 * decrypts around the cursor — but it depends on the html-in-canvas API
 * (`ctx.drawElementImage` + `canvas.requestPaint`), which ships only behind
 * chrome://flags/#canvas-draw-element or a Chrome origin trial. Everywhere
 * else it silently renders plain HTML.
 *
 * So: use the real effect when the browser actually supports it, and fall back
 * to a character-scramble decrypt (no experimental APIs) otherwise. Both paths
 * show an animated reveal; only the fidelity differs.
 */
import { useEffect, useState } from "react"
import {
  DecryptReveal,
  supportsHtmlInCanvas,
} from "../components/canvasui/DecryptReveal"
import { DecryptText } from "./DecryptText"

const AMBER = "#ffb62e"

export function RevealOutput({ secret }: { secret: string }) {
  // Detect after mount — supportsHtmlInCanvas touches document.
  const [rich, setRich] = useState(false)
  useEffect(() => {
    setRich(supportsHtmlInCanvas())
  }, [])

  if (!rich) {
    return (
      <p className="border border-fg/50 bg-accent/10 px-3 py-3">
        <DecryptText
          key={secret}
          text={secret}
          className="block break-all text-xl tracking-[0.3em]"
        />
      </p>
    )
  }

  return (
    <DecryptReveal
      key={secret}
      color={AMBER}
      radius={240}
      cell={10}
      passthrough={0.12}
      edgeFlicker={1}
      className="block"
    >
      <p className="border border-fg/50 bg-accent/10 px-3 py-3 text-xl tracking-[0.3em] text-fg">
        {secret}
      </p>
    </DecryptReveal>
  )
}
