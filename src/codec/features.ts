/**
 * Feature methods: the different ways a single word can "speak" about the
 * hidden message. Each method reduces a word to a feature string; that string
 * is keyed-hashed into one equation. More methods per word = more equations
 * per word = a much shorter carrier for the same secret.
 *
 * Measured (scratchpad/vote-sim3.mjs, B=116): 1 method needs ~340 words,
 * 4 methods needs ~93-102. The cost is that satisfying every method at once is
 * rare, which is why the tolerance threshold (see encoder) matters.
 */

export type FeatureMethod = {
  readonly id: string
  readonly label: string
  readonly describe: string
  /** Reduce a word to its feature string, or null if inapplicable. */
  readonly of: (word: string) => string | null
}

/** The whole word. Highest signal; changes if the word changes at all. */
const identity: FeatureMethod = {
  id: "id",
  label: "word",
  describe: "the whole word",
  of: (w) => `id:${w}`,
}

/**
 * Letter relationships: the gaps between consecutive letters, mod 26.
 * Independent of where the word sits and of its absolute letters — it encodes
 * the word's internal shape ("cat" and "dbu" share a signature).
 */
const letterRelations: FeatureMethod = {
  id: "lr",
  label: "letter gaps",
  describe: "distances between its letters",
  of: (w) => {
    const letters = [...w].filter((c) => c >= "a" && c <= "z")
    if (letters.length < 2) return null
    const gaps = letters
      .slice(1)
      .map(
        (c, i) =>
          (((c.charCodeAt(0) - letters[i].charCodeAt(0)) % 26) + 26) % 26,
      )
    return `lr:${gaps.join(",")}`
  },
}

/** Length plus first and last letter — survives small internal edits. */
const shape: FeatureMethod = {
  id: "sh",
  label: "shape",
  describe: "its length and first/last letter",
  of: (w) => (w.length >= 2 ? `sh:${w.length}:${w[0]}:${w[w.length - 1]}` : null),
}

/** Prefix and suffix — catches word families (walk/walked/walking). */
const affixes: FeatureMethod = {
  id: "af",
  label: "affixes",
  describe: "its first and last few letters",
  of: (w) => (w.length >= 3 ? `af:${w.slice(0, 3)}|${w.slice(-3)}` : null),
}

/**
 * Ordered by how much each adds. A "density level" k activates the first k
 * methods, and a word must satisfy ALL active methods to be usable. More
 * methods = more equations per word = shorter carrier, but fewer usable words.
 *
 * Measured at B=116 (scratchpad/vote-sim3.mjs, confirmed on the real wordlist):
 *   k=1: ~50% of words usable, ~340-word carrier
 *   k=2: ~25% usable, ~169 words
 *   k=4:  ~6% usable,  ~93 words
 */
export const FEATURE_METHODS: readonly FeatureMethod[] = [
  identity,
  letterRelations,
  shape,
  affixes,
]

export const MAX_DENSITY = FEATURE_METHODS.length

/** Feature strings for a word using the first `density` methods. */
export const featuresOf = (
  word: string,
  density: number = MAX_DENSITY,
): { methodId: string; feature: string }[] => {
  const out: { methodId: string; feature: string }[] = []
  for (const m of FEATURE_METHODS.slice(0, density)) {
    const feature = m.of(word)
    if (feature !== null) out.push({ methodId: m.id, feature })
  }
  return out
}


/**
 * Function words are never used for decryption.
 *
 * You cannot swap "the" for a synonym — function words are unsubstitutable,
 * so constraining them fights the writer and buys nothing. Content words
 * (nouns, verbs, adjectives) do have alternatives, which is where a real
 * choice exists, so that is where the constraint belongs.
 *
 * This list is fixed and shared, needing no key, so the decoder applies the
 * same test to received text without any extra data.
 */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set(
  (
    // Articles and determiners
    "a an the this that these those my your his her its our their whose " +
    "each every either neither both all any some no none such another " +
    "other others same enough several various certain " +
    // Pronouns, including reflexives and possessives
    "i me mine myself you your yours yourself yourselves he him his " +
    "himself she her hers herself it its itself we us our ours ourselves " +
    "they them their theirs themselves who whom whose which what one " +
    "oneself whatever whoever whomever whichever " +
    // Be, have and do in every form — auxiliaries, not content
    "am is are was were be been being do does did doing done have has " +
    "had having " +
    // Modals
    "will would shall should can could may might must ought need dare " +
    // Conjunctions, coordinating and subordinating
    "and or but nor for yet so because although though while whereas " +
    "since unless until till if whether than as when whenever where " +
    "wherever why how however therefore moreover otherwise meanwhile " +
    "besides nevertheless nonetheless furthermore thus hence albeit lest " +
    // Prepositions
    "of to in on at by from with without within into onto upon over " +
    "under above below beneath underneath between among amongst through " +
    "throughout during before after against about across around behind " +
    "beside beyond down off out outside inside past toward towards up " +
    "via versus despite except regarding concerning considering following " +
    "per plus minus near next opposite along alongside amid amidst atop " +
    // Negation, quantity and degree
    "not never nothing nobody nowhere anything anyone anybody anywhere " +
    "something someone somebody somewhere everything everyone everybody " +
    "everywhere more most much many few fewer less least little very too " +
    "also just only even still again once always often sometimes rarely " +
    "seldom quite rather really almost nearly hardly barely scarcely " +
    "indeed perhaps maybe anyway there here now then " +
    // Contractions — the tokenizer keeps apostrophes, so these are tokens
    "i'm i've i'll i'd you're you've you'll you'd he's he'll he'd she's " +
    "she'll she'd it's it'll we're we've we'll we'd they're they've " +
    "they'll they'd that's there's here's what's who's let's isn't " +
    "aren't wasn't weren't don't doesn't didn't won't wouldn't can't " +
    "cannot couldn't shouldn't shan't mustn't haven't hasn't hadn't " +
    "ain't " +
    // Clitics other tokenizers leave behind
    "s t re ve ll d m"
  ).split(" "),
)

export const isFunctionWord = (word: string): boolean =>
  FUNCTION_WORDS.has(word.toLowerCase())
