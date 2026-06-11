// ============================================================
// SOC TRAINER v5 — API Module (hardened)
// - Provider auto-detected from the key prefix (override below)
// - Request timeout via AbortController
// - Retry with exponential backoff + jitter on 429 / 5xx / network,
//   honoring the Retry-After header when the provider sends one
// - Malformed-JSON and unexpected-shape payloads never throw raw —
//   every failure surfaces as an APIError with a friendly message
// ============================================================

// Force a provider here, or leave "auto" to detect from the key.
const PROVIDER = "auto";

const TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;          // total attempts = MAX_RETRIES + 1
const BASE_BACKOFF_MS = 1_500;

// ─── Typed errors ────────────────────────────────────────────
// kind: "auth" | "rate_limit" | "timeout" | "network" | "server"
//       | "parse" | "blocked" | "empty" | "config"
export class APIError extends Error {
  constructor(kind, message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = "APIError";
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

const FRIENDLY = {
  auth:       "API key rejected — check the key and try again.",
  rate_limit: "Provider rate limit hit — backing off automatically.",
  timeout:    "The AI took too long to respond. Try again, or switch to Demo Mode.",
  network:    "Network error — check your connection.",
  server:     "The AI provider is having issues right now.",
  parse:      "The provider returned an unreadable response.",
  blocked:    "The provider blocked this generation. Re-roll the scenario.",
  empty:      "The provider returned an empty response. Try again.",
};

// ─── Provider detection ──────────────────────────────────────
export function detectProvider(apiKey) {
  if (PROVIDER !== "auto") return PROVIDER;
  const k = (apiKey || "").trim();
  if (k.startsWith("gsk_"))   return "groq";
  if (k.startsWith("AIza"))   return "gemini";
  if (k.startsWith("sk-"))    return "openai";
  return "groq"; // sensible default for free keys
}

// ─── Low-level fetch: timeout + safe JSON + status mapping ───
async function fetchJSON(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new APIError("timeout", FRIENDLY.timeout, { retryable: true });
    throw new APIError("network", FRIENDLY.network, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  // Read text first so malformed JSON can't produce an unhandled throw.
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* handled below */ }

  if (!response.ok) {
    const detail = data?.error?.message || response.statusText || "Unknown error";
    const s = response.status;
    if (s === 401 || s === 403) throw new APIError("auth", FRIENDLY.auth, { status: s });
    if (s === 429) {
      const err = new APIError("rate_limit", FRIENDLY.rate_limit, { status: s, retryable: true });
      const ra = parseFloat(response.headers.get("Retry-After"));
      if (!Number.isNaN(ra)) err.retryAfterMs = ra * 1000;
      throw err;
    }
    if (s >= 500) throw new APIError("server", `${FRIENDLY.server} [${s}]`, { status: s, retryable: true });
    throw new APIError("server", `[${s}] ${detail}`, { status: s });
  }

  if (data === null) throw new APIError("parse", FRIENDLY.parse, { retryable: true });
  return data;
}

// ─── Retry wrapper: exponential backoff + jitter ─────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, onRetry) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof APIError && err.retryable;
      if (!retryable || attempt === MAX_RETRIES) throw err;
      const backoff = err.retryAfterMs ?? BASE_BACKOFF_MS * 2 ** attempt;
      const delay = backoff + Math.random() * 400; // jitter avoids thundering herd
      if (onRetry) onRetry(err, attempt + 1, Math.round(delay));
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ─── Response shape validation ───────────────────────────────
function extractChatContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new APIError("empty", FRIENDLY.empty, { retryable: true });
  }
  return content;
}

function extractGeminiContent(data) {
  const block = data?.promptFeedback?.blockReason;
  const finish = data?.candidates?.[0]?.finishReason;
  if (block || finish === "SAFETY" || finish === "RECITATION") {
    throw new APIError("blocked", FRIENDLY.blocked);
  }
  const content = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (typeof content !== "string" || !content.trim()) {
    throw new APIError("empty", FRIENDLY.empty, { retryable: true });
  }
  return content;
}

// ─── Providers ───────────────────────────────────────────────
function chatBody(model, systemPrompt, userMessage) {
  return JSON.stringify({
    model,
    max_tokens: 1800,
    temperature: 0.75,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage  },
    ],
  });
}

async function callGroq(apiKey, systemPrompt, userMessage) {
  const data = await fetchJSON("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: chatBody("llama-3.3-70b-versatile", systemPrompt, userMessage),
  });
  return extractChatContent(data);
}

async function callOpenAI(apiKey, systemPrompt, userMessage) {
  const data = await fetchJSON("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: chatBody("gpt-4o-mini", systemPrompt, userMessage),
  });
  return extractChatContent(data);
}

async function callGemini(apiKey, systemPrompt, userMessage) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const data = await fetchJSON(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: 1800 },
    }),
  });
  return extractGeminiContent(data);
}

const PROVIDERS = { groq: callGroq, gemini: callGemini, openai: callOpenAI };

// ─── Public entry point ──────────────────────────────────────
/**
 * callAPI(apiKey, systemPrompt, userMessage, opts?) → Promise<string>
 * opts.onRetry(err, attempt, delayMs) — surface backoff to the UI.
 * Always rejects with an APIError carrying a user-presentable message.
 */
export async function callAPI(apiKey, systemPrompt, userMessage, opts = {}) {
  const key = (apiKey || "").trim();
  if (!key) throw new APIError("auth", "API key is required.");
  const provider = detectProvider(key);
  const call = PROVIDERS[provider];
  if (!call) throw new APIError("config", "Unknown provider: " + provider);
  return withRetry(() => call(key, systemPrompt, userMessage), opts.onRetry);
}
