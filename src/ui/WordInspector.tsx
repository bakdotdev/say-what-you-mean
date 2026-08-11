/** Shows why a clicked carrier word is green or red: its keyed equation. */
import { useEffect, useState } from "react"
import {
  equationFromDigest,
  type Encoder,
  type Equation,
} from "../codec"
import { Tag } from "./primitives"

export function WordInspector({
  word,
  green,
  encoder,
  onClose,
}: {
  word: string
  green: boolean
  encoder: Encoder
  onClose: () => void
}) {
  const [equation, setEquation] = useState<Equation | null>(null)

  useEffect(() => {
    let cancelled = false
    encoder.digestFor(word).then((digest) => {
      if (!cancelled) setEquation(equationFromDigest(digest, encoder.B))
    })
    return () => {
      cancelled = true
    }
  }, [word, encoder])

  return (
    <div className="rounded-lg border border-edge bg-panel-2 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold">“{word}”</span>
          <Tag tone={green ? "green" : "red"}>{green ? "fits" : "does not fit"}</Tag>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-fg"
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>
      {equation ? (
        <div className="space-y-1 text-muted">
          <p>
            This word’s keyed fingerprint claims that payload bits{" "}
            <span className="font-mono text-fg">
              {equation.subset.join(", ")}
            </span>{" "}
            XOR to{" "}
            <span className="font-mono text-fg">{equation.parity}</span>.
          </p>
          <p>
            It’s <span className="text-fg">{green ? "green" : "red"}</span>{" "}
            because that {green ? "matches" : "contradicts"} the hidden message.
            {!green && " Replace it with a green word."}
          </p>
        </div>
      ) : (
        <p className="text-muted">Computing…</p>
      )}
    </div>
  )
}
