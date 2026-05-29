// ============================================================
// SOC TRAINER v3.0 — Core Application
// ============================================================

import { callAPI } from "./api.js";
import {
  buildScenarioPrompt,
  buildEvaluationPrompt,
  buildEvaluationMessage,
  DIFFICULTY_LABELS,
  CATEGORY_LABELS,
  RESPONSE_MODES,
} from "./prompts.js";

// ─── State ────────────────────────────────────────────────────
const state = {
  currentScenario:   null,
  currentDifficulty: "tier2",
  currentCategory:   "ransomware",
  currentMode:       null,
  sessionHistory:    [],
  hintsUsed:         0,
  maxHints:          3,
};

// ─── DOM ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const els = {
  apiKey:          $("apiKey"),
  difficulty:      $("difficulty"),
  category:        $("category"),
  generateBtn:     $("generateBtn"),
  scenarioOutput:  $("scenarioOutput"),
  scenarioBadge:   $("scenarioBadge"),
  timerDisplay:    $("timerDisplay"),
  modeGrid:        $("modeGrid"),
  modePanel:       $("modePanel"),
  modeHintText:    $("modeHintText"),
  guidePanel:      $("guidePanel"),
  guideIcon:       $("guideIcon"),
  guideTitle:      $("guideTitle"),
  guideBody:       $("guideBody"),
  toggleGuide:     $("toggleGuide"),
  responseInput:   $("responseInput"),
  responseTitle:   $("responseTitle"),
  charCount:       $("charCount"),
  modeLabel:       $("modeLabel"),
  frameworkToggle: $("frameworkToggle"),
  submitBtn:       $("submitBtn"),
  evaluationOutput:$("evaluationOutput"),
  scoreDisplay:    $("scoreDisplay"),
  scoreRing:       $("scoreRing"),
  scoreNumber:     $("scoreNumber"),
  historyList:     $("historyList"),
  sessionCount:    $("sessionCount"),
  avgScore:        $("avgScore"),
  bestScore:       $("bestScore"),
  exportBtn:       $("exportBtn"),
  clearBtn:        $("clearBtn"),
  toast:           $("toast"),
  topbarMode:      $("topbarMode"),
  hintBtn:         $("hintBtn"),
  hintCount:       $("hintCount"),
};

// ─── Timer ────────────────────────────────────────────────────
let timerInterval = null;
let timerSeconds  = 0;
function startTimer() {
  stopTimer(); timerSeconds = 0;
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = String(Math.floor(timerSeconds / 60)).padStart(2,"0");
    const s = String(timerSeconds % 60).padStart(2,"0");
    els.timerDisplay.textContent = `${m}:${s}`;
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = "info") {
  els.toast.textContent = msg;
  els.toast.className = `toast toast-${type} show`;
  setTimeout(() => els.toast.classList.remove("show"), 3500);
}

// ─── Char Counter ─────────────────────────────────────────────
els.responseInput.addEventListener("input", () => {
  const len = els.responseInput.value.length;
  els.charCount.textContent = `${len.toLocaleString()} chars`;
  els.charCount.style.color =
    len < 100 ? "var(--danger)" :
    len < 300 ? "var(--warning)" : "var(--success)";
});

// ─── Mode Grid ────────────────────────────────────────────────
function buildModeGrid() {
  els.modeGrid.innerHTML = Object.values(RESPONSE_MODES).map(mode => `
    <button class="mode-card ${state.currentScenario ? "" : "mode-card-locked"}"
            data-mode="${mode.id}"
            ${state.currentScenario ? "" : "disabled"}
            style="--mode-color: ${mode.color}">
      <span class="mode-card-icon">${mode.icon}</span>
      <span class="mode-card-label">${mode.label}</span>
      <span class="mode-card-desc">${mode.shortDesc}</span>
    </button>
  `).join("");

  els.modeGrid.querySelectorAll(".mode-card").forEach(btn => {
    btn.addEventListener("click", () => selectMode(btn.dataset.mode));
  });
}

