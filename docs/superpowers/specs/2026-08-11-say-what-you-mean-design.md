# Say What You Mean — Design Spec

**Date:** 2026-08-11
**Status:** Draft for review
**URL:** `lab.bak.dev/say-what-you-mean`

## 1. What it is

A client-side web app that hides a short secret message (max 16 characters)
inside an ordinary paragraph that a human writes. The output is plain,
inspectable text — the author's exact words, no hidden characters, no case
tricks, no spacing tricks. A recipient with the shared passphrase pastes the
paragraph into the app and recovers the secret. Like a QR code, the secret
survives when words are deleted or altered in transit.

The technique is **coverless steganography via guided composition**: the
secret is never embedded *into* text — instead, the app guides the author to
write text whose inherent word-relationship features, read through a keyed
hash, spell out the encrypted secret.

### Design lineage

- Coverless text steganography (features of unmodified text carry bits) —
  academic school with known weaknesses: low capacity, corpus dependence,
  unstable hiding success. This design replaces the corpus search with a
  human writing under live feedback, which fixes all three.
- Cardan grille (1550): a shared key selects which parts of an innocent,
  human-composed text carry the message. Same idea; our "grille" is a set of
  keyed hashes over per-word features, and content-addressing makes it
  deletion-proof.
- Robust watermarking: position-invariant features + erasure coding is the
  standard recipe for surviving edits. A simulation (300 trials/row) showed
  position-addressed schemes lose ~40% of an 8-char secret after ONE word
  deletion, while content-addressed recovery stays at 100% through 16
  deletions.

## 2. Goals and non-goals

Goals:

- Hide ≤16 characters in human-written text; recover with shared passphrase.
- Output is 100% the author's words. Copy-pastable everywhere; survives any
  transport (case, whitespace, and punctuation changes do not matter — see
  tokenization).
- QR-like resilience: secret survives deletion/alteration of several words.
- Fully self-contained: no AI, no server calls, no network at runtime. The
  secret and passphrase never leave the browser.
- Live feedback while writing: per-word green/red, embed-progress meter that
  becomes a durability meter past 100%.
- Wrong passphrase or unrecoverable text fails loudly — never emits garbage.

Non-goals:

- Long secrets (hard cap 16 chars — capacity is the fundamental constraint
  of every coverless scheme).
- Hiding the *existence* of a message from a determined stylometric analysis
  (out of scope for v1; the text is natural human writing, so there is no
  embedding artifact to detect, but we make no formal claims).
- Key exchange (passphrase is shared out of band).
- High-stakes cryptographic assurance (16-bit MAC; see §6 Security notes).

## 3. Encoding scheme

### 3.1 Secret alphabet

6-bit symbols, 64-entry table: `A–Z`, `0–9`, space, and common punctuation
(`. , ' ? ! - : / @ & #`, remainder reserved). Case-insensitive. Length 1–16.

### 3.2 Payload

```
payload  = len(4 bits, stores N-1) | secret(6N bits) | mac(16 bits)
bits B   = 20 + 6N            (26..116 bits for N = 1..16)
```

- `mac` = HMAC-SHA-256(k_mac, len | secret) truncated to 16 bits.
- `len | secret` is XORed with a keystream derived from `k_stream`
  (SIV-flavored: MAC computed over plaintext, transmitted in clear — a
  16-bit truncated MAC of an encrypted payload reveals nothing useful).
- The decoder does not know N; it tries all 16 values and accepts the one
  whose MAC verifies. (16 cheap attempts; MAC filters.)

### 3.3 Key derivation

```
master  = PBKDF2-SHA-256(passphrase, salt = APP_CONSTANT, 300k iters)
k_addr, k_stream, k_mac = HKDF(master, labeled)
```

Fixed app-constant salt is a deliberate tradeoff: nothing can be transmitted
besides the carrier text, so there is nowhere to put a per-message salt.
Mitigated by iteration count and the app-specific constant. All via Web
Crypto; constants frozen as protocol v1.

### 3.4 The carrier channel: keyed multi-method equations

Tokenize the carrier (§3.6). Each word emits one equation per ACTIVE feature
method:

```
for each active feature f of word w:
  h = HMAC(k_addr, f)
  equation: XOR of payload bits in subset(h) == parity(h)
```

