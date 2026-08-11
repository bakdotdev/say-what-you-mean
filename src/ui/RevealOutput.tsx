/**
 * The decoded-secret display.
 *
 * The Canvas UI cipher curtain is behind PAGE_EFFECT_ENABLED; while that is
 * off we use the character-scramble decrypt, which needs no experimental APIs
 * and works in every browser.
 */
import { useEffect, useState } from "react"
import {
  DecryptReveal,
  supportsHtmlInCanvas,
} from "../components/canvasui/DecryptReveal"
import { DecryptText } from "./DecryptText"
import { EFFECT_COLOR, PAGE_EFFECT_ENABLED } from "./PageEffect"

export function RevealOutput({ secret }: { secret: string }) {
  const [rich, setRich] = useState(false)
  useEffect(() => {
    setRich(PAGE_EFFECT_ENABLED && supportsHtmlInCanvas())
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
      color={EFFECT_COLOR}
      radius={240}
      cell={10}
      passthrough={0.12}
      edgeFlicker={1}
      aberration={0}
      className="block"
    >
      <p className="border border-fg/50 bg-accent/10 px-3 py-3 text-xl tracking-[0.3em] text-fg">
        {secret}
      </p>
    </DecryptReveal>
  )
}
