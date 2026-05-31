# SOC Trainer — Incident Command

**An AI-powered incident-response range for cybersecurity analysts.** Generate hyper-realistic SOC incidents, work them in a war-room console, and get brutally honest AI evaluation against NIST SP 800-61 and MITRE ATT&CK — entirely in the browser, no backend required.

> Runs instantly in **Demo Mode** with zero setup. Add a free API key for live AI generation and grading.

---

## Why this exists

Most IR practice tools are either too theoretical (textbooks) or too expensive (enterprise cyber ranges). SOC Trainer sits in the middle: realistic, adaptive incidents with real IOCs, Event IDs, ATT&CK techniques and genuine business constraints — the kind of tradeoffs that make decisions *hard* — wrapped in an interface that feels like a real security operations console.

It's a single-page app. No build step, no framework, no server.

---

## Highlights

- **Three-stage operator flow** — Mission Setup → Analyze & Respond → Evaluation, modelled on a real incident lifecycle.
- **War-room console UI** — live severity gauge, dual incident clock (elapsed + countdown to a business deadline), auto-tracking response objectives, and a live activity log.
- **Five engagement modes** — Incident Response, Threat Hunt, Forensics, Executive Brief, and CTF Hunt — each with its own writing guide, template, and evaluation rubric.
- **Gamified progression** — XP, seven analyst ranks, streaks, and a **skill radar** that charts your average score per mode so you can see exactly what to train next.
- **Demo Mode** — six baked incidents and an adaptive keyword-scored evaluator let the entire flow run with no API key.
- **Bring-your-own-AI** — drop in a free Groq, Gemini, or OpenAI key for live scenario generation and word-by-word grading.
- **Local-first** — XP, ranks, and full session history persist in `localStorage`. Nothing leaves your machine except the direct call to your chosen AI provider.

---

## The flow

| Stage | What happens |
|---|---|
| **01 · Mission Setup** | Choose a threat tier (Junior → Nation-State), an incident class, and your access mode. An operator dossier shows your rank, XP, stats, skill radar, and recent operations. |
| **02 · Analyze & Respond** | The incident goes live. Read the intel feed (alert, process tree, IOCs, ATT&CK mapping, business constraints), pick an engagement mode, and draft your response in a console editor. A severity gauge, countdown clock, objectives checklist, and activity log keep the pressure on. |
| **03 · Evaluation** | Transmit for grading. An animated score gauge, verdict, and XP award land alongside the commander's evaluation — strengths, critical failures, missing actions, and "the one thing that would have gotten you fired." |

---

## Quick start

### Run it instantly (Demo Mode)
No key, no setup. Because the app uses ES modules, serve it over HTTP rather than opening the file directly:

```bash
git clone https://github.com/blackpanther011/soc-trainer.git
cd soc-trainer
python3 -m http.server 8080        # or: npx serve .
# open http://localhost:8080
```

Demo Mode is on by default — click **Initiate Incident** and work a baked scenario end-to-end.

### Enable live AI (optional)
1. Get a **free Groq API key** at [console.groq.com/keys](https://console.groq.com/keys) (no card required). Gemini and OpenAI are also supported.
2. Paste it into the **API Key** field on the Mission Setup screen — Demo Mode switches off automatically.
3. Scenarios and evaluations are now generated live. The key stays in the browser tab and is sent only to the provider you chose.

### Deploy free (GitHub Pages)
1. Push to a public repo.
2. **Settings → Pages →** source `main`, root `/`.
3. Live at `https://blackpanther011.github.io/soc-trainer`.

---

## Project structure

```
soc-trainer/
├── index.html     # App shell — three stages, top HUD, all markup
├── theme.css      # "Incident Command" design system (HUD + SIEM density)
├── app.js         # Core logic: stage flow, gauges, XP/ranks, skill radar, state
├── demo.js        # No-key engine: baked scenarios + adaptive evaluation
├── prompts.js     # Prompt engineering — scenario + evaluation, per mode
├── api.js         # AI provider layer (Groq / Gemini / OpenAI)
├── security.js    # Input validation, rate limiting, markdown sanitization
└── README.md
```

The modules are deliberately decoupled:

- **Swap the AI provider** → edit `api.js` only (one `PROVIDER` constant).
- **Tune scenario or grading quality** → edit `prompts.js` only.
- **Adjust the look** → edit `theme.css` (all design tokens are CSS custom properties).
- **Add UI / mechanics** → `app.js` + `index.html`.

---

## Design

The interface is a deliberate aesthetic: a tense, cinematic **war-room HUD** (atmospheric glow, scanlines, corner brackets, a sweeping radar gauge) grounded by the **data density of a real SIEM** (IOC tables, ATT&CK mapping, a streaming activity log). The palette is ops-coded — cyan for the operator, orange for live threat, green for confirmed/safe, red for critical — and the type system pairs Chakra Petch (HUD), IBM Plex Sans (UI), and JetBrains Mono (data). Every color, font, and spacing value is a CSS variable in `theme.css`.

---

## Prompt engineering

**Scenario generation** forces the model to emit real observable data (never placeholders), difficulty-scaled complexity, business constraints that create genuine tradeoffs, occasional red herrings, and a MITRE ATT&CK ID for every behaviour.

**Evaluation** grades against NIST SP 800-61 with a fixed rubric:

| Score | Meaning |
|---|---|
| 9–10 | All phases covered, specific, proactive hunting |
| 7–8  | Solid with minor gaps |
| 5–6  | Core phases present but vague |
| 3–4  | Significant gaps — would likely fail containment |
| 1–2  | Dangerous — would destroy evidence or tip off the attacker |

In Demo Mode, `demo.js` approximates this with per-mode keyword coverage, structure and length signals, and a difficulty penalty — so feedback feels real without an API call.

---

## Switching AI provider

`api.js` exposes a single function — `callAPI(apiKey, systemPrompt, userMessage) → Promise<string>` — and supports `groq`, `gemini`, and `openai` out of the box. Change the `PROVIDER` constant at the top of the file to switch. Adding another provider is a single `fetch` wrapper following the same signature.

---

## Security notes

- AI output is rendered through a Markdown parser and **sanitized with DOMPurify** before it touches the DOM.
- A **Content-Security-Policy** restricts network connections to the supported AI endpoints only.
- Inputs are validated and lightly rate-limited (`security.js`).
- Your API key lives in memory for the tab session — it is never persisted or sent anywhere except your chosen provider.

---

## Tech

Vanilla **HTML / CSS / JavaScript (ES modules)** — no framework, no build. External libraries are limited to [marked](https://github.com/markedjs/marked) (Markdown) and [DOMPurify](https://github.com/cure53/DOMPurify) (sanitization), loaded from a CDN.

---

## Roadmap

- Hint-costs-XP and time-bonus mechanics for sharper pressure
- Achievement badges (first 9+, clear all classes, APT survivor)
- First-run mission brief overlay
- Offline local-LLM mode (Ollama)

---

## License

MIT — use, fork, and deploy freely.

---

*Built as a portfolio piece demonstrating AI-integrated application development, prompt engineering, and frontend/UX engineering.*
