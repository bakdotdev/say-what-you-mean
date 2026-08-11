/**
 * Rewrites a carrier paragraph so that specific word slots hold specific
 * words, while keeping the author's meaning, tone and length.
 *
 * The codec stays authoritative: the client computes which slots must change
 * and the exact set of words that satisfy the constraint, and this route only
 * asks the model to weave those choices into natural prose. The client
 * re-verifies afterwards, so a disobedient model degrades to "no change"
 * rather than a broken carrier.
 *
 * Uses the Vercel AI Gateway (OpenAI-compatible) with AI_GATEWAY_API_KEY.
 */

interface SlotRequest {
  /** Word currently at this slot. */
  from: string
  /** Words that satisfy the constraint; the model must pick one. */
  options: string[]
}

interface Body {
  carrier: string
  slots: SlotRequest[]
}

const MODEL = "anthropic/claude-haiku-4.5"
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions"

const SYSTEM = `You rewrite a paragraph so it reads naturally while using required words.

Rules, in priority order:
1. For each required substitution you MUST use exactly one option from its list, replacing the given word.
2. Keep the author's meaning, voice, tense and approximate length.
3. You may reword surrounding phrasing so the required words fit smoothly — that is the point. Adjust articles, prepositions and connectives freely.
4. Do NOT add or remove sentences. Do NOT add commentary.
5. Return ONLY the rewritten paragraph as plain text.`

// Edge runtime: this route only forwards a fetch, and the Web Request/Response
// signature below is the edge contract.
export const config = { runtime: "edge" }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405)
  }

  const key = process.env.AI_GATEWAY_API_KEY
  if (!key) return json({ error: "AI_GATEWAY_API_KEY not configured" }, 500)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: "invalid json" }, 400)
  }

  const { carrier, slots } = body
  if (typeof carrier !== "string" || !carrier.trim()) {
    return json({ error: "carrier required" }, 400)
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    return json({ rewritten: carrier })
  }
  if (carrier.length > 8000 || slots.length > 120) {
    return json({ error: "input too large" }, 413)
  }

  const instructions = slots
    .map(
      (s, i) =>
        `${i + 1}. replace "${s.from}" with one of: ${s.options
          .slice(0, 12)
          .join(", ")}`,
    )
    .join("\n")

  const prompt = `Paragraph:\n${carrier}\n\nRequired substitutions:\n${instructions}\n\nRewrite the paragraph.`

  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      return json(
        { error: `gateway ${res.status}`, detail: detail.slice(0, 400) },
        502,
      )
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const rewritten = data.choices?.[0]?.message?.content?.trim()
    if (!rewritten) return json({ error: "empty completion" }, 502)

    return json({ rewritten })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "request failed" },
      502,
    )
  }
}

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
