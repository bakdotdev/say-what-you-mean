# Say What You Mean — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a client-side coverless-steganography web app at `lab.bak.dev/say-what-you-mean` that hides a ≤16-char secret in human-written text via keyed word-bigram equations, recoverable with a shared passphrase and resilient to word-level edits.

**Architecture:** A pure-TypeScript `codec` package implements the protocol (tokenize → derive keys → generate GF(2) equations from word bigrams → solve/encode/decode). A React SPA wraps it with a live-feedback Hide editor and a Reveal decoder. Deployed as its own Vercel project behind a thin `lab-bak-dev` shell that owns the domain and rewrites `/say-what-you-mean` to it.

**Tech Stack:** TypeScript, Vite, React 19, Tailwind v4, Web Crypto (subtle), Vitest (unit/property), Playwright (E2E), Vercel.

## Global Constraints

- Node 24.x, pnpm 10.x (matches host toolchain).
- No runtime network access in the app. Secret + passphrase never leave the browser. No AI, no server codec.
- Secret: 1–16 symbols from the 64-entry alphabet (§ codec/alphabet). Case-insensitive.
- Protocol constants are frozen as **v1**: PBKDF2 300k iters, SHA-256, fixed app-salt string `swym-v1`, HKDF labels `addr`/`stream`/`mac`, 16-bit MAC, 4-bit length field (stores N−1), LT degree distribution defined in Task 5.
- Tokenizer contract (§ codec/tokenize) is protocol-critical: NFKC → lowercase → smart-quote normalize → words = `[a-z0-9']+`, all else ignored. Changing it breaks compatibility.
- All codec functions pure and immutable (repo coding-style rule). No `console.log` in shipped code.
- App served under base path `/say-what-you-mean/`.
- Vercel scope: `quist`.
- Test coverage target 80%+.

---

## Track A — Infrastructure (do first; unblocks live verification)

### Task A1: Lab shell project + domain

**Files:**
- Create: `~/Sites/bakdotdev/lab-bak-dev/package.json`
- Create: `~/Sites/bakdotdev/lab-bak-dev/index.html`
- Create: `~/Sites/bakdotdev/lab-bak-dev/vercel.json`
- Create: `~/Sites/bakdotdev/lab-bak-dev/public/` (static assets)

**Interfaces:**
- Produces: a deployed Vercel project `lab-bak-dev` serving `lab.bak.dev`, with a rewrite `/say-what-you-mean/:path*` → the experiment project. (Rewrite destination filled in Task A2 once the experiment project URL/domain exists.)

- [ ] **Step 1:** Create `lab-bak-dev/` as a static site. `index.html` = minimal dark page listing experiments, linking to `/say-what-you-mean`. `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "rewrites": [
    { "source": "/say-what-you-mean", "destination": "https://say-what-you-mean.vercel.app/say-what-you-mean" },
    { "source": "/say-what-you-mean/:path*", "destination": "https://say-what-you-mean.vercel.app/say-what-you-mean/:path*" }
  ]
}
```

- [ ] **Step 2:** `git init`, commit.
- [ ] **Step 3:** Link + deploy: `vercel link --scope quist --yes` (project name `lab-bak-dev`), `vercel deploy --prod --yes`.
- [ ] **Step 4:** Attach domain: `vercel domains add lab.bak.dev lab-bak-dev --scope quist` (bak.dev is on Vercel nameservers, so DNS auto-provisions). Verify `curl -sI https://lab.bak.dev` returns 200.
- [ ] **Step 5:** Commit any config changes.

Note: the rewrite destination in Step 1 is provisional. After Task A2 assigns the experiment its production URL, return here and set the exact destination host, then redeploy the shell.

### Task A2: Experiment project scaffold + Vercel wiring

**Files:**
- Create: `~/Sites/bakdotdev/say-what-you-mean/package.json`
- Create: `~/Sites/bakdotdev/say-what-you-mean/vite.config.ts`
- Create: `~/Sites/bakdotdev/say-what-you-mean/tsconfig.json`
- Create: `~/Sites/bakdotdev/say-what-you-mean/index.html`
- Create: `~/Sites/bakdotdev/say-what-you-mean/src/main.tsx`
- Create: `~/Sites/bakdotdev/say-what-you-mean/src/App.tsx`
- Create: `~/Sites/bakdotdev/say-what-you-mean/.gitignore`

**Interfaces:**
- Produces: a Vite React app that builds to `dist/` with `base: '/say-what-you-mean/'`; deployable Vercel project `say-what-you-mean`.

