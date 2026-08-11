/**
 * Per-word replacement picker.
 *
 * Auto-applying swaps produces shape-matched but semantically empty prose,
 * which is the honest ceiling for an offline solver with no language model.
 * So the useful workflow is: the app says WHICH words must change and offers
 * candidates that satisfy the constraint; the author picks the one that means
 * what they want.
 */
import { useEffect, useState } from "react"
import { deriveKeys, wordParity } from "../codec"
import { Panel } from "./primitives"

export function SwapPicker({
  word,
  passphrase,
  vocabulary,
  onPick,
  onClose,
}: {
  word: string
  passphrase: string
  vocabulary: readonly string[]
  onPick: (replacement: string) => void
  onClose: () => void
}) {
  const [candidates, setCandidates] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setCandidates(null)
    ;(async () => {
      const keys = await deriveKeys(passphrase)
      const want = 1 - (await wordParity(word, keys))
      const found: string[] = []
      // Prefer words of similar shape so the sentence keeps its rhythm, then
      // widen out. Bounded probes keep this instant.
      const tiers = [
        (w: string) => w[0] === word[0] && w.length === word.length,
        (w: string) => Math.abs(w.length - word.length) <= 1,
        () => true,
      ]
      for (const accept of tiers) {
        if (found.length >= 18) break
        let probes = 0
        for (const cand of vocabulary) {
          if (found.length >= 18 || probes++ > 6000) break
          if (cand === word || found.includes(cand)) continue
          if (!accept(cand)) continue
          if ((await wordParity(cand, keys)) !== want) continue
          found.push(cand)
        }
      }
      if (!cancelled) setCandidates(found)
    })()
    return () => {
      cancelled = true
    }
  }, [word, passphrase, vocabulary])

  return (
    <Panel
      title={`swap "${word}"`}
      right={
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-fg"
        >
          ✕
        </button>
      }
    >
      {candidates === null ? (
        <p className="text-[10px] tracking-wider text-muted">// searching…</p>
      ) : candidates.length === 0 ? (
        <p className="text-[10px] tracking-wider text-muted">
          // no candidate found
        </p>
      ) : (
        <>
          <p className="mb-2 text-[10px] leading-relaxed tracking-wider text-muted">
            // any of these satisfies the constraint — pick what you mean
          </p>
          <div className="flex flex-wrap gap-1">
            {candidates.map((c) => (
              <button
                key={c}
                onClick={() => onPick(c)}
                className="border border-edge bg-panel-2 px-1.5 py-0.5 text-xs normal-case text-fg-dim hover:border-accent hover:text-fg"
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