function selectMode(modeId) {
  state.currentMode = modeId;
  const mode = RESPONSE_MODES[modeId];

  // Update mode cards UI
  els.modeGrid.querySelectorAll(".mode-card").forEach(btn => {
    btn.classList.toggle("mode-card-active", btn.dataset.mode === modeId);
  });

  // Update topbar
  els.topbarMode.textContent = `${mode.icon} ${mode.label}`;
  els.topbarMode.style.color = mode.color;

  // Show + populate guide
  els.guidePanel.classList.remove("hidden");
  els.guideIcon.textContent  = mode.icon;
  els.guideTitle.textContent = `${mode.label} — Writing Guide`;
  els.guideBody.innerHTML = mode.guide.map(item => `
    <div class="guide-item">
      <div class="guide-item-head">
        <span class="guide-item-tag" style="background:${mode.color}20;color:${mode.color};border-color:${mode.color}40">${item.heading}</span>
      </div>
      <p class="guide-item-hint">${item.hint}</p>
    </div>
  `).join("");

  // Update response panel
  els.responseTitle.textContent = `Your ${mode.label}`;
  els.modeLabel.textContent     = `${mode.icon} ${mode.label}`;
  els.modeLabel.style.color     = mode.color;
  els.responseInput.disabled    = false;
  els.submitBtn.disabled        = false;
  els.responseInput.value       = "";
  els.responseInput.dispatchEvent(new Event("input"));
  els.responseInput.focus();

  // Update placeholder based on mode
  const placeholders = {
    ir:           "Draft your Incident Response Plan…\n\nStart with immediate Containment steps, then Eradication, Recovery, and Communication. Reference the writing guide above for what to cover in each phase.",
    threat_hunt:  "Draft your Threat Hunt…\n\nStart with your hypothesis, then describe which data sources you'll query, the logic of your queries, and how you'll pivot on findings.",
    forensic:     "Draft your Forensic Investigation plan…\n\nStart with evidence preservation (order of volatility), then list artifacts to collect, how you'll build a timeline, and your malware analysis approach.",
    executive:    "Draft your Executive Briefing…\n\nWrite as if presenting to a CFO or Board. No jargon. Lead with business impact, current status (RAG), actions taken, and what decisions you need from them.",
    ctf:          "Hunt for flags…\n\nList every IOC you can extract from the scenario, reconstruct the full attack chain, map to MITRE ATT&CK technique IDs, and answer the key questions in the scenario.",
  };
  els.responseInput.placeholder = placeholders[modeId] || "Draft your response here…";

  showToast(`Mode: ${mode.label}`, "info");
}

// ─── Guide Toggle ─────────────────────────────────────────────
els.toggleGuide.addEventListener("click", () => {
  const body = els.guideBody;
  const hidden = body.style.display === "none";
  body.style.display = hidden ? "" : "none";
  els.toggleGuide.textContent = hidden ? "Hide Guide" : "Show Guide";
});

// ─── Framework Template ───────────────────────────────────────
const TEMPLATES = {
  ir: `## CONTAINMENT
### Immediate (0–4 hours):
- 

### Long-term Containment:
- 

## ERADICATION
### Root Cause Removal:
- 

### Verification:
- 

## RECOVERY
### Restoration Steps:
- 

### Post-Recovery Monitoring:
- 

## COMMUNICATION
### Internal Stakeholders:
- 

### External / Regulatory:
- 

## POST-INCIDENT
### Root Cause Summary:
### Lessons Learned:
### Detection Gaps:`,

  threat_hunt: `## HYPOTHESIS
Threat actor is [doing X] based on [observed evidence Y].

## DATA SOURCES
- 
- 

## HUNT QUERIES
### Query 1:
Logic: 

### Query 2:
Logic: 

## PIVOT POINTS
- IOC 1 → pivot to:
- IOC 2 → pivot to:

## SCOPE ASSESSMENT
### Compromised Hosts:
### Compromised Accounts:
### Data Repositories at Risk:`,

  forensic: `## EVIDENCE PRESERVATION
### Order of Volatility:
1. 
2. 
3. 

### Chain of Custody:
- Collected by:
- Date/Time:
- Hash verification:

## ARTIFACT COLLECTION
### Windows Artifacts:
- 
### Network Artifacts:
- 

## TIMELINE RECONSTRUCTION
| Timestamp | Event | Source |
|---|---|---|
|  |  |  |

## MALWARE ANALYSIS
### Static Analysis:
### Dynamic Analysis:

## CONCLUSIONS
### Root Cause:
### Attribution Confidence:`,

  executive: `## SITUATION SUMMARY
[2–3 sentences. What happened, when, what systems affected. No jargon.]

## BUSINESS IMPACT
- Affected systems:
- Estimated downtime:
- Data exposure:
- Regulatory implications:
- Revenue impact estimate:

## CURRENT STATUS
🔴 RED / 🟡 AMBER / 🟢 GREEN

[One sentence explaining current risk level]

## ACTIONS TAKEN
- 
- 

## NEXT STEPS & DECISIONS REQUIRED
- [ ] Decision needed:
- [ ] Budget approval needed:
- [ ] Legal counsel engagement:`,

  ctf: `## IOC EXTRACTION
### IP Addresses:
### Domains / URLs:
### File Hashes:
### File Paths:
### Registry Keys:
### Usernames / Accounts:
### CVEs / Exploits:

## ATTACK CHAIN
1. Initial Access:
2. Execution:
3. Persistence:
4. Privilege Escalation:
5. Lateral Movement:
6. Collection:
7. Exfiltration:

## MITRE ATT&CK MAPPING
| Technique ID | Name | Evidence |
|---|---|---|
|  |  |  |

## CRITICAL ANSWERS
- Patient Zero:
- Initial Vector:
- First Malicious Action (timestamp):
- Data Accessed/Exfiltrated:
- C2 Infrastructure:
- Total Dwell Time:

## RED HERRINGS IDENTIFIED
-`,
};

