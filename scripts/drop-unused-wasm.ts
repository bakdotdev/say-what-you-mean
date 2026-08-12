/**
 * Vite plugin: drop the onnxruntime WASM copy from the build output.
 *
 * onnxruntime-web references its binary with `new URL(..., import.meta.url)`,
 * so Vite emits a 22.5 MB asset — but at runtime transformers.js fetches the
 * binary from jsDelivr instead. Measured on the deployed page: jsDelivr served
 * it, our origin served 242 kB total, and the bundled copy was fetched by
 * nobody. It was being uploaded on every deploy for nothing.
 *
 * If a future version starts loading it locally this will break loudly rather
 * than silently, because the file simply will not be there.
 */
import type { Plugin } from "vite"

export const dropUnusedWasm = (): Plugin => ({
  name: "drop-unused-wasm",
  generateBundle(_options, bundle) {
    for (const file of Object.keys(bundle)) {
      if (!file.endsWith(".wasm")) continue
      const asset = bundle[file]
      const size =
        asset.type === "asset" && typeof asset.source !== "string"
          ? asset.source.length
          : 0
      delete bundle[file]
      this.warn(
        `dropped ${file} (${(size / 1048576).toFixed(1)} MB) — fetched from jsDelivr at runtime`,
      )
    }
  },
})