**Feature methods** (ordered; density k activates the first k):

1. `identity` — the whole word
2. `letterRelations` — gaps between consecutive letters mod 26 (the original
   "character relationships" idea, generalized and keyed)
3. `shape` — length plus first/last letter
4. `affixes` — first-3 and last-3 letters

**Density slider.** A word is usable ("green") only if it satisfies **all**
active methods. More methods = more equations per word = shorter carrier, but
fewer usable words. Measured on the real 10k wordlist (B=74):

| Density | Usable words | Carrier needed |
|---|---|---|
| 1 | ~50% | ~340 words |
| 2 | ~25% | ~170 words |
| 4 | ~6.5% | ~93 words |

**Why all-or-nothing per word, not a fuzzy threshold.** An earlier design let a
word count if it satisfied e.g. 75% of its methods, mixing satisfied and
unsatisfied equations. That silently corrupts the linear system: false
equations are errors, not erasures, and the solver converges confidently to
the wrong payload (measured: 33/116 bits wrong). Requiring every active method
to hold guarantees each equation the decoder sees is true, so word loss stays a
clean erasure.

**Why equations, not votes.** A scheme where each word casts a fixed "vote"
(`value = hash(word)`) carries no information: the value isn't selectable, so
each bit receives ~50/50 coin flips and the tally converges to noise
(verified — 0/20 trials decoded). Information requires a *choice*; the writer's
choice is which words to keep.

### 3.5 Decoding

The receiver knows neither the secret length N nor the density used, so it
searches both (4 x 16 = 64 cheap attempts; the MAC arbitrates).

1. Tokenize; compute every word's equations at the candidate density.
2. Deduplicate. If two equations over the same bit-subset disagree, the
   candidate density is wrong — reject it before any linear algebra.
3. Solve by **peeling** (belief propagation): repeatedly apply degree-1
   equations, substituting solved bits back. If peeling stalls with bits
   still coupled, finish with Gaussian elimination on the residual system
   (B ≤ 116 — trivial). Undetermined bits remain null (erasures).
4. For N = 1..16: derive keystream, decrypt, verify MAC. On success, show
   the secret plus diagnostics (words seen, equations used, bits recovered).
   Otherwise: explicit failure ("wrong passphrase or too damaged").

### 3.6 Tokenization (protocol-critical)

- Unicode NFKC → lowercase → smart quotes normalized to `'`.
- Words = maximal runs of `[a-z0-9']`; everything else is a separator and
  **ignored entirely**.
- Consequence: case changes, whitespace collapse, punctuation edits, and
  reflowing in transit are all no-ops. Only word-level edits matter, and
  those are what the erasure code absorbs.

### 3.7 Robustness model

- **Word deleted** → its equations vanish (clean erasures). Nothing shifts and
  no false equation is manufactured, because each equation depends only on its
  own word.
- **Word altered** → same as delete-plus-insert; strictly local.
- **Sentence/paragraph reordered** → equations are position-free; unaffected.
- **Draft-time edits** → the app re-encodes live on every keystroke; an edit
  only re-evaluates the touched word (content addressing makes live re-encode
  cheap).
- **Higher density costs resilience per word**: deleting a word now removes
  `density` equations rather than one. Resilience comes from writing past the
  minimum, which the durability meter reports directly.
- **Durability meter**: writing past minimal solvability adds redundant
  equations. The meter reports estimated survivable deletions (quick local
  Monte Carlo over the actual equation set), so fragility is visible, never
  a surprise.

### 3.8 Capacity / effort (honest numbers)

Measured via `scratchpad/codec-sim.mjs` (LT peeling, ~25% word reuse, 40
trials). Real numbers, not idealized:

| Secret length | Payload bits | Carrier to solve (avg / range) | Deletions survived at +60% redundancy |
|---|---|---|---|
| 9 chars  | 74  | ~173 words (120–240) | ~39 |
| 16 chars | 116 | ~314 words (190–540) | ~74 |

Honest takeaway surfaced in the UI: roughly **15–20 words of carrier per
secret character**, so a short secret is ~2–3 paragraphs and a full 16-char
secret is a long page. The live meter means the writer always knows exactly
where they stand; no fixed number is promised up front. Guidance toward
fresh (unseen) green words via the stuck-helper raises the effective unique
fraction and lowers these counts in practice.

