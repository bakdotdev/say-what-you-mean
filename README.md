# say-what-you-mean

Hide a short message inside ordinary text, using a shared passphrase.
Live at [lab.bak.dev/say-what-you-mean](https://lab.bak.dev/say-what-you-mean).

Two versions, two trade-offs:

**v1 — matrix embedding.** Every word already says something about the
message via a keyed hash of itself. The paragraph is treated as one codeword
and only the minimum-weight correction is applied (syndrome coding, after
Westfeld's F5 and Fridrich), so the fewest possible words change. Wet paper
codes let you lock words you refuse to change. You send only the text.

**v2 — text-bound keys.** The paragraph is never modified. A pad is derived
from the passphrase and the words themselves and solved directly for a key,
which is held in escrow and destroyed on first read. Your recipient needs
only the text and the passphrase.

## Layout

    src/codec/     protocol: tokenizer, KDF, equations, solver, matrix, bind
    src/ui/        views, live planning, highlighting
    api/           edge: AI word choice · node: key escrow (private Blob)

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:5231/say-what-you-mean/
pnpm test       # 73 tests
pnpm typecheck
```

## Notes

- Secrets are capped at 16 characters; the carrier must hold more words than
  the payload has bits.
- The tokenizer ignores case, whitespace and punctuation, so a carrier
  survives being pasted anywhere. Word-level edits are what matter.
- A lab experiment, not a secure channel: the tag rejects a wrong passphrase,
  it does not resist a determined attacker.
