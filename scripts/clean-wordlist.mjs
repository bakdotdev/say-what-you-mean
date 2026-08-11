/**
 * Strips terms that must never end up in someone's carrier message.
 *
 * wordlist.txt starts as the Google 10k web-corpus list, which carries the
 * web's residue: porn, drug spam, slurs. Two things go wrong if they stay.
 * The app picks replacement words from this list, so it can silently drop an
 * obscenity into a message someone is about to send. And the model provider
 * refuses whole requests when enough of them appear at once — measured as
 * finish_reason "content-filter" with zero completion tokens, which is what
 * made carrier polishing fail on every full-length passage.
 *
 * Two sources, because neither is enough alone: the LDNOOBW list vendored at
 * data/blocked-words.txt covers obscenity and slurs, and EXTRA below covers
 * what a web corpus has that a profanity list does not — pharmacy spam,
 * gambling, and violence terms.
 *
 * Idempotent. Run: node scripts/clean-wordlist.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"

const LIST = "public/wordlist.txt"
const BLOCKED = "data/blocked-words.txt"

/** Exact matches only — substring matching would eat "assess" and "class". */
const EXTRA = (
  // Pharmacy and drug spam, heavily represented in web-crawl frequency lists
  "viagra cialis levitra adipex xanax valium vicodin oxycontin percocet " +
  "phentermine tramadol ambien codeine morphine soma ativan klonopin " +
  "heroin cocaine meth methamphetamine ecstasy marijuana cannabis bong " +
  // Gambling spam
  "casino casinos poker blackjack roulette betting bookmaker wagering " +
  // Violence
  "kill killed killing killer murder murdered suicide bomb bombing bombs " +
  "terrorist terrorism nazi hitler holocaust genocide massacre shooting " +
  "rifle pistol shotgun ammo ammunition " +
  // Piracy spam
  "warez keygen crackz serialz " +
  // Misc adult-site residue the profanity list misses
  "escort escorts brothel camgirl upskirt fetish milf hookup"
).split(/\s+/)

const banned = new Set([
  ...readFileSync(BLOCKED, "utf8").split("\n").map((w) => w.trim()).filter(Boolean),
  ...EXTRA,
])

const words = readFileSync(LIST, "utf8")
  .split("\n")
  .map((w) => w.trim())
  .filter(Boolean)

const kept = words.filter((w) => !banned.has(w))

writeFileSync(LIST, kept.join("\n") + "\n")
console.log(`wordlist: ${words.length} → ${kept.length} (${words.length - kept.length} removed)`)

// Report where the frequency-ordered head ends, so a drifting boundary is
// visible. Detected by letter takeover, not by sort order: the dictionary
// uses a collation that puts "abay" after "abaft", so it is not strictly
// ascending, but it IS overwhelmingly one letter at a time.
const dominance = (a, i, n) => {
  const counts = new Map()
  for (let k = i; k < i + n && k < a.length; k++) {
    const c = a[k][0]
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return Math.max(...counts.values()) / n
}
for (let i = 0; i + 200 < kept.length; i += 10) {
  if (dominance(kept, i, 200) > 0.9) {
    console.log(`frequency-ordered head ends at ~${i} (${kept[i]})`)
    break
  }
}
