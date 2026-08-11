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
    "a an the this that these those my your his her its our their whose " +
    "i me you he him she it we us they them who whom which what " +
    "am is are was were be been being do does did doing done have has had having " +
    "will would shall should can could may might must ought " +
    "and or but nor so yet for because although though while whereas since unless until " +
    "if then than as when where why how whether either neither both " +
    "of to in on at by from with without within into onto upon over under " +
    "above below between among through during before after against about across " +
    "around behind beside besides beyond down off out past toward towards up " +
    "not no nor never none nothing nobody nowhere any anyone anything some someone " +
    "something every everyone everything each all most more much many few fewer less " +
    "least little other others another same such own very too also just only even " +
    "there here now then once again still yet always often sometimes rarely " +
    "one two three first next last new old good great well back way day time year " +
    "s t re ve ll d m"
  ).split(" "),
)

export const isFunctionWord = (word: string): boolean =>
  FUNCTION_WORDS.has(word.toLowerCase())