- [ ] **Step 1:** `pnpm init`; install deps:

```bash
pnpm add react@^19 react-dom@^19
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vitest @vitest/coverage-v8 jsdom @playwright/test
```

- [ ] **Step 2:** `vite.config.ts` sets `base: '/say-what-you-mean/'`, plugins `[react(), tailwindcss()]`, and Vitest config (`environment: 'jsdom'`, `globals: true`, coverage provider `v8`).
- [ ] **Step 3:** `tsconfig.json` mirrors qui's (ES2022, strict, bundler resolution, `@/*` → `src/*`, jsx react-jsx).
- [ ] **Step 4:** Minimal `App.tsx` renders "Say What You Mean" heading. `main.tsx` mounts it; import Tailwind css.
- [ ] **Step 5:** Verify `pnpm build` succeeds and `pnpm vitest run` runs (0 tests OK). Commit.
- [ ] **Step 6:** `vercel link --scope quist --yes` (name `say-what-you-mean`), `vercel deploy --prod --yes`. Capture the production URL.
- [ ] **Step 7:** Return to Task A1 Step 1, set the rewrite destination to the captured host, redeploy shell. Verify `curl -sI https://lab.bak.dev/say-what-you-mean` returns 200 and serves the app.

---

## Track B — Codec (the protocol; pure TS, no DOM)

All codec files live in `src/codec/`. Tests in `src/codec/*.test.ts`. Vitest.

### Task B1: Alphabet (6-bit symbol table)

**Files:**
- Create: `src/codec/alphabet.ts`
- Test: `src/codec/alphabet.test.ts`

**Interfaces:**
- Produces:
  - `ALPHABET: string` (exactly 64 chars, index 0..63)
  - `encodeSymbols(secret: string): number[]` — normalizes (uppercase, map unknown→drop with throw if any remain) and returns 6-bit codes; throws `RangeError` if length not in 1..16.
  - `decodeSymbols(codes: number[]): string`

- [ ] **Step 1:** Write failing tests: round-trip `"MEET AT 8"` → codes → string equals normalized input; length 0 and 17 throw; unknown char (`~`) throws; `ALPHABET.length === 64` and all-unique.
- [ ] **Step 2:** Run `pnpm vitest run src/codec/alphabet.test.ts` — expect fail.
- [ ] **Step 3:** Implement. `ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,'?!-:/@&#"` padded/trimmed to 64 with reserved fillers (document each index; assert length 64 at module load).
- [ ] **Step 4:** Run tests — expect pass.
- [ ] **Step 5:** Commit `feat(codec): 6-bit symbol alphabet`.

### Task B2: Tokenizer

**Files:**
- Create: `src/codec/tokenize.ts`
- Test: `src/codec/tokenize.test.ts`

**Interfaces:**
- Produces: `tokenize(text: string): string[]` — NFKC, lowercase, smart quotes (`'` `'` `` ` ``) → `'`, then split on `/[^a-z0-9']+/`, drop empties.

- [ ] **Step 1:** Failing tests (goldens): `"The cow, ate!"` → `["the","cow","ate"]`; smart-quote `"it's"` variants all → `["it's"]`; NFKC width/accents fold; whitespace runs collapse; punctuation-only → `[]`; a paragraph reflowed with different spacing/case → identical token array.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement using `String.prototype.normalize('NFKC')` and a single regex.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(codec): protocol tokenizer`.

### Task B3: Key derivation (Web Crypto)

**Files:**
- Create: `src/codec/keys.ts`
- Test: `src/codec/keys.test.ts`

**Interfaces:**
- Consumes: Web Crypto `crypto.subtle` (available in jsdom 24 / Node 24).
- Produces:
  - `deriveKeys(passphrase: string): Promise<{ addr: CryptoKey; stream: Uint8Array; mac: CryptoKey }>` — PBKDF2-SHA-256, 300k iters, salt `TextEncoder("swym-v1")`; then HKDF-SHA-256 expand to three 32-byte outputs labeled `addr`/`stream`/`mac`. `addr` and `mac` imported as HMAC `CryptoKey`s; `stream` kept as raw 32 bytes.
  - `hmac(key: CryptoKey, data: Uint8Array): Promise<Uint8Array>` — HMAC-SHA-256, 32 bytes.

- [ ] **Step 1:** Failing tests: same passphrase → identical bytes (determinism, compare `mac` output over fixed data); different passphrase → different; `hmac` length 32; known-answer vector captured on first run then frozen as a constant in the test.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement with `subtle.importKey('raw', …, 'PBKDF2')`, `subtle.deriveBits`, HKDF via `subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info})`.
- [ ] **Step 4:** Run — pass. Freeze the known-answer vector.
- [ ] **Step 5:** Commit `feat(codec): PBKDF2+HKDF key derivation`.

