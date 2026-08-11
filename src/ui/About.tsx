/** Honest "how it works / limits" panel. No overselling (spec §6). */
export function About() {
  return (
    <details className="rounded-lg border border-edge bg-panel p-4 text-sm text-muted">
      <summary className="cursor-pointer font-medium text-fg">
        How it works &amp; what it doesn’t
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">
        <p>
          Your carrier text isn’t modified to carry the secret — instead, each
          word’s keyed fingerprint already encodes one clue about the message.
          You write text where every word’s clue happens to fit (that’s what
          “green” means), guided by the live meter. The reader recomputes the
          same fingerprints with the shared passphrase and reassembles the
          message.
        </p>
        <p>
          Because each clue depends only on its own word, deleting or reordering
          words just drops clues — the rest still reconstruct the message, like
          a QR code with a torn corner.
        </p>
        <p className="text-fg/80">Limits, stated plainly:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            This is a lab experiment, not a secure channel. Authentication is a
            16-bit tag — good enough to reject a wrong passphrase, not to resist
            a determined attacker.
          </li>
          <li>
            The passphrase is the only secret. Anyone with it and this app can
            read the message. There is no per-message salt.
          </li>
          <li>
            It hides a message inside ordinary text; it does not hide that the
            text might contain one. Everything runs in your browser — nothing is
            sent anywhere.
          </li>
        </ul>
      </div>
    </details>
  )
}