els.frameworkToggle.addEventListener("click", () => {
  if (!state.currentMode) { showToast("Select a response mode first.", "error"); return; }
  const template = TEMPLATES[state.currentMode] || "";
  if (els.responseInput.value.trim() && els.responseInput.value !== template) {
    if (!confirm("Replace current notes with template?")) return;
  }
  els.responseInput.value = template;
  els.responseInput.dispatchEvent(new Event("input"));
});

// ─── Hints ────────────────────────────────────────────────────
const HINTS = {
  ransomware:   ["Check vssadmin and wmic for shadow copy deletion commands — these are almost always part of ransomware pre-encryption.", "Look at network shares — ransomware typically encrypts mapped drives. Check which users had share access.", "Search for staging directories — ransomware often exfiltrates before encrypting. Look for unusual ZIP or RAR creation events."],
  apt:          ["Long-term C2 beaconing often uses jitter to avoid detection. Look for periodic outbound connections with slight timing variations.", "Check WMI event subscriptions and scheduled tasks — APT groups love persistence via these mechanisms.", "Look at DNS queries — DGA (Domain Generation Algorithm) C2 creates high-volume failed DNS lookups."],
  insider:      ["Cloud storage sync tools (OneDrive, Dropbox, Google Drive) running outside business hours is a key indicator.", "DLP alerts alone aren't enough — correlate with badge access logs and VPN data to build the full picture.", "Check print logs and USB device connection events in Windows — physical exfiltration is often overlooked."],
  cloud:        ["Cloudtrail / Audit logs: look for GetSecretValue, AssumeRole, and CreateAccessKey calls from unusual IPs.", "Check for new IAM users or roles created — attackers often create backdoor accounts immediately after gaining access.", "Look for S3 GetObject calls in bulk, especially from IPs not in your organization's normal egress range."],
  supply_chain: ["Compare the hash of the software binary against the vendor's published hash on their website.", "Legitimate software doing network calls to unknown domains is the biggest red flag in supply chain attacks.", "Check the digital signature — valid certificate but from an unexpected issuer is a major warning sign."],
  web:          ["Check web server logs for the exact request that triggered the alert — the payload is often visible in the URL or POST body.", "Web shells usually have file names that look legitimate (info.php, admin.aspx) — look for recently created PHP/ASPX files.", "After a web shell is planted, look for child processes spawned by the web server process (w3wp.exe, httpd, nginx)."],
};

els.hintBtn.addEventListener("click", () => {
  const hints = HINTS[state.currentCategory] || [];
  if (state.hintsUsed >= hints.length) { showToast("No more hints available.", "info"); return; }
  const hint = hints[state.hintsUsed];
  state.hintsUsed++;
  els.hintCount.textContent = state.maxHints - state.hintsUsed;
  showToast(`💡 Hint: ${hint}`, "info");
  if (state.hintsUsed >= hints.length) els.hintBtn.disabled = true;
});

// ─── Score Ring ───────────────────────────────────────────────
function animateScore(score) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 10) * circumference;
  const color = score >= 8 ? "var(--success)" : score >= 5 ? "var(--warning)" : "var(--danger)";
  els.scoreRing.style.strokeDasharray  = `${circumference}`;
  els.scoreRing.style.strokeDashoffset = `${circumference}`;
  els.scoreRing.style.stroke           = color;
  els.scoreNumber.style.color          = color;
  els.scoreDisplay.classList.remove("hidden");
  requestAnimationFrame(() => {
    els.scoreRing.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)";
    els.scoreRing.style.strokeDashoffset = `${offset}`;
  });
  let current = 0;
  const step = score / 30;
  const counter = setInterval(() => {
    current = Math.min(current + step, score);
    els.scoreNumber.textContent = current.toFixed(1);
    if (current >= score) { els.scoreNumber.textContent = score; clearInterval(counter); }
  }, 40);
}

