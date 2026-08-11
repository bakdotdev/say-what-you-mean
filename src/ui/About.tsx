/**
 * The full explanation lives here: approach, what's novel, and honest limits.
 */
import { useEffect, useState } from "react"
import { supportsHtmlInCanvas } from "../components/canvasui/DecryptReveal"

export function About() {
  const [fx, setFx] = useState<string>("checking…")

  useEffect(() => {
    const probe = document.createElement("canvas")
    const ctx = probe.getContext("2d") as (CanvasRenderingContext2D & {
      drawElementImage?: unknown
    }) | null
    const draw = typeof ctx?.drawElementImage === "function"
    const paint =
      typeof (probe as HTMLCanvasElement & { requestPaint?: unknown })
        .requestPaint === "function"
    setFx(
      supportsHtmlInCanvas()
        ? `active (drawElementImage:${draw} requestPaint:${paint})`
        : `off — drawElementImage:${draw} requestPaint:${paint}. enable chrome://flags/#canvas-draw-element`,
    )
  }, [])

  return (
    <details className="border border-edge bg-panel text-[11px] leading-relaxed tracking-wider text-muted">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        readme
      </summary>
      <div className="space-y-3 border-t border-edge px-3 py-3">
        <Section title="what this is">
          <p>
            // a message hidden inside ordinary text you wrote yourself. no
            invisible characters, no zero-width tricks, no case or spacing
            games. the output is plain text you can read, inspect and paste
            anywhere.
          </p>
        </Section>

        <Section title="the approach">
          <p>
            // this is coverless steganography: the carrier is never marked up
            to carry the secret. instead every word already says something about
            the message, through a keyed hash of the word itself. hiding means
            arranging for those statements to come out right.
          </p>
          <p>
            // the naive way is to demand that every word fit, which means
            rewriting most of a paragraph. instead the whole paragraph is
            treated as one codeword and only the minimum-weight correction is
            applied — matrix embedding, or syndrome coding, from Westfeld&apos;s
            F5 and Fridrich&apos;s later work. on a typical paragraph that is
            the difference between changing ~80% of your words and ~25%.
          </p>
          <p>
            // wet paper codes let you lock words you refuse to change — names,
            numbers, the phrase that carries your meaning. the solver simply
            never selects them, and the reader needs no knowledge of which words
            were locked. click any word in the map to lock it.
          </p>
        </Section>

        <Section title="what's novel here">
          <p>
            // the published coverless literature searches a giant corpus for a
            text that happens to fit, which caps capacity and fails
            unpredictably. here the human is the search: you write, and the app
            tells you the few words that must move.
          </p>
          <p>
            // word features are read four ways — the whole word, the gaps
            between its letters, its length-and-endpoints shape, and its
            prefix/suffix — so a word speaks about the payload from several
            independent angles.
          </p>
          <p>
            // the tokenizer deliberately throws away case, whitespace and
            punctuation, so a carrier survives being pasted through chat, mail
            or html unchanged. only word-level edits matter.
          </p>
        </Section>

        <Section title="robustness">
          <p>
            // the reader recomputes the same keyed clues and reassembles the
            payload. a 16-bit tag means a wrong passphrase fails loudly rather
            than returning plausible garbage.
          </p>
          <p>
            // note the tradeoff: matrix embedding indexes words by position, so
            unlike the earlier per-word scheme it does not shrug off deleted
            words. it buys a 3x reduction in edits with that robustness.
          </p>
        </Section>

        <Section title="limits, stated plainly">
          <ul className="space-y-1">
            <li>
              — a lab experiment, not a secure channel. the 16-bit tag rejects a
              wrong passphrase; it does not resist a determined attacker.
            </li>
            <li>
              — the passphrase is the only secret, and there is no per-message
              salt.
            </li>
            <li>
              — it hides a message inside ordinary text; it does not hide that
              the text might contain one.
            </li>
            <li>
              — the carrier must contain more unlocked words than the payload
              has bits (about 8 words per secret character).
            </li>
            <li>— everything runs in your browser; nothing is sent anywhere.</li>
          </ul>
        </Section>

        <Section title="page effect">
          <p>// html-in-canvas: {fx}</p>
        </Section>
      </div>
    </details>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        {title}
      </p>
      {children}
    </div>
  )
}
