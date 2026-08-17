import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { initBotId } from "botid/client/core"
import { App } from "./App"
import "./styles.css"

/**
 * The AI routes cost money per call and are reachable by anyone who can send an
 * HTTP request. Their Origin check is not a security boundary — an Origin
 * header is a string curl can set or omit, and both get through — so BotID does
 * the actual work of proving a real browser is calling.
 *
 * Must run before anything can fetch, hence here rather than in a component.
 * Paths are the ones the browser actually requests, which include the base
 * path this app is served under.
 */
const base = import.meta.env.BASE_URL
initBotId({
  protect: [
    { path: `${base}api/generate`, method: "POST" },
    { path: `${base}api/rewrite`, method: "POST" },
    { path: `${base}api/keys`, method: "POST" },
  ],
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
