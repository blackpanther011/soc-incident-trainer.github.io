// ============================================================
// SOC TRAINER v3.0 — API Module
// To switch provider: change PROVIDER constant below.
// "gemini" | "claude" | "openai"
// ============================================================

const PROVIDER = "claude";

async function callGemini(apiKey, systemPrompt, userMessage) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  const response = await fetch(`${endpoint}?key=${apiKey.trim()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT",       threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
      generationConfig: { temperature: 0.75, maxOutputTokens: 1500 },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("[" + response.status + "] " + (data?.error?.message || response.statusText));
  return data.candidates[0].content.parts[0].text;
}

async function callClaude(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("[" + response.status + "] " + (data?.error?.message || response.statusText));
  return data.content[0].text;
}

async function callOpenAI(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey.trim(),
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      temperature: 0.75,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("[" + response.status + "] " + (data?.error?.message || response.statusText));
  return data.choices[0].message.content;
}

export async function callAPI(apiKey, systemPrompt, userMessage) {
  if (!apiKey || !apiKey.trim()) throw new Error("API key is required.");
  try {
    if (PROVIDER === "gemini") return await callGemini(apiKey, systemPrompt, userMessage);
    if (PROVIDER === "claude") return await callClaude(apiKey, systemPrompt, userMessage);
    if (PROVIDER === "openai") return await callOpenAI(apiKey, systemPrompt, userMessage);
    throw new Error("Unknown provider: " + PROVIDER);
  } catch (err) {
    if (err.message.includes("Failed to fetch")) throw new Error("Network error — check your connection.");
    throw err;
  }
}
