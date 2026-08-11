import { describe, it, expect } from "vitest"
import { tokenize, tokenizeSpans } from "./tokenize"

describe("tokenize", () => {
  it("splits on punctuation and whitespace, lower-cases", () => {
    expect(tokenize("The cow, ate!  Grass.")).toEqual([
      "the",
      "cow",
      "ate",
      "grass",
    ])
  })

  it("keeps intra-word apostrophes and folds smart quotes", () => {
    expect(tokenize("it's")).toEqual(["it's"])
    expect(tokenize("it’s")).toEqual(["it's"]) // right single quote
    expect(tokenize("it‘s")).toEqual(["it's"]) // left single quote
  })

  it("is invariant to case, whitespace, and punctuation changes", () => {
    const a = tokenize("Meet at the dock at 8.")
    const b = tokenize("meet   at,, THE dock — at 8")
    expect(a).toEqual(b)
  })

  it("folds unicode compatibility forms via NFKC", () => {
    // fullwidth 'ＡＢ' → 'ab'
    expect(tokenize("ＡＢ")).toEqual(["ab"])
  })

  it("returns empty for punctuation-only or empty input", () => {
    expect(tokenize("  —,. ")).toEqual([])
    expect(tokenize("")).toEqual([])
    expect(tokenize("''")).toEqual([]) // apostrophes only, no letters
  })

  it("keeps digits", () => {
    expect(tokenize("room 101b")).toEqual(["room", "101b"])
  })
})

describe("tokenizeSpans", () => {
  it("returns the same words as tokenize", () => {
    const text = "The cow, ate!  Grass — it's fine."
    expect(tokenizeSpans(text).map((s) => s.word)).toEqual(tokenize(text))
  })

  it("gives offsets that slice back to the original words", () => {
    const text = "Meet at the dock at 9."
    for (const span of tokenizeSpans(text)) {
      expect(text.slice(span.start, span.end).toLowerCase()).toBe(span.word)
    }
  })

  it("keeps offsets aligned across punctuation and newlines", () => {
    const text = "one,two\n\nthree   four"
    const spans = tokenizeSpans(text)
    expect(spans.map((s) => s.word)).toEqual(["one", "two", "three", "four"])
    expect(text.slice(spans[3].start, spans[3].end)).toBe("four")
  })
})
