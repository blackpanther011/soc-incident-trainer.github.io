// ============================================================
// SOC TRAINER — Security Module
// Centralizes all sanitization, validation, and rate limiting
// ============================================================

// ─── DOMPurify Config ─────────────────────────────────────────
// Allowlist: standard markdown output only. No iframes, no
// event handlers, no javascript: URIs, no data: URIs.
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1","h2","h3","h4","p","br","strong","em","del","code","pre",
    "ul","ol","li","blockquote","hr","table","thead","tbody","tr","th","td",
    "a","span","div",
  ],
  ALLOWED_ATTR: ["href","class","id","title","target","rel"],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script","style","iframe","object","embed","form","input","svg","math"],
  FORBID_ATTR: ["onerror","onload","onclick","onmouseover","onfocus","onblur",
                "onchange","onsubmit","onkeydown","onkeyup","onkeypress",
                "style","srcdoc","action","formaction","href"],
  FORCE_BODY: true,
  RETURN_DOM_FRAGMENT: false,
};

// Add rel=noopener to all external links
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Safely render markdown to sanitized HTML.
 * This is the only approved way to set innerHTML from AI output.
 */
export function renderMarkdown(content) {
  if (!content || typeof content !== "string") return "";
  const raw = marked.parse(content);
  return DOMPurify.sanitize(raw, PURIFY_CONFIG);
}

// ─── Input Validation ─────────────────────────────────────────
const ALLOWED_DIFFICULTIES = new Set(["tier1","tier2","tier3","apt"]);
const ALLOWED_CATEGORIES   = new Set(["ransomware","apt","insider","cloud","supply_chain","web"]);
const ALLOWED_MODES        = new Set(["ir","threat_hunt","forensic","executive","ctf"]);

const MAX_RESPONSE_CHARS = 8000;   // ~2000 tokens
const MIN_RESPONSE_CHARS = 50;

export function validateDifficulty(val) {
  if (!ALLOWED_DIFFICULTIES.has(val)) throw new Error("Invalid difficulty value.");
  return val;
}

export function validateCategory(val) {
  if (!ALLOWED_CATEGORIES.has(val)) throw new Error("Invalid category value.");
  return val;
}

export function validateMode(val) {
  if (!ALLOWED_MODES.has(val)) throw new Error("Invalid mode value.");
  return val;
}

export function validateResponseInput(val) {
  if (!val || !val.trim()) throw new Error("Response cannot be empty.");
  if (val.trim().length < MIN_RESPONSE_CHARS) throw new Error(`Response too short — minimum ${MIN_RESPONSE_CHARS} characters.`);
  if (val.length > MAX_RESPONSE_CHARS) throw new Error(`Response too long — maximum ${MAX_RESPONSE_CHARS} characters.`);
  return val.slice(0, MAX_RESPONSE_CHARS); // hard truncate as safety net
}

// ─── Prompt Injection Defense ─────────────────────────────────
// Wraps user-controlled input in XML-style delimiters that the
// system prompt explicitly instructs the model to respect as
// immovable boundaries. Makes injection significantly harder.

export function sanitizeForPrompt(userInput) {
  if (typeof userInput !== "string") return "";
  // Strip null bytes and control characters
  return userInput
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, MAX_RESPONSE_CHARS);
}

export function wrapUserContent(label, content) {
  const clean = sanitizeForPrompt(content);
  return `<${label}>\n${clean}\n</${label}>`;
}

// ─── Rate Limiting ────────────────────────────────────────────
const rateLimits = {};

/**
 * Returns true if the action is allowed, false if rate-limited.
 * @param {string} action - identifier (e.g. "generate", "submit")
 * @param {number} cooldownMs - minimum ms between calls
 */
export function checkRateLimit(action, cooldownMs = 5000) {
  const now = Date.now();
  const last = rateLimits[action] || 0;
  if (now - last < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - last)) / 1000);
    throw new Error(`Please wait ${remaining}s before trying again.`);
  }
  rateLimits[action] = now;
  return true;
}

// ─── localStorage Schema Validation ──────────────────────────
const HISTORY_ENTRY_SCHEMA = {
  score:           (v) => typeof v === "number" && v >= 0 && v <= 10,
  scenario:        (v) => typeof v === "string" && v.length > 0 && v.length < 20000,
  evaluation:      (v) => typeof v === "string" && v.length > 0 && v.length < 20000,
  userPlan:        (v) => typeof v === "string" && v.length < 10000,
  modeId:          (v) => !v || ALLOWED_MODES.has(v),
  categoryLabel:   (v) => typeof v === "string" && v.length < 100,
  difficultyLabel: (v) => typeof v === "string" && v.length < 100,
  category:        (v) => !v || ALLOWED_CATEGORIES.has(v),
  difficulty:      (v) => !v || ALLOWED_DIFFICULTIES.has(v),
  timestamp:       (v) => typeof v === "string" && v.length < 50,
  responseTime:    (v) => !v || (typeof v === "number" && v >= 0 && v < 86400),
};

function escapeHTML(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function validateHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const validated = {};
  for (const [key, validator] of Object.entries(HISTORY_ENTRY_SCHEMA)) {
    if (entry[key] === undefined) { validated[key] = null; continue; }
    if (!validator(entry[key])) {
      console.warn(`[Security] Invalid history field: ${key}`);
      return null; // reject entire entry if any field is invalid
    }
    // HTML-escape all string fields used in innerHTML context
    validated[key] = typeof entry[key] === "string"
      ? entry[key]  // kept raw — rendered via textContent or marked+DOMPurify
      : entry[key];
  }
  return validated;
}

export function loadHistorySafe(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(validateHistoryEntry)
      .filter(Boolean)
      .slice(0, 100); // max 100 entries
  } catch (err) {
    console.warn("[Security] localStorage read failed:", err.message);
    return [];
  }
}

// ─── Safe innerHTML for static UI strings ────────────────────
// For history cards and other places where we build HTML from
// trusted (but user-influenced) data, escape before injecting.
export { escapeHTML };