### Task B4: Payload assembly

**Files:**
- Create: `src/codec/payload.ts`
- Test: `src/codec/payload.test.ts`

**Interfaces:**
- Consumes: `encodeSymbols`/`decodeSymbols` (B1), `hmac` + keys (B3).
- Produces:
  - `buildPayload(secret: string, keys): Promise<boolean[]>` — bit array length `20 + 6N`: `len(4)=N-1 | secret(6N) | mac(16)`; the `len|secret` portion XORed with keystream from `keys.stream` (HKDF-CTR expand to needed length); `mac` = first 16 bits of `HMAC(keys.mac, len|secret plaintext bytes)`.
  - `parsePayload(bits: boolean[], keys): Promise<{ secret: string } | null>` — inverse; returns null if MAC fails.
  - `payloadBitLength(n: number): number` → `20 + 6*n`.

- [ ] **Step 1:** Failing tests: `buildPayload` then `parsePayload` round-trips for N=1,8,16; flipping any single payload bit makes `parsePayload` return null (statistical: sample 50 flips); wrong keys → null.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement. Keystream: HMAC-CTR over `keys.stream` (import as HMAC key, hash counter blocks) to produce enough bits.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(codec): payload assembly with MAC + keystream`.

### Task B5: Equation generation (keyed bigrams)

**Files:**
- Create: `src/codec/equations.ts`
- Test: `src/codec/equations.test.ts`

**Interfaces:**
- Consumes: `tokenize` (B2), `hmac` + `addr` key (B3).
- Produces:
  - `type Equation = { subset: number[]; parity: boolean }`
  - `wordEquations(tokens: string[], addr: CryptoKey, B: number): Promise<Equation[]>` — for each adjacent pair (with leading sentinel `"^"`), `h = hmac(addr, prevWord + "\x00" + word + "\x00" + B)`; derive degree d∈{1,2,3} from `h[0] % 3` mapped `[1,2,3]` weighted (use `h[0]` low bits: 0,1,2,3→1; 4,5→2; 6,7→3 pattern documented); pick `d` distinct indices in `[0,B)` from subsequent bytes of `h`; `parity = bit0 of h[last]`.
  - `singleBitFor(prevWord, word, addr, B): Promise<{ index: number; value: boolean }>` — the degree-1 fast path used by the live editor to color a word green/red against a *target* bit (green if the equation it would add is consistent with current solve). (Editor uses the full `Equation`; this helper documents the "does this word help" check.)

- [ ] **Step 1:** Failing tests: determinism (same inputs → same Equation); subset indices in range and distinct; degree distribution over 1000 random pairs roughly matches design weights (assert each degree present, degree-1 is plurality); sentinel used for first token.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(codec): keyed word-bigram equations`.

### Task B6: GF(2) solver

**Files:**
- Create: `src/codec/gf2.ts`
- Test: `src/codec/gf2.test.ts`

**Interfaces:**
- Produces:
  - `solve(equations: Equation[], B: number): { bits: (boolean|null)[]; conflicts: number }` — Gaussian elimination over GF(2). `bits[i]=null` = undetermined (erasure). `conflicts` = equations dropped for contradicting an already-forced value (used for tamper signal).

- [ ] **Step 1:** Failing tests: fully-determined system recovers a known bit vector; over-determined consistent system still recovers + `conflicts===0`; one contradictory equation → `conflicts>=1` and the majority solution survives; under-determined leaves nulls.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement (row-reduce; represent rows as `Set<number>` or bit arrays over B≤116).
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(codec): GF(2) linear solver`.

### Task B7: Encoder (coverage + durability)

**Files:**
- Create: `src/codec/encoder.ts`
- Test: `src/codec/encoder.test.ts`

**Interfaces:**
- Consumes: B2–B6.
- Produces:
  - `createEncoder(secret: string, passphrase: string): Promise<Encoder>`
  - `Encoder.evaluate(text: string): Promise<EncodeState>` where `EncodeState = { B: number; wordFlags: boolean[]; determinedBits: number; solved: boolean; survivableDeletions: number }`.
    - `wordFlags[i]` = whether token i's incoming bigram equation is currently "useful" (green): consistent and reducing erasures, per the running solve.
    - `solved` = all B bits determined AND payload MAC verifies.
    - `survivableDeletions` = quick local Monte-Carlo: over K=200 trials, delete random single words, re-solve, count max deletions keeping `solved` (report conservative percentile).
  - `Encoder.suggest(text: string, wordlist: string[]): Promise<string[]>` — up to 8 words from `wordlist` whose appended equation is green.

- [ ] **Step 1:** Failing tests: for a fixed secret+passphrase, a carrier known to solve reports `solved:true`; truncating it drops below solved; `survivableDeletions` is 0 at minimal length and rises as words are appended; `suggest` returns only green words (verify each by appending and checking flag).
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement. Cache derived keys + payload in the Encoder instance.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(codec): encoder with live coverage + durability`.