// ─── Stats ────────────────────────────────────────────────────
function updateStats() {
  const h = state.sessionHistory;
  els.sessionCount.textContent = h.length;
  if (!h.length) { els.avgScore.textContent = "—"; els.bestScore.textContent = "—"; return; }
  const scores = h.map(x => x.score);
  els.avgScore.textContent  = (scores.reduce((a,b) => a+b,0)/scores.length).toFixed(1);
  els.bestScore.textContent = Math.max(...scores);
}

// ─── History ──────────────────────────────────────────────────
function addHistoryEntry(entry) {
  state.sessionHistory.unshift(entry);
  updateStats();
  renderHistory();
  try { localStorage.setItem("soc_trainer_history", JSON.stringify(state.sessionHistory)); } catch(_) {}
}

function renderHistory() {
  if (!state.sessionHistory.length) {
    els.historyList.innerHTML = `<div class="history-empty">No sessions yet.</div>`;
    return;
  }
  els.historyList.innerHTML = state.sessionHistory.map((e, i) => {
    const cls = e.score >= 8 ? "score-high" : e.score >= 5 ? "score-mid" : "score-low";
    const mode = RESPONSE_MODES[e.modeId];
    return `<div class="history-item" data-idx="${i}">
      <div class="history-meta">
        <span class="history-cat">${e.categoryLabel}</span>
        ${mode ? `<span class="history-mode-badge" style="color:${mode.color}">${mode.icon}</span>` : ""}
      </div>
      <div class="history-diff">${e.difficultyLabel}</div>
      <div class="history-bottom">
        <span class="history-time">${e.timestamp}</span>
        <span class="history-score ${cls}">${e.score}/10</span>
      </div>
    </div>`;
  }).join("");

  els.historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const entry = state.sessionHistory[parseInt(el.dataset.idx)];
      els.scenarioOutput.innerHTML   = marked.parse(entry.scenario);
      els.evaluationOutput.innerHTML = marked.parse(entry.evaluation);
      animateScore(entry.score);
      if (entry.modeId) selectMode(entry.modeId);
      showToast("Loaded past session", "info");
    });
  });
}

function loadHistory() {
  try {
    const saved = localStorage.getItem("soc_trainer_history");
    if (saved) { state.sessionHistory = JSON.parse(saved); updateStats(); renderHistory(); }
  } catch(_) {}
}

// ─── Export ───────────────────────────────────────────────────
els.exportBtn.addEventListener("click", () => {
  if (!state.currentScenario) { showToast("No active session to export.", "error"); return; }
  const e = state.sessionHistory[0];
  const mode = state.currentMode ? RESPONSE_MODES[state.currentMode] : null;
  const content = [
    `# SOC TRAINER — SESSION EXPORT`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Difficulty:** ${DIFFICULTY_LABELS[state.currentDifficulty]}`,
    `**Category:** ${CATEGORY_LABELS[state.currentCategory]}`,
    mode ? `**Response Mode:** ${mode.icon} ${mode.label}` : "",
    e?.score ? `**Score:** ${e.score}/10` : "",
    `\n---\n`,
    `## SCENARIO\n\n${state.currentScenario}`,
    e?.userPlan    ? `\n---\n\n## YOUR RESPONSE\n\n${e.userPlan}` : "",
    e?.evaluation  ? `\n---\n\n## EVALUATION\n\n${e.evaluation}` : "",
  ].join("\n");
  const blob = new Blob([content], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `soc-session-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Session exported.", "success");
});

els.clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all history?")) return;
  state.sessionHistory = [];
  localStorage.removeItem("soc_trainer_history");
  updateStats(); renderHistory();
  showToast("History cleared.", "info");
});

// ─── Generate ─────────────────────────────────────────────────
els.generateBtn.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) { showToast("Enter your API key first.", "error"); els.apiKey.focus(); return; }

  state.currentDifficulty = els.difficulty.value;
  state.currentCategory   = els.category.value;
  state.currentMode       = null;
  state.hintsUsed         = 0;

  els.generateBtn.disabled   = true;
  els.generateBtn.innerHTML  = `<span class="btn-spinner"></span> Generating...`;
  els.scenarioOutput.innerHTML = `<div class="loading-pulse"><div class="pulse-line w80"></div><div class="pulse-line w60"></div><div class="pulse-line w90"></div><div class="pulse-line w50"></div><div class="pulse-line w70"></div></div>`;
  els.scenarioBadge.textContent = "GENERATING...";
  els.scenarioBadge.className   = "badge badge-warning";
  els.scoreDisplay.classList.add("hidden");

  // Reset mode/response/evaluation
  els.topbarMode.textContent      = "No mode selected";
  els.topbarMode.style.color      = "";
  els.guidePanel.classList.add("hidden");
  els.responseInput.disabled      = true;
  els.responseInput.value         = "";
  els.submitBtn.disabled          = true;
  els.evaluationOutput.innerHTML  = `<div class="eval-idle"><div class="eval-idle-icon">⌛</div><p>Select a mode and submit your response.</p></div>`;
  els.modeHintText.textContent    = "Choose how you want to respond to this incident";

  try {
    const scenario = await callAPI(apiKey, buildScenarioPrompt(state.currentDifficulty, state.currentCategory), "Generate a new incident response scenario now.");
    state.currentScenario = scenario;
    els.scenarioOutput.innerHTML  = marked.parse(scenario);
    els.scenarioBadge.textContent = "ACTIVE INCIDENT";
    els.scenarioBadge.className   = "badge badge-danger";

    // Enable mode grid
    buildModeGrid();
    els.hintBtn.classList.remove("hidden");
    els.hintCount.textContent = state.maxHints;
    els.hintBtn.disabled      = false;
    els.modeHintText.textContent = "Pick a mode to begin — the writing guide will appear automatically";

    startTimer();
    showToast("Incident generated. Select a response mode to begin.", "success");

  } catch(err) {
    els.scenarioOutput.innerHTML  = `<div class="error-state">⚠ ${err.message}</div>`;
    els.scenarioBadge.textContent = "ERROR";
    els.scenarioBadge.className   = "badge badge-danger";
    showToast(err.message, "error");
  } finally {
    els.generateBtn.disabled   = false;
    els.generateBtn.innerHTML  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Generate Incident`;
  }
});

