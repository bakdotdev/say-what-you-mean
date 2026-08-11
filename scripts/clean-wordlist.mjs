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
  "escort escorts brothel camgirl upskirt fetish milf hookup " +
  // Identity terms. Not offensive in themselves — the problem is that
  // substitution drops them into sentences at random, which produced "like a
  // sensible asian" in a test carrier. Nobody should find that in a message
  // they are about to send, and the model provider refuses to process it.
  "asian asians african africans american americans european europeans " +
  "arab arabs jew jews jewish muslim muslims christian christians hindu " +
  "buddhist catholic protestant mormon atheist islam judaism christianity " +
  "black blacks white whites latino latina hispanic indian indians native " +
  "chinese japanese korean vietnamese mexican russian german french " +
  "british english irish scottish italian spanish polish turkish iranian " +
  "iraqi israeli palestinian afghan pakistani nigerian egyptian " +
  "israel iraq iran afghanistan palestine syria " +
  "race racial racism racist ethnic ethnicity gender transgender " +
  "immigrant immigrants refugee refugees minority minorities " +
  // Illness and death, for the same reason
  "cancer tumor tumour disease diseases illness dying dead death deaths " +
  "blood bleeding wound wounded injury injured trauma abuse abused " +
  "victim victims addiction addict alcoholic depression anxiety " +
  // Crime, war and policing
  "war wars army military soldier soldiers troops combat attack attacked " +
  "weapon weapons crime crimes criminal police arrest arrested prison " +
  "jail inmate convicted felony assault robbery theft fraud violence " +
  "violent threat threats hostage torture " +
  // Politics, which reads as bizarre in a domestic paragraph anyway
  "election elections vote voting voter president senate congress " +
  "republican democrat democrats conservative liberal政"
).split(/\s+/).filter((w) => /^[a-z']+$/.test(w))

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