### Task B8: Decoder

**Files:**
- Create: `src/codec/decoder.ts`
- Test: `src/codec/decoder.test.ts`

**Interfaces:**
- Consumes: B2–B6, `parsePayload` (B4).
- Produces:
  - `decode(text: string, passphrase: string): Promise<DecodeResult>` where `DecodeResult = { secret: string; diagnostics: Diag } | { secret: null; diagnostics: Diag }` and `Diag = { words: number; equations: number; erasuresHealed: number; conflicts: number }`.
  - Algorithm: for N=1..16 compute `B=payloadBitLength(N)`, build equations at that B, solve; if ≤8 erasures, enumerate completions (≤256) and MAC-test each; accept first N whose MAC verifies. Report diagnostics for the accepted (or best-attempt) N.

- [ ] **Step 1:** Failing tests: decode of an encoder-produced carrier returns the secret; wrong passphrase → `secret:null`; deleting up to the encoder-reported `survivableDeletions` still returns the secret (drives B9); random text → null; diagnostics populated.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(codec): decoder with N-search + erasure completion`.

### Task B9: Round-trip + robustness property tests

**Files:**
- Create: `src/codec/roundtrip.test.ts`

**Interfaces:**
- Consumes: encoder (B7), decoder (B8).

- [ ] **Step 1:** Write property tests: (a) 100 random (secret,passphrase) pairs — grow a carrier from a shipped sentence corpus + `suggest` until `solved`, then `decode` recovers exactly. (b) Deletion sweep: at each of 0..`survivableDeletions` deletions (30 trials each), recovery rate is 100%; one past it may fail — assert the meter is not optimistic (recovery ≥ claimed). (c) Transport mangling: uppercase-random + double-spaces + swapped punctuation leaves recovery at 100%.
- [ ] **Step 2:** Run — expect pass (these validate B1–B8; if (b) fails, tune degree distribution in B5 and redundancy target in B7).
- [ ] **Step 3:** Commit `test(codec): round-trip + robustness properties`.

---

## Track C — UI

Uses codec (Track B). Tailwind v4. Local primitives in `src/ui/` (Button, Field, Meter) styled to a dark theme — no external component dep.

### Task C1: App shell + routing + primitives

**Files:**
- Create: `src/ui/primitives.tsx` (Button, TextField, TextArea, Meter, Tag)
- Create: `src/App.tsx` (modify from A2): tab state Hide | Reveal
- Create: `src/styles.css` (Tailwind import + theme tokens)
- Test: `src/ui/primitives.test.tsx`

**Interfaces:**
- Produces: `<App/>` with two tabs; primitives with typed props.

- [ ] **Step 1:** Failing test (jsdom + @testing-library/react — add `-D @testing-library/react @testing-library/dom`): App renders both tab buttons; clicking Reveal shows the Reveal panel.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement primitives + tabbed App. Placeholder panels.
- [ ] **Step 4:** Run — pass. `pnpm build` clean.
- [ ] **Step 5:** Commit `feat(ui): app shell, tabs, primitives`.

### Task C2: Hide view — secret, passphrase, live editor, meter

**Files:**
- Create: `src/ui/HideView.tsx`
- Create: `src/ui/useEncoder.ts` (hook: debounced encoder.evaluate)
- Create: `public/wordlist.txt` (~10k permissive common words; e.g. google-10000-english, MIT/public-domain)
- Test: `src/ui/HideView.test.tsx`

**Interfaces:**
- Consumes: `createEncoder` (B7).
- Produces: `<HideView/>` — secret field (16-char, alphabet-filtered, counter), passphrase field, contenteditable/overlay carrier editor coloring each word green/red from `wordFlags`, progress→durability `Meter`, Copy button (plain text).

- [ ] **Step 1:** Failing tests: typing a >16-char/invalid secret is clamped/filtered; with a known secret+passphrase+carrier the meter shows solved; red words carry a `data-flag="red"`; Copy writes the raw carrier text (mock clipboard).
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement. `useEncoder` debounces (~120ms), recreates encoder on secret/passphrase change, calls `evaluate` on carrier change. Word coloring via an overlay that tokenizes with the same regex and maps spans to `wordFlags`.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(ui): Hide view with live coverage + durability meter`.

