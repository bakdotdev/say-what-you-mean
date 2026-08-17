# say-what-you-mean

Hide a short message inside ordinary English text, recoverable with a shared
passphrase. Three schemes, three very different trade-offs.

Live at **[lab.bak.dev/say-what-you-mean](https://lab.bak.dev/say-what-you-mean)**.

A lab experiment, not a secure channel. It is a study of a real question —
*how do you hide information in text without hidden characters, case tricks or
spacing tricks?* — and the three answers here fail in interestingly different
ways.

---

## The constraint

Everything follows from one rule: **the carrier must be plain, inspectable
text**. No zero-width characters, no capitalisation games, no double spaces,
nothing that survives only until someone pastes it into a plain-text field.

That rules out the entire family of "invisible" steganography and forces the
information into the *choice of words* themselves. From there, three routes:

| | how it hides | carrier length | survives edits | needs |
|---|---|---|---|---|
| **v1** | word choice, keyed hashes | ~750 words | **yes** — 60 deletions tested | nothing but the text |
| **v2** | text is a key factor, not the ciphertext | any length, unmodified | no (word edits) | one-time escrow read |
| **v3** | the secret drives the model's sampling | **~20 words** | no | 145 MB model, both ends |

---

## v1 — matrix embedding over keyed word hashes

**Technology:** Web Crypto (PBKDF2-SHA256, 300k iterations → HKDF → HMAC-SHA256),
GF(2) linear algebra, syndrome coding, fountain/LT codes.

Every word already says something about the message, whether you meant it to or
not. `HMAC(key, word)` turns each word into an equation over the payload bits.
The paragraph is treated as one long codeword, and the encoder solves for the
*minimum-weight correction* — the fewest words that must change to make all the
equations hold. This is syndrome coding, after Westfeld's F5 and Fridrich's work
on matrix embedding. On a real 117-word paragraph it cut the required changes
from 92 words to 30.

Two modes:

- **compact** — matrix embedding. Shortest carrier, but position-dependent: the
  syndrome depends on every word in order, so any edit breaks it.
- **durable** — per-word embedding with a fountain code. Each word's clue depends
  only on itself, so a deleted word is a clean *erasure* rather than a
  corruption, and the code reconstructs the rest. This is the QR-code property,
  and it is the reason durable mode exists. Verified surviving 60 deleted words.

**Wet paper codes** let you lock words you refuse to change; the encoder routes
around them and the decoder never needs to know which were locked.

Function words (`the`, `and`, `of` — 310 of them) never carry, because you
cannot swap `the` for a synonym. Constraining them would fight the writer and
buy nothing.

The honest limitation: durable mode needs ~55–90 *distinct* fitting carrier
words, and ordinary prose yields about one per ten words. Hence ~750 words for a
9-character secret, of which roughly one in eight is chosen by constraint rather
than meaning. That is the flaw v3 exists to fix.

## v2 — text-bound keys

**Technology:** HKDF, Vercel Blob (private), burn-after-reading escrow.

The paragraph is **never modified — not one word**. It is not the ciphertext
here; it is one of three factors needed to read the message.

    pad    = HKDF(passphrase, digest(words))
    key    = secret XOR pad
    secret = key XOR pad

The key is meaningless without that exact paragraph, and the paragraph is
meaningless without the key *and* the passphrase. The encrypted result goes to a
private blob store under an un-invertible id derived from passphrase + carrier,
and is destroyed the first time it is read.

This is a binding / second-factor scheme, not concealment of the message's
existence — the content rides in the key, not in the text.

## v3 — perturbed sampling (the secret writes the message)

**Technology:** transformers.js + onnxruntime-web, SmolLM2-135M-Instruct
(quantized, in-browser), Huffman coding over the next-token distribution.

v1 writes a paragraph and then swaps words until the maths works. v3 inverts
that. At each step the language model gives a probability distribution over next
tokens, and bits of the secret choose which one to emit. Every token is one the
model would plausibly have produced, so **the text is fluent by construction and
nothing is ever repaired**.

Decoding replays the same distributions over the received text and reads back
which choice was made at each step.

    "Just so you know, my little coworker has been tasked to be at
     home a while now! She's got a packed day of work"
     → DOCK AT 9

24 words, zero substituted, versus ~750 mangled words in v1.

Selection is **Huffman-coded** over the top 32 candidates rather than flat.
Choosing uniformly spent as many bits on the likeliest token as the 16th
likeliest, so half of all choices were improbable ones and it read like it
(*"Duct Tube Cleaners are very"*). Weighting by probability fixed both the prose
and the bits per token.

Three properties this rests on, each measured before being relied on:

- **Determinism** — the decoder must see the encoder's *exact* distribution.
  Logits are bitwise identical run to run (drift 0). This is why the model runs
  locally: no API guarantees reproducible distributions, and Anthropic exposes no
  logprobs at all. The execution backend is pinned to WASM, because providers do
  not agree bit-for-bit and two browsers that chose differently could not read
  each other's messages.
- **Retokenization** — the receiver holds *text* and must re-encode it to the
  same token ids. Tokens whose printed form does not re-encode to themselves are
  excluded; one of them desynchronises everything after it.
- **Capacity** — ~4.4 bits of entropy per token, so a 74-bit payload fits in
  ~19 tokens.

The trade is stark and deliberate: v3 is position-dependent and survives **no**
edits, where v1 survives sixty deletions.

---

## Payload format

Shared by all three schemes:

    len(4 bits = N-1) | secret(6N bits) | mac(16 bits)     B = 20 + 6N

`len | secret` is XORed with a keystream from HKDF; the MAC authenticates the
*plaintext*, so a wrong passphrase fails loudly instead of returning garbage.
Secrets are up to 16 characters from a 64-symbol alphabet.

## Stack

React 19 · TypeScript · Vite · Tailwind v4 · Vitest · Vercel.
Crypto is Web Crypto throughout — no crypto libraries.

## Layout

    src/codec/     protocol: tokenizer, KDF, equations, GF(2) solver,
                   matrix embedding, text-binding, token sampling
    src/ui/        views, live planning, word highlighting
    src/lab/       measurement harnesses — not shipped, not in the test run
    api/           AI word choice (edge) · key escrow (node, private Blob)
    scripts/       wordlist cleaning, origin-trial injection, build plugins

`src/lab/` is where the claims in this README were measured. Those files call
live models and cost money, so they are gated behind env vars and skipped by
default.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:5231/say-what-you-mean/
pnpm test       # 107 tests
pnpm build
```

v3's round-trip tests download a 145 MB model, so they are opt-in:

```bash
V3_TESTS=1 pnpm test src/codec/tokens.test.ts
```

## What it costs to run

The app serves **242 kB** from its own origin. v3's model weights (~145 MB) come
from the Hugging Face CDN and the onnxruntime WASM (~4.6 MB) from jsDelivr —
both on their bandwidth, both cached by the browser afterwards. v3 costs the
user a first-load wait, not the host egress.

## Limits

- A lab experiment, not a secure channel. It has had no adversarial review.
- Up to 16 characters of secret.
- Case, spacing and punctuation survive; word edits do not (except v1 durable).
- The passphrase never leaves your browser. v1 and v3 do all crypto client-side;
  v2's escrow holds the encrypted message and never the passphrase.
- v1's AI helpers send the *carrier text* to a model to pick natural-sounding
  replacements. They never send the secret or the passphrase.

## Licence

MIT
