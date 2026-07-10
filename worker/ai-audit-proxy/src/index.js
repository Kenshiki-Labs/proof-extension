// Pulse Observer AI-audit proxy.
//
// The extension ships without any API credential; this Worker holds the
// product OpenRouter key as a secret and is the only party that talks to
// OpenRouter. The extension POSTs { auditPayload } and gets back { report }.
//
// Trust posture: an Origin header and a payload .gov check are cheap filters,
// not authentication — any non-browser client can forge both. The controls
// that actually bound abuse of the product key are the per-IP rate limit and
// the server-chosen model/max_tokens (a stolen endpoint is only ever a
// low-volume, fixed-prompt, fixed-model report generator).

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const MAX_PAYLOAD_CHARS = 200_000

const AUDIT_SYSTEM_PROMPT = `You are a senior privacy, security, and digital-government audit lead writing for leaders who operate .gov services.
Generate a buyer-ready runtime audit report from the provided Pulse Observer JSON payload.

Lead with the conclusion. The first section must answer whether this .gov site is missing an opportunity to bind the legitimate citizen, beneficiary, claimant, applicant, payee, representative, or account holder to a sensitive action without increasing surveillance.

Frame the report around public-interest trust:
- What the site currently observes or exposes.
- What that observation appears to do for the institution.
- What it does not do for the citizen.
- What privacy-preserving trust signals could replace passive telemetry.
- What controls would improve assurance without adtech-style tracking, behavioral profiling, session replay, or third-party enrichment.

Rules:
- Use only facts present in the payload. Label inference as inference.
- Separate observed evidence from recommendations.
- Do not claim that a party collected sensitive personal data unless the payload proves it.
- Treat benefits, healthcare, financial, identity, account, representative-payee, payment, status-check, direct-deposit, document-upload, card-replacement, and eligibility journeys as high-sensitivity contexts.
- Distinguish operational telemetry and site tooling from advertising or data-broker tracking.
- Call out unknown or unclassified parties as governance gaps, not proven misconduct.
- Be precise about what a browser-local audit can and cannot see.
- Prefer the positive recommendation: explicit, consented, first-party, purpose-bound assurance for high-stakes actions.
- Avoid recommending more passive observation. Governments should not observe citizens more; they should let legitimate citizens prove more with less disclosure.

When recommending improvements, draw from this menu when relevant:
1. Action-bound proof for sensitive transitions such as direct-deposit changes, card replacement, document upload, representative-payee changes, benefit status access, address/contact changes, account recovery, and eligibility decisions.
2. Passkeys and WebAuthn for phishing-resistant login, account recovery, and high-risk account changes.
3. Signed action receipts that state what action occurred, when, which assurance factors were used, and whether the action was approved, challenged, or refused.
4. Purpose-bound beneficiary or citizen attestations, such as receives benefit, Medicare-age eligible, representative payee authorized, benefit letter current, or identity verified on a given date, without oversharing underlying records.
5. Consented first-party local continuity signals that help establish same person, same device, expected context, without sending raw behavioral traces to third parties.
6. Risk-based step-up that keeps public navigation low friction and reserves stronger ceremonies for high-stakes transitions.
7. Telemetry minimization: no sensitive URLs, referrers, form values, account IDs, claim IDs, session replay on sensitive pages, or vendor access beyond approved purposes.
8. Vendor governance that maps every third party to an approved purpose, page class, data class, retention period, and contract owner; unknown parties become findings.
9. Consent and disclosure clarity that distinguishes operational telemetry, security tools, analytics, and optional services.
10. Recovery without surveillance: device-bound recovery keys, trusted devices, postal or phone fallback, representative workflows, and accessibility-aware ceremonies.
11. Accessibility and caregiver workflows for people using assistive technology, shared devices, low-connectivity environments, caregivers, or authorized representatives.
12. Server-side assurance controls the browser cannot see: token binding, signed prompts, server-side event integrity, mTLS or private origins, anti-replay, and audit logs.

Do not recommend all controls blindly. Pick the few that best match the observed runtime evidence and the likely public-service journey.

Output in markdown with these sections:
1. Conclusion: missed trust opportunity
2. What was observed
3. What the current instrumentation does not provide
4. Privacy-preserving trust signals the site could use
5. Governance questions for the agency
6. Recommended controls
7. Evidence notes`

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function payloadIsGov(auditPayload) {
  try {
    const parsed = JSON.parse(auditPayload)
    if (typeof parsed.origin !== "string") return false
    return new URL(parsed.origin).hostname.toLowerCase().endsWith(".gov")
  } catch {
    return false
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json(405, { error: "POST only." })

    const origin = request.headers.get("Origin") ?? ""
    const allowedOrigin = env.ALLOWED_EXTENSION_ORIGIN
    const originOk = allowedOrigin ? origin === allowedOrigin : origin.startsWith("chrome-extension://")
    if (!originOk) return json(403, { error: "Requests are accepted only from the Pulse Observer extension." })

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown"
    const { success } = await env.RATE_LIMITER.limit({ key: ip })
    if (!success) return json(429, { error: "Rate limit reached. Try again in a minute." })

    let body
    try {
      body = await request.json()
    } catch {
      return json(400, { error: "Body must be JSON." })
    }

    const auditPayload = body?.auditPayload
    if (typeof auditPayload !== "string" || auditPayload.length === 0) return json(400, { error: "auditPayload is required." })
    if (auditPayload.length > MAX_PAYLOAD_CHARS) return json(413, { error: "auditPayload is too large." })
    if (!payloadIsGov(auditPayload)) return json(400, { error: "AI audit reports are enabled only for .gov origins." })

    const upstream = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://proofyouarehuman.com",
        "X-Title": "Pulse Observer Runtime Audit"
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        messages: [
          { role: "system", content: AUDIT_SYSTEM_PROMPT },
          { role: "user", content: `Generate the .gov trust-opportunity audit report from this Pulse Observer payload:\n\n${auditPayload}` }
        ],
        temperature: 0.2,
        max_tokens: 5200,
        top_p: 0.9,
        response_format: { type: "text" },
        reasoning: { enabled: false }
      })
    })

    if (!upstream.ok) {
      // Upstream error bodies can reference account/key details; never relay them.
      console.error("openrouter error", upstream.status, await upstream.text().catch(() => ""))
      return json(502, { error: `The audit model is unavailable right now (upstream ${upstream.status}).` })
    }

    let data
    try {
      data = await upstream.json()
    } catch {
      return json(502, { error: "The audit model returned an unreadable response." })
    }

    const report = data?.choices?.[0]?.message?.content
    if (typeof report !== "string" || report.trim().length === 0) {
      return json(502, { error: "The audit model returned an empty report." })
    }

    return json(200, { report: report.trim() })
  }
}
