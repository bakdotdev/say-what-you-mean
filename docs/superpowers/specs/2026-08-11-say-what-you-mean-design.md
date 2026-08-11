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
  human-composed text carry the message. Same idea; our "grille" is a keyed
  hash over word bigrams, and content-addressing makes it deletion-proof.
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

### 3.4 The carrier channel: keyed word-bigram equations

Tokenize the carrier (§3.6). Each consecutive word pair emits one equation
about the payload bits:

```
h = HMAC(k_addr, prev_word | word)
equation: XOR of payload bits in subset(h)  ==  parity(h)
```

- `subset(h)`: a sparse, h-seeded subset of the B payload bit indices
  (LT/fountain-style, low degree 1–3; exact degree distribution tuned in
  implementation via the simulation harness).
- `parity(h)`: one bit derived from h.
- The first word pairs with a fixed sentinel `^`.

Every bigram in the text asserts one equation. **Roughly half of all
candidate next-words yield a true equation** — the author's job, guided by
live feedback, is to only keep words that light green. Repeated words get
fresh 50/50 odds at each position because the address includes the preceding
word (no globally "banned" common words).

This is the character-relationship cipher, systematized: the hash digests
every letter of the word pair, so any change to the relationship changes the
equation; and each equation identifies *which* payload bits it speaks about
by content, never by position.

### 3.5 Decoding

1. Tokenize; compute every bigram's equation.
2. Deduplicate identical equations; resolve conflicts by vote count
   (false equations arise only from deletion-bridged bigrams and are rare).
3. Solve the GF(2) linear system (B ≤ 116 — Gaussian elimination is
   trivial). If a small number of bits are undetermined (≤ ~8 erasures),
   try all completions and let the MAC arbitrate.
4. For N = 1..16: derive keystream, decrypt, verify MAC. On success, show
   the secret plus diagnostics (equations used, erasures healed, conflicts
   dropped). Otherwise: explicit failure ("wrong passphrase or too damaged").

### 3.6 Tokenization (protocol-critical)

- Unicode NFKC → lowercase → smart quotes normalized to `'`.
- Words = maximal runs of `[a-z0-9']`; everything else is a separator and
  **ignored entirely**.
- Consequence: case changes, whitespace collapse, punctuation edits, and
  reflowing in transit are all no-ops. Only word-level edits matter, and
  those are what the erasure code absorbs.

### 3.7 Robustness model

- **Word deleted** → its two bigram equations vanish (erasures); the bigram
  bridging the gap contributes one possibly-false equation (outvoted).
  Damage is local — nothing shifts.
- **Word altered** → same as delete-plus-insert; local.
- **Sentence/paragraph reordered** → equations are position-free; only the
  two boundary bigrams are affected.
- **Draft-time edits** → the app re-encodes live on every keystroke; an edit
  only re-evaluates the touched word's two bigrams (content addressing makes
  live re-encode cheap).
- **Durability meter**: writing past minimal solvability adds redundant
  equations. The meter reports estimated survivable deletions (quick local
  Monte Carlo over the actual equation set), so fragility is visible, never
  a surprise.

### 3.8 Capacity / effort (honest numbers)

~1 bit per word before redundancy; solvability needs ~1.1–1.3× B equations.

| Secret length | Payload bits | Carrier (minimum) | Carrier (comfortable durability) |
|---|---|---|---|
| 4 chars  | 44  | ~55 words  | ~90 words |
| 8 chars  | 68  | ~85 words  | ~140 words |
| 16 chars | 116 | ~145 words | ~230 words |

Rule of thumb surfaced in the UI: **~10–15 words of carrier per secret
character.** These estimates are validated and refined by the simulation
harness during implementation.

## 4. Application

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
