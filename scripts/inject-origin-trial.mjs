/**
 * Inject Chrome's HTML-in-Canvas origin-trial token into the built index.html.
 *
 * The dev flag (chrome://flags/#canvas-draw-element) only enables the API on
 * one machine. Deployed visitors need a domain-bound origin-trial token served
 * as a meta tag in <head>. The token comes from the HTML_IN_CANVAS env var.
 *
 * Done as a post-build step rather than a Vite plugin because Vite 8's
 * transformIndexHtml hook did not fire for this config.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const token = process.env.HTML_IN_CANVAS?.trim()
const file = resolve(process.cwd(), "dist/index.html")

if (!existsSync(file)) {
  console.error("[origin-trial] dist/index.html not found")
  process.exit(1)
}
if (!token) {
  console.log("[origin-trial] HTML_IN_CANVAS unset — skipping (effect will fall back)")
  process.exit(0)
}

const html = readFileSync(file, "utf8")
if (html.includes('http-equiv="origin-trial"')) {
  console.log("[origin-trial] already present")
  process.exit(0)
}

const tag = `<meta http-equiv="origin-trial" content="${token}" />`
const out = html.replace("<head>", `<head>\n    ${tag}`)
if (out === html) {
  console.error("[origin-trial] could not find <head> to inject into")
  process.exit(1)
}
writeFileSync(file, out)
console.log(`[origin-trial] injected token (${token.length} chars)`)
