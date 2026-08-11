export { ALPHABET, MAX_SECRET_LENGTH, normalizeSecret, isEncodable } from "./alphabet"
export { tokenize, tokenizeSpans } from "./tokenize"
export type { TokenSpan } from "./tokenize"
export { createEncoder, DENSITY_PRESETS } from "./encoder"
export type {
  Encoder,
  EncodeState,
  WordReport,
  DensityName,
} from "./encoder"
export { decode } from "./decoder"
export type { DecodeResult, Diagnostics } from "./decoder"
export {
  wordDigests,
  equationsFor,
  equationFromDigest,
  isSatisfied,
} from "./equations"
export type { Equation, WordFeatureDigests } from "./equations"
export { FEATURE_METHODS, featuresOf, MAX_DENSITY } from "./features"
export type { FeatureMethod } from "./features"
export { deriveKeys } from "./keys"
export { payloadBitLength } from "./payload"
