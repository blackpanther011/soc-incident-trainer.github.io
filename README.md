# SOC Trainer v3.0

**A free, open-source incident response practice platform for cybersecurity analysts.**

Generate hyper-realistic SOC scenarios, draft your response plan, and get brutally honest AI evaluation — all in your browser, with no backend required.

---

## Screenshot

> *Dark industrial command-center UI with three-panel layout: scenario intel, response plan, and AI evaluation with animated score ring.*

---

## What It Does

Most IR practice tools are either too theoretical (textbooks) or too expensive (enterprise simulators). SOC Trainer solves this with:

- **AI-generated scenarios** with real IOCs, actual Event IDs, MITRE ATT&CK technique IDs, and business constraints that make decisions hard
- **Structured evaluation** against NIST SP 800-61 with actionable, no-nonsense feedback
- **Session history** with score tracking persisted to localStorage
- **Export** sessions as Markdown for portfolio documentation
- **Free forever** — you only need a free Gemini API key

---

## Features

| Feature | Details |
|---|---|
| **4 Difficulty Tiers** | Tier 1 (Junior) → APT (Nation-State) |
| **6 Incident Categories** | Ransomware, APT, Insider, Cloud, Supply Chain, Web App |
| **Framework Template** | NIST SP 800-61 + MITRE ATT&CK structured response scaffold |
| **Live Timer** | Tracks your response time per scenario |
| **Animated Score Ring** | Visual score out of 10 with color-coded performance |
| **Session History** | Persisted locally — click any past session to reload it |
| **Export** | Download session as `.md` for your portfolio or study notes |
| **No Backend** | Pure HTML/CSS/JS — runs from a file or any static host |

---

## Getting Started

### 1. Get a Free Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key (starts with `AIzaSy...`)

No credit card required. The free tier is sufficient for extensive practice.

### 2. Run the App

**Option A — Open directly (simplest):**
```bash
git clone https://github.com/YOUR_USERNAME/soc-trainer.git
cd soc-trainer
# Open index.html in your browser
```
> Note: ES module imports (`import`/`export`) require a local server or a modern browser with file:// module support. If you see a CORS error, use Option B.

**Option B — Local dev server (recommended):**
```bash
# Using Python (no install needed)
cd soc-trainer
python3 -m http.server 8080
# Open http://localhost:8080
```

```bash
# Using Node.js (if you have it)
npx serve .
```

**Option C — Deploy to GitHub Pages (free hosting):**
1. Fork this repo
2. Go to **Settings → Pages**
3. Set source to `main` branch, root `/`
4. Your app is live at `https://YOUR_USERNAME.github.io/soc-trainer`

---

## File Structure

```
soc-trainer/
├── index.html    # App shell and layout
├── style.css     # Full UI stylesheet
├── app.js        # Core logic, state management, DOM
├── api.js        # Gemini API integration layer
├── prompts.js    # All prompt engineering (scenarios + evaluation)
└── README.md     # This file
```

The architecture is intentionally separated so each module can be modified independently:

- **To change the AI provider** → edit `api.js` only
- **To improve prompt quality** → edit `prompts.js` only
- **To add UI features** → edit `app.js` + `index.html` + `style.css`

---

## Prompt Engineering Design

### Scenario Generation
The scenario prompt forces the AI to produce:
- Real observable data (not placeholders)
- Difficulty-scaled complexity (commodity malware → nation-state TTPs)
- Business constraints that create realistic tradeoff decisions
- Red herrings for ambiguity
- MITRE ATT&CK technique IDs with every behavior

### Evaluation Scoring
The evaluation prompt scores against **NIST SP 800-61** with a rubric:

| Score | Meaning |
|---|---|
| 9–10 | All phases covered, specific, proactive hunting mentioned |
| 7–8  | Solid with minor gaps |
| 5–6  | Core phases present but vague |
| 3–4  | Significant gaps, would likely fail containment |
| 1–2  | Dangerous — would destroy evidence or tip off attacker |

Feedback always includes: Strengths, Critical Failures, Missing Actions, Actionable Improvement, and "The One Thing That Would Have Gotten You Fired."

---

## Switching to a Different AI Provider

The `api.js` module is the only file to change. The function signature is:

```javascript
callGemini(apiKey, systemPrompt, userMessage) → Promise<string>
```

**OpenAI (GPT-4o-mini):**
```javascript
export async function callGemini(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
      temperature: 0.75,
      max_tokens: 1500,
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}
```

**Anthropic Claude (claude-haiku-4-5):**
```javascript
export async function callGemini(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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
  return data.content[0].text;
}
```

---

## Contributing

Pull requests welcome. Particularly useful contributions:

- Additional difficulty tiers or incident categories (new `prompts.js` entries)
- MITRE ATT&CK structured input validation
- Multiplayer/team mode (requires a backend)
- Offline mode with a local LLM (Ollama integration)

---

## License

MIT — use freely, fork freely, deploy freely.

---

## Built By

**Elijah** — Data Analyst & Analytics Engineer, Lagos, Nigeria.  
Built as a portfolio piece to demonstrate AI-integrated application development, prompt engineering, and frontend engineering.

*If this helped your IR practice, star the repo.*