// ─── Submit ───────────────────────────────────────────────────
els.submitBtn.addEventListener("click", async () => {
  const apiKey  = els.apiKey.value.trim();
  const userPlan = els.responseInput.value.trim();

  if (!state.currentMode) { showToast("Select a response mode first.", "error"); return; }
  if (!userPlan)           { showToast("Write a response before submitting.", "error"); return; }
  if (userPlan.length < 50){ showToast("Response too short — add more detail.", "error"); return; }

  stopTimer();

  els.submitBtn.disabled     = true;
  els.responseInput.disabled = true;
  els.submitBtn.innerHTML    = `<span class="btn-spinner"></span> Evaluating...`;
  els.evaluationOutput.innerHTML = `<div class="loading-pulse"><div class="pulse-line w70"></div><div class="pulse-line w90"></div><div class="pulse-line w50"></div><div class="pulse-line w80"></div><div class="pulse-line w60"></div></div>`;

  try {
    const evaluation = await callAPI(
      apiKey,
      buildEvaluationPrompt(state.currentMode),
      buildEvaluationMessage(state.currentScenario, userPlan, state.currentMode)
    );

    els.evaluationOutput.innerHTML = marked.parse(evaluation);

    const scoreMatch = evaluation.match(/##\s+Score:\s+(\d+(?:\.\d+)?)\/10/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

    if (score !== null) {
      animateScore(score);
      addHistoryEntry({
        score,
        scenario:        state.currentScenario,
        evaluation,
        userPlan,
        modeId:          state.currentMode,
        categoryLabel:   CATEGORY_LABELS[state.currentCategory],
        difficultyLabel: DIFFICULTY_LABELS[state.currentDifficulty],
        timestamp:       new Date().toLocaleTimeString(),
      });
      const verdict = score >= 8 ? "Excellent work." : score >= 5 ? "Needs improvement." : "Critical failures detected.";
      showToast(`Score: ${score}/10 — ${verdict}`, score >= 7 ? "success" : "error");
    }

    els.scenarioBadge.textContent = "EVALUATED";
    els.scenarioBadge.className   = "badge badge-neutral";

  } catch(err) {
    els.evaluationOutput.innerHTML = `<div class="error-state">⚠ ${err.message}</div>`;
    showToast(err.message, "error");
  } finally {
    els.submitBtn.disabled     = false;
    els.responseInput.disabled = false;
    els.submitBtn.innerHTML    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Submit for Evaluation`;
  }
});

// ─── Init ─────────────────────────────────────────────────────
buildModeGrid();
loadHistory();

const savedKey = sessionStorage.getItem("soc_api_key");
if (savedKey) els.apiKey.value = savedKey;
els.apiKey.addEventListener("change", () => sessionStorage.setItem("soc_api_key", els.apiKey.value));

els.difficulty.addEventListener("change", () => state.currentDifficulty = els.difficulty.value);
els.category.addEventListener("change",   () => state.currentCategory   = els.category.value);