### Task C3: Word inspector + stuck-helper

**Files:**
- Create: `src/ui/WordInspector.tsx`
- Modify: `src/ui/HideView.tsx` (wire click-to-inspect + suggestions)
- Test: `src/ui/WordInspector.test.tsx`

**Interfaces:**
- Consumes: `Encoder.suggest` (B7), equation data (B5).

- [ ] **Step 1:** Failing tests: clicking a word shows its bigram + subset indices + parity; the suggestions row lists words and clicking one appends it to the carrier.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement. Load `wordlist.txt` via `fetch(import.meta.env.BASE_URL + 'wordlist.txt')` once, cache.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(ui): word inspector + green-word suggestions`.

### Task C4: Reveal view + diagnostics

**Files:**
- Create: `src/ui/RevealView.tsx`
- Test: `src/ui/RevealView.test.tsx`

**Interfaces:**
- Consumes: `decode` (B8).

- [ ] **Step 1:** Failing tests: pasting an encoder-produced carrier + correct passphrase shows the secret; wrong passphrase shows the explicit failure message; diagnostics (words/equations/erasuresHealed/conflicts) render.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement (debounced decode; loud success/fail states).
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit `feat(ui): Reveal view with diagnostics`.

### Task C5: Copy polish + security-notes footer

**Files:**
- Modify: `src/App.tsx`, `src/ui/HideView.tsx`
- Create: `src/ui/About.tsx`

- [ ] **Step 1:** Add a concise "How it works / limits" panel from spec §6 (16-bit MAC, static salt, existence-hiding caveat) — no overselling. Test: About renders the limits text.
- [ ] **Step 2:** Run — fail → implement → pass.
- [ ] **Step 3:** Commit `feat(ui): about + honest security notes`.

---

## Track D — E2E + ship

### Task D1: Playwright E2E

**Files:**
- Create: `tests/e2e/roundtrip.spec.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Consumes: full app via `pnpm dev` / preview server.

- [ ] **Step 1:** Config Playwright to run against `vite preview` on the base path. Write specs: (1) Hide "MEET AT 8" with a passphrase, write/paste a carrier until meter solves, Copy; open Reveal, paste, same passphrase → secret shown. (2) Wrong passphrase → failure. (3) Delete 2 words from the copied carrier before pasting → still recovers.
- [ ] **Step 2:** Run `pnpm playwright test` — iterate to green.
- [ ] **Step 3:** Commit `test(e2e): hide→reveal round-trip + resilience`.

### Task D2: Production deploy + live verification

**Files:**
- Modify: `vercel.json` (experiment, if needed for SPA fallback under base path)

- [ ] **Step 1:** Add experiment `vercel.json` with SPA rewrite so deep links under `/say-what-you-mean/*` serve `index.html`.
- [ ] **Step 2:** `vercel deploy --prod --yes` (experiment). Confirm shell rewrite (Task A1/A2) points at the current prod host.
- [ ] **Step 3:** Live check: `curl -sI https://lab.bak.dev/say-what-you-mean` → 200; open in browser, run one manual hide→reveal.
- [ ] **Step 4:** Commit any config; tag `v1`.

---

## Self-review notes

- **Spec coverage:** alphabet+16-cap (B1), tokenizer (B2), KDF (B3), payload+MAC (B4), keyed bigram equations = the character-relationship cipher (B5), solver (B6), encoder/durability meter + suggestions + inspector data (B7/C2/C3), decoder/diagnostics (B8/C4), robustness/deletion validation (B9/D1), Hide+Reveal UI (C1–C5), security notes §6 (C5), lab shell + rewrite + domain (A1/A2), SPA deploy (D2). All spec sections mapped.
- **Deviation:** UI uses local Tailwind primitives instead of `@bakdotdev/qui` (private registry → deploy friction). Functional parity; noted for user.
- **Risk/tuning:** B5 degree distribution and B7 redundancy target are the tuning knobs; B9(b) is the gate that proves the durability meter is not optimistic. If B9 fails, tune those two, not the tests.
- **Types:** `Equation`, `EncodeState`, `DecodeResult`, `Diag` names are consistent across B5–C4.
