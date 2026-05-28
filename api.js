// ============================================================
// SOC TRAINER v3.0 — Gemini API Module
// ============================================================

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH",        threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT",  threshold: "BLOCK_NONE" },
];

export async function callGemini(apiKey, systemPrompt, userMessage) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Gemini API key is required. Get one free at aistudio.google.com.");
  }

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents:          [{ parts: [{ text: userMessage  }] }],
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature:     0.75,
      topP:            0.95,
      maxOutputTokens: 1500,
    },
  };

  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey.trim()}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new Error("Network error — check your internet connection.");
  }

  const data = await response.json();

  if (!response.ok) {
    // Show the raw status + full message so we can diagnose exactly what's wrong
    const msg = data?.error?.message || response.statusText || "Unknown error";
    throw new Error(`[${response.status}] ${msg}`);
  }

  const candidate = data?.candidates?.[0];

  if (!candidate) {
    throw new Error("No response generated. The safety filter may have blocked it.");
  }

  if (candidate.finishReason === "SAFETY") {
    throw new Error("Response blocked by Gemini safety filter. Try again.");
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from API.");

  return text;
}