## 4. Application

### 4.0 Wordlist

`public/wordlist.txt` is the Google 10k English list (frequency-ordered,
Unlicense/public domain), ~9,963 words. The stuck-helper digests only the most
common 2,500 (4 HMACs each) to keep the main thread responsive; the codec
itself accepts any word the author types.

### 4.1 UI

Two views:

**Hide**
- Secret input (16-char max, alphabet-filtered, live symbol count).
- Passphrase input.
- Carrier editor: per-word green/red coloring as you type; red words keep
  their text but visibly need replacing. Editing any word re-evaluates
  locally, live.
- Progress meter → durability meter past 100% ("decodable; survives ~6
  deleted words").
- Stuck-helper: suggests a handful of natural green continuations from a
  shipped common-word list (~10k words; plain data, filtered by the same
  hash — grep, not AI).
- "Why is this word green?" inspector: click a word, see the bigram, its
  hash fingerprint, and the equation it asserts — the cipher's mental model
  made visible.
- Copy button (copies plain text only).

**Reveal**
- Paste box + passphrase → secret, or explicit failure.
- Diagnostics panel: words seen, equations recovered, erasures healed,
  conflicts outvoted.

### 4.2 Architecture

- **Codec package** (`src/codec/`): pure TypeScript, zero DOM dependencies —
  tokenizer, key derivation, equation generation, GF(2) solver, encoder
  state (coverage/durability), decoder. Every function pure; immutable
  state. This package is the protocol.
- **UI** (`src/app/`): React 19 + Vite + Tailwind v4 + `@bakdotdev/qui`
  components. SPA, static build, `base: /say-what-you-mean/`.
- No runtime network access. Works offline once loaded.

### 4.3 Testing (per repo standards: 80%+ coverage)

- Unit: tokenizer goldens (smart quotes, unicode, punctuation soup), key
  derivation vectors, GF(2) solver, alphabet round-trips.
- Property: encode→decode round-trip over random secrets/passphrases/
  carriers; decode-with-wrong-passphrase always fails; MAC never passes on
  corrupted payload (statistical).
- Robustness: port of the deletion simulation as a test — recovery rate vs.
  deletions must match the durability meter's claims within tolerance.
- E2E (Playwright): hide → copy → paste in Reveal → recover; wrong
  passphrase failure path; the paragraph-through-Slack-normalization case
  (simulated whitespace/punctuation mangling).

## 5. Deployment: lab.bak.dev

Per-experiment projects behind a thin shell (chosen over a monolith):

- **`lab-bak-dev`** (new Vercel project, scope `quist`): owns domain
  `lab.bak.dev`. Static index page listing experiments + `vercel.json`
  rewrites: `/say-what-you-mean(/.*)` → the experiment project's deployment.
- **`say-what-you-mean`** (new Vercel project): this app, served under
  `/say-what-you-mean` base path.
- DNS: `bak.dev` already registered on Vercel with Vercel nameservers —
  adding the `lab` subdomain to the shell project is automatic.
- Both directories live as siblings under `~/Sites/bakdotdev/`, matching
  existing repo layout (`dev-tools/`, `qui/`).

## 6. Security notes (stated plainly)

- 16-bit MAC ⇒ 1/65,536 false-accept per candidate; N brute-force and
  erasure-guessing multiply candidates (≤ 16 × 256), keeping false-accept
  odds ≈ 1/16. Acceptable for a lab experiment; not for life-and-death use.
  UI copy must not oversell it.
- Static KDF salt ⇒ identical passphrases across users derive identical
  keys. Documented; passphrase strength guidance in UI.
- The carrier is genuine human text with no embedding artifacts, but an
  adversary who *suspects* the app and has the passphrase can decode —
  security of content rests on the passphrase, existence-hiding on the
  text's ordinariness.

## 7. Open questions deferred to implementation

- Exact LT degree distribution and conflict-resolution policy (tuned via
  the simulation harness; spec requires only: ~1 bit/word density, graceful
  degradation matching §3.8 table within ±20%).
- Wordlist selection for the stuck-helper (any permissively-licensed 10k
  common-words list).
- Lab shell index design (minimal; one page, links to experiments).
