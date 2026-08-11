/** Honest "how it works / limits" panel. No overselling (spec §6). */
export function About() {
  return (
    <details className="border border-edge bg-panel text-[11px] leading-relaxed tracking-wider text-muted">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        readme
      </summary>
      <div className="space-y-2 border-t border-edge px-3 py-3">
        <p>
          // your carrier text is never modified to carry the secret. each
          word&apos;s keyed fingerprint already encodes one clue about the
          message; you write text whose words happen to fit, guided by the live
          map. the reader recomputes the same fingerprints with the shared
          passphrase and reassembles the payload.
        </p>
        <p>
          // each clue depends only on its own word, so deleting or reordering
          words just drops clues — the rest still reconstruct the message, like
          a QR code with a torn corner.
        </p>
        <p className="text-fg-dim">// limits</p>
        <ul className="space-y-1">
          <li>
            — lab experiment, not a secure channel. authentication is a 16-bit
            tag: enough to reject a wrong passphrase, not to resist a determined
            attacker.
          </li>
          <li>
            — the passphrase is the only secret; there is no per-message salt.
          </li>
          <li>
            — hides a message inside ordinary text; does not hide that the text
            might contain one. everything runs locally — nothing is sent
            anywhere.
          </li>
        </ul>
      </div>
    </details>
  )
}
