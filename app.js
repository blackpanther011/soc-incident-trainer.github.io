// ============================================================
// SOC TRAINER v3.0 — Core Application
// 3-step workflow: Configure → Respond → Evaluate
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
import {
  renderMarkdown,
  validateDifficulty,
  validateCategory,
  validateMode,
  validateResponseInput,
  checkRateLimit,
  loadHistorySafe,
  escapeHTML,
} from "./security.js";

// ─── State ────────────────────────────────────────────────────
const state = {
  currentScenario:   null,
  currentDifficulty: "tier2",
  currentCategory:   "ransomware",
  currentMode:       null,
  sessionHistory:    [],
  hintsUsed:         0,
  timerSeconds:      0,
};

// ─── DOM ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// Pages & Nav
const pages    = { 1: $("page1"),  2: $("page2"),  3: $("page3")  };
const navBtns  = { 1: $("nav1"),   2: $("nav2"),   3: $("nav3")   };

// Step 1
const apiKeyEl       = $("apiKey");
const diffGrid       = $("diffGrid");
const catGrid        = $("catGrid");
const diffHint       = $("diffHint");
const generateBtn    = $("generateBtn");
const sessionCount   = $("sessionCount");
const avgScoreEl     = $("avgScore");
const bestScoreEl    = $("bestScore");
const historyList    = $("historyList");
const clearBtn       = $("clearBtn");

// Step 2
const scenarioOutput  = $("scenarioOutput");
const hintBtn         = $("hintBtn");
const hintCount       = $("hintCount");
const modeGrid        = $("modeGrid");
const guideSection    = $("guideSection");
const guideTitle      = $("guideTitle");
const guideBody       = $("guideBody");
const guideToggleHdr  = $("guideToggleHdr");
const guideCollapseBtn= $("guideCollapseBtn");
const responseTitle   = $("responseTitle");
const responseInput   = $("responseInput");
const charCount       = $("charCount");
const frameworkToggle = $("frameworkToggle");
const submitBtn       = $("submitBtn");
const modeActiveLabel = $("modeActiveLabel");

// Step 3
const evaluationOutput= $("evaluationOutput");
const scoreRing       = $("scoreRing");
const scoreNumber     = $("scoreNumber");
const scoreDisplay    = $("scoreDisplay");
const scoreVerdict    = $("scoreVerdict");
const evalMode        = $("evalMode");
const evalCategory    = $("evalCategory");
const evalDifficulty  = $("evalDifficulty");
const evalTime        = $("evalTime");
const tryAgainBtn     = $("tryAgainBtn");
const reReviewBtn     = $("reReviewBtn");
const scenarioRecap   = $("scenarioRecap");
const scenarioRecapHdr= $("scenarioRecapHdr");
const scenarioRecapBtn= $("scenarioRecapBtn");

// Shared
const timerDisplay  = $("timerDisplay");
const scenarioBadge = $("scenarioBadge");
const exportBtn     = $("exportBtn");
const toastEl       = $("toast");

// ─── Page Navigation ──────────────────────────────────────────
function goToPage(n) {
  Object.values(pages).forEach(p => p.classList.remove("page-active"));
  pages[n].classList.add("page-active");

  Object.entries(navBtns).forEach(([k, btn]) => {
    btn.classList.remove("step-active", "step-done");
    const num = parseInt(k);
    if (num < n)      btn.classList.add("step-done");
    else if (num === n) btn.classList.add("step-active");
  });
}

navBtns[1].addEventListener("click", () => goToPage(1));
navBtns[2].addEventListener("click", () => { if (!navBtns[2].disabled) goToPage(2); });
navBtns[3].addEventListener("click", () => { if (!navBtns[3].disabled) goToPage(3); });

// ─── Timer ────────────────────────────────────────────────────
let timerInterval = null;
function startTimer() {
  stopTimer(); state.timerSeconds = 0;
  timerInterval = setInterval(() => {
    state.timerSeconds++;
    const m = String(Math.floor(state.timerSeconds / 60)).padStart(2,"0");
    const s = String(state.timerSeconds % 60).padStart(2,"0");
    timerDisplay.textContent = `${m}:${s}`;
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = "info") {
  toastEl.textContent = msg;
  toastEl.className = `toast toast-${type} show`;
  setTimeout(() => toastEl.classList.remove("show"), 3500);
}

// ─── Difficulty Selector ──────────────────────────────────────
const DIFF_HINTS = {
  tier1: "Common attack vectors, straightforward observables, no lateral movement. ~15–20 min.",
  tier2: "Moderate complexity — lateral movement, defense evasion, 2–3 log sources. ~20–30 min.",
  tier3: "Multi-stage attack, active C2, ambiguous indicators, difficult tradeoffs. ~30–45 min.",
  apt:   "Nation-state TTPs, living-off-the-land, long dwell time already established. ~45–60 min.",
};

diffGrid.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    diffGrid.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("diff-active"));
    btn.classList.add("diff-active");
    state.currentDifficulty = btn.dataset.diff;
    diffHint.textContent = DIFF_HINTS[btn.dataset.diff];
  });
});

catGrid.querySelectorAll(".cat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    catGrid.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("cat-active"));
    btn.classList.add("cat-active");
    state.currentCategory = btn.dataset.cat;
  });
});

// ─── Char Counter ─────────────────────────────────────────────
responseInput.addEventListener("input", () => {
  const len = responseInput.value.length;
  charCount.textContent = `${len.toLocaleString()} chars`;
  charCount.style.color =
    len < 100 ? "var(--danger)" :
    len < 300 ? "var(--warning)" : "var(--success)";
});

// ─── Mode Grid ────────────────────────────────────────────────
function buildModeGrid() {
  modeGrid.innerHTML = Object.values(RESPONSE_MODES).map(mode => `
    <button class="mode-card ${state.currentScenario ? "" : "mode-card-locked"}"
            data-mode="${mode.id}"
            ${state.currentScenario ? "" : "disabled"}
            style="--mode-color:${mode.color}">
      <span class="mode-card-icon">${mode.icon}</span>
      <span class="mode-card-label">${mode.label}</span>
      <span class="mode-card-desc">${mode.shortDesc}</span>
    </button>
  `).join("");

  modeGrid.querySelectorAll(".mode-card").forEach(btn => {
    btn.addEventListener("click", () => selectMode(btn.dataset.mode));
  });
}

function selectMode(modeId) {
  state.currentMode = modeId;
  const mode = RESPONSE_MODES[modeId];

  modeGrid.querySelectorAll(".mode-card").forEach(b => {
    b.classList.toggle("mode-active", b.dataset.mode === modeId);
  });

  // Show guide
  guideSection.classList.remove("hidden");
  guideTitle.textContent = `${mode.icon} ${mode.label} — Writing Guide`;
  guideBody.innerHTML = mode.guide.map(item => `
    <div class="guide-card">
      <span class="guide-tag" style="background:${mode.color}18;color:${mode.color};border-color:${mode.color}40">${item.heading}</span>
      <p class="guide-hint">${item.hint}</p>
    </div>
  `).join("");

  // Response panel
  responseTitle.textContent = `✍️ Your ${mode.label}`;
  modeActiveLabel.textContent = `${mode.icon} ${mode.label} selected`;
  modeActiveLabel.style.color = mode.color;
  responseInput.disabled = false;
  submitBtn.disabled     = false;
  responseInput.value    = "";
  responseInput.dispatchEvent(new Event("input"));

  const placeholders = {
    ir:          "Draft your Incident Response Plan…\n\nCover: Containment → Eradication → Recovery → Communication\nUse the writing guide above. Click Template for a pre-structured starting point.",
    threat_hunt: "Draft your Threat Hunt…\n\nStart with your hypothesis, then describe data sources, query logic, pivot points, and scope assessment.",
    forensic:    "Draft your Forensic Investigation plan…\n\nStart with evidence preservation (order of volatility), artifacts to collect, timeline reconstruction, and analysis approach.",
    executive:   "Draft your Executive Briefing…\n\nNo jargon. Lead with impact, current status (RAG rating), what's been done, and what decisions you need from leadership.",
    ctf:         "Hunt for flags…\n\nList every IOC from the scenario, reconstruct the attack chain, map to MITRE ATT&CK IDs, answer the key questions.",
  };
  responseInput.placeholder = placeholders[modeId] || "Draft your response…";
  showToast(`Mode: ${mode.icon} ${mode.label}`, "info");
}

// ─── Guide Toggle ─────────────────────────────────────────────
guideToggleHdr.addEventListener("click", () => {
  const hidden = guideBody.style.display === "none";
  guideBody.style.display = hidden ? "" : "none";
  guideCollapseBtn.textContent = hidden ? "▼ Hide" : "▶ Show";
});

// ─── Scenario Recap Toggle ────────────────────────────────────
scenarioRecapHdr.addEventListener("click", () => {
  const hidden = scenarioRecap.classList.toggle("hidden");
  scenarioRecapBtn.textContent = hidden ? "▶" : "▼";
});

// ─── Framework Templates ──────────────────────────────────────
const TEMPLATES = {
  ir: `## CONTAINMENT
### Immediate (0–4 hours):
- 

### Long-term Containment:
- 

## ERADICATION
### Root Cause Removal:
- 

### Verification Steps:
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

### Detection Gaps Identified:`,

  threat_hunt: `## HYPOTHESIS
Threat actor is [X] based on observed evidence [Y].

## DATA SOURCES
- 
- 

## HUNT QUERIES
### Query 1 — [describe what you're hunting]:
Logic: 

### Query 2 — [describe what you're hunting]:
Logic: 

## PIVOT POINTS
- IOC → pivot to:
- IOC → pivot to:

## SCOPE ASSESSMENT
### Compromised Hosts:
### Compromised Accounts:
### Data at Risk:`,

  forensic: `## EVIDENCE PRESERVATION
### Order of Volatility:
1. RAM / running processes
2. Network state
3. Disk image

### Chain of Custody:
- Collected by:
- Date/Time:
- Hash (MD5/SHA256):

## ARTIFACT COLLECTION
### Windows Artifacts:
- Prefetch files (C:\\Windows\\Prefetch)
- Event logs (Security, System, Application)
- Registry hives (NTUSER.DAT, SYSTEM, SAM)

### Network Artifacts:
- 

## TIMELINE RECONSTRUCTION
| Timestamp | Event | Source Log |
|---|---|---|
|  |  |  |

## MALWARE ANALYSIS
### Static Analysis (hashes, strings, imports):

### Dynamic Analysis (behavior, C2, persistence):

## CONCLUSIONS
### Root Cause:
### Attribution Confidence Level:`,

  executive: `## SITUATION SUMMARY
[2–3 sentences. What happened, when, what systems affected. No jargon.]

## BUSINESS IMPACT
- Affected systems:
- Estimated downtime:
- Customer/data exposure:
- Regulatory implications:
- Revenue impact estimate:

## CURRENT STATUS
🔴 RED — Active threat / 🟡 AMBER — Contained / 🟢 GREEN — Resolved

[One sentence on current risk level]

## ACTIONS TAKEN
- 
- 

## DECISIONS REQUIRED FROM LEADERSHIP
- [ ] 
- [ ] 
- [ ] `,

  ctf: `## IOC EXTRACTION
### IP Addresses:
- 
### Domains / URLs:
- 
### File Hashes:
- 
### File Paths / Registry Keys:
- 
### Usernames / Accounts:
- 

## ATTACK CHAIN RECONSTRUCTION
1. Initial Access:
2. Execution:
3. Persistence:
4. Privilege Escalation:
5. Lateral Movement:
6. Collection / Exfiltration:

## MITRE ATT&CK MAPPING
| Technique ID | Name | Evidence |
|---|---|---|
|  |  |  |

## CRITICAL ANSWERS
- Patient Zero:
- Initial Vector:
- First Malicious Timestamp:
- Data Accessed/Exfiltrated:
- C2 Infrastructure:
- Total Dwell Time:

## RED HERRINGS IDENTIFIED
- `,
};

frameworkToggle.addEventListener("click", () => {
  if (!state.currentMode) { showToast("Select a response mode first.", "error"); return; }
  const tmpl = TEMPLATES[state.currentMode] || "";
  if (responseInput.value.trim() && responseInput.value !== tmpl) {
    if (!confirm("Replace current notes with the template?")) return;
  }
  responseInput.value = tmpl;
  responseInput.dispatchEvent(new Event("input"));
  responseInput.focus();
});

// ─── Hints ────────────────────────────────────────────────────
const HINTS = {
  ransomware:   ["Check vssadmin and wmic — shadow copy deletion via 'vssadmin delete shadows /all /quiet' is almost universal in ransomware pre-encryption.", "Look at network shares and mapped drives. Ransomware targets these. Check which user accounts had write access.", "Search for staging directories and large archive creation (ZIP, RAR, 7z) before encryption — exfiltration often precedes encryption."],
  apt:          ["C2 beaconing uses jitter to avoid detection. Look for periodic outbound connections with slight timing variations (not perfectly regular).", "Check WMI event subscriptions and scheduled tasks — these are top APT persistence mechanisms.", "Look at DNS query logs for DGA patterns — high-volume failed lookups to random-looking domains indicate C2."],
  insider:      ["Cloud sync tools (OneDrive, Dropbox, Google Drive) active outside business hours or syncing unusual volumes is a primary indicator.", "Correlate DLP alerts with physical access logs and VPN data to build the complete picture.", "Check print logs and USB device connection events — physical exfiltration vectors are commonly missed."],
  cloud:        ["Look for GetSecretValue, AssumeRole, and CreateAccessKey API calls in CloudTrail from unusual source IPs or at unusual times.", "Attackers create backdoor IAM users or roles immediately after gaining access. Look for new IAM entity creation events.", "Bulk S3 GetObject calls from non-organizational IPs — especially to sensitive buckets — indicate exfiltration."],
  supply_chain: ["Compare the binary hash against the vendor's published hash on their official website or release notes.", "Legitimate software making outbound connections to unknown domains post-update is the primary red flag.", "Inspect the digital signature carefully — valid certificate from an unexpected or newly created issuer is suspicious."],
  web:          ["Check raw web server logs for the exact request — the exploit payload is often visible in the URL or POST body.", "Web shells use legitimate-looking filenames (info.php, admin.aspx, config.php) — look for recently created or modified script files.", "After web shell placement, look for child processes spawned by the web server process (w3wp.exe, httpd, nginx spawning cmd.exe or powershell.exe)."],
};

hintBtn.addEventListener("click", () => {
  const hints = HINTS[state.currentCategory] || [];
  if (state.hintsUsed >= hints.length) { showToast("No more hints available.", "info"); return; }
  showToast(`💡 ${hints[state.hintsUsed]}`, "info");
  state.hintsUsed++;
  hintCount.textContent = Math.max(0, hints.length - state.hintsUsed);
  if (state.hintsUsed >= hints.length) { hintBtn.disabled = true; hintBtn.style.opacity = "0.4"; }
});

// ─── Score Ring Animation ─────────────────────────────────────
function animateScore(score) {
  const r = 68;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 10) * circumference;
  const color = score >= 8 ? "var(--success)" : score >= 5 ? "var(--warning)" : "var(--danger)";

  scoreRing.style.stroke = color;
  scoreRing.style.strokeDasharray = `${circumference}`;
  scoreRing.style.strokeDashoffset = `${circumference}`;
  scoreNumber.style.color = color;

  requestAnimationFrame(() => {
    scoreRing.style.strokeDashoffset = `${offset}`;
  });

  let cur = 0;
  const step = score / 35;
  const counter = setInterval(() => {
    cur = Math.min(cur + step, score);
    scoreNumber.textContent = cur.toFixed(1);
    if (cur >= score) { scoreNumber.textContent = score; clearInterval(counter); }
  }, 40);

  const verdicts = {
    "9-10": "Outstanding — operational standard met.",
    "7-8":  "Solid response — minor gaps to address.",
    "5-6":  "Adequate — significant room for improvement.",
    "3-4":  "Concerning — would likely fail in production.",
    "1-2":  "Critical failures — would cause active harm.",
  };
  const v = score >= 9 ? "9-10" : score >= 7 ? "7-8" : score >= 5 ? "5-6" : score >= 3 ? "3-4" : "1-2";
  scoreVerdict.textContent = verdicts[v];
  scoreVerdict.style.color = color;
  scoreDisplay.classList.remove("hidden");
}

// ─── Stats & History ──────────────────────────────────────────
function updateStats() {
  const h = state.sessionHistory;
  sessionCount.textContent = h.length;
  if (!h.length) { avgScoreEl.textContent = "—"; bestScoreEl.textContent = "—"; return; }
  const scores = h.map(x => x.score);
  avgScoreEl.textContent  = (scores.reduce((a,b) => a+b,0)/scores.length).toFixed(1);
  bestScoreEl.textContent = Math.max(...scores);
}

function addHistory(entry) {
  state.sessionHistory.unshift(entry);
  updateStats(); renderHistory();
  try { localStorage.setItem("soc_trainer_v3_history", JSON.stringify(state.sessionHistory)); } catch(_) {}
}

function renderHistory() {
  if (!state.sessionHistory.length) { historyList.innerHTML = `<div class="history-empty">No sessions yet.</div>`; return; }
  historyList.innerHTML = state.sessionHistory.map((e, i) => {
    const cls  = e.score >= 8 ? "score-high" : e.score >= 5 ? "score-mid" : "score-low";
    const mode = RESPONSE_MODES[e.modeId];
    return `<div class="history-item" data-idx="${i}">
      <div class="history-meta">
        <span class="history-cat">${escapeHTML(e.categoryLabel || "")}</span>
        ${mode ? `<span class="history-mode-icon" title="${mode.label}">${mode.icon}</span>` : ""}
        <span class="history-diff-tag">${escapeHTML((e.difficultyLabel || "").split("—")[0].trim())}</span>
      </div>
      <div class="history-bottom">
        <span class="history-time">${e.timestamp}</span>
        <span class="history-score ${cls}">${e.score}/10</span>
      </div>
    </div>`;
  }).join("");

  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const entry = state.sessionHistory[parseInt(el.dataset.idx)];
      state.currentScenario   = entry.scenario;
      state.currentMode       = entry.modeId;
      state.currentDifficulty = entry.difficulty || state.currentDifficulty;
      state.currentCategory   = entry.category   || state.currentCategory;
      scenarioOutput.innerHTML  = renderMarkdown(entry.scenario);
      scenarioRecap.innerHTML   = renderMarkdown(entry.scenario);
      evaluationOutput.innerHTML = renderMarkdown(entry.evaluation);
      setEvalMeta(entry);
      animateScore(entry.score);
      buildModeGrid();
      if (entry.modeId) selectMode(entry.modeId);
      navBtns[2].disabled = false;
      navBtns[3].disabled = false;
      goToPage(3);
      showToast("Loaded past session", "info");
    });
  });
}

function setEvalMeta(entry) {
  const mode = RESPONSE_MODES[entry.modeId];
  evalMode.textContent      = mode ? `${mode.icon} ${mode.label}` : "—";
  evalCategory.textContent  = entry.categoryLabel || "—";
  evalDifficulty.textContent = entry.difficultyLabel?.split("—")[1]?.trim() || "—";
  const m = Math.floor((entry.responseTime || 0) / 60);
  const s = ((entry.responseTime || 0) % 60).toString().padStart(2,"0");
  evalTime.textContent = entry.responseTime ? `${m}m ${s}s` : "—";
}

function loadHistory() {
  state.sessionHistory = loadHistorySafe("soc_trainer_v3_history");
  updateStats();
  renderHistory();
}

// ─── Export ───────────────────────────────────────────────────
exportBtn.addEventListener("click", () => {
  if (!state.currentScenario) { showToast("No session to export.", "error"); return; }
  const e    = state.sessionHistory[0];
  const mode = state.currentMode ? RESPONSE_MODES[state.currentMode] : null;
  const content = [
    `# SOC TRAINER — SESSION EXPORT`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Difficulty:** ${DIFFICULTY_LABELS[state.currentDifficulty]}`,
    `**Category:** ${CATEGORY_LABELS[state.currentCategory]}`,
    mode ? `**Mode:** ${mode.icon} ${mode.label}` : "",
    e?.score ? `**Score:** ${e.score}/10` : "",
    `\n---\n\n## SCENARIO\n\n${state.currentScenario}`,
    e?.userPlan    ? `\n---\n\n## YOUR RESPONSE\n\n${e.userPlan}` : "",
    e?.evaluation  ? `\n---\n\n## EVALUATION\n\n${e.evaluation}` : "",
  ].join("\n");

  const blob = new Blob([content], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `soc-session-${Date.now()}.md`; a.click();
  URL.revokeObjectURL(url);
  showToast("Session exported.", "success");
});

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all history?")) return;
  state.sessionHistory = [];
  localStorage.removeItem("soc_trainer_v3_history");
  updateStats(); renderHistory();
  showToast("History cleared.", "info");
});

// ─── Generate ─────────────────────────────────────────────────
generateBtn.addEventListener("click", async () => {
  const apiKey = apiKeyEl.value.trim();
  if (!apiKey) { showToast("Enter your API key first.", "error"); apiKeyEl.focus(); return; }

  // Rate limiting — prevent API spam
  try { checkRateLimit("generate", 5000); } catch(e) { showToast(e.message, "error"); return; }

  // Validate state values against allowlists
  try {
    validateDifficulty(state.currentDifficulty);
    validateCategory(state.currentCategory);
  } catch(e) { showToast(e.message, "error"); return; }

  state.currentMode  = null;
  state.hintsUsed    = 0;
  timerDisplay.textContent = "00:00";

  generateBtn.disabled  = true;
  generateBtn.innerHTML = `<span class="btn-spinner"></span> Generating...`;

  try {
    const scenario = await callAPI(
      apiKey,
      buildScenarioPrompt(state.currentDifficulty, state.currentCategory),
      "Generate a new incident response scenario now."
    );

    state.currentScenario = scenario;

    // Populate step 2
    scenarioOutput.innerHTML = renderMarkdown(scenario);
    scenarioRecap.innerHTML  = renderMarkdown(scenario);
    scenarioBadge.textContent = "ACTIVE INCIDENT";
    scenarioBadge.className   = "badge badge-danger";

    // Reset step 2 state
    buildModeGrid();
    guideSection.classList.add("hidden");
    responseInput.disabled = true;
    responseInput.value    = "";
    responseInput.dispatchEvent(new Event("input"));
    submitBtn.disabled     = true;
    modeActiveLabel.textContent = "No mode selected";
    modeActiveLabel.style.color = "";
    hintBtn.classList.remove("hidden");
    hintBtn.disabled   = false;
    hintBtn.style.opacity = "1";
    hintCount.textContent = "3";

    // Reset step 3
    evaluationOutput.innerHTML = `<div class="eval-idle"><div class="eval-idle-icon">⌛</div><p>Submit your response to receive evaluation.</p></div>`;
    scoreNumber.textContent = "—";
    scoreNumber.style.color = "";
    scoreDisplay.classList.add("hidden");
    scenarioRecap.classList.add("hidden");
    scenarioRecapBtn.textContent = "▶";

    // Unlock nav & go to step 2
    navBtns[2].disabled = false;
    navBtns[3].disabled = true;
    goToPage(2);
    startTimer();
    showToast("Incident generated — select a response mode to begin.", "success");

  } catch(err) {
    showToast(err.message, "error");
  } finally {
    generateBtn.disabled  = false;
    generateBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Generate Incident`;
  }
});

// ─── Submit ───────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  const apiKey  = apiKeyEl.value.trim();
  let userPlan;

  // Input validation via security module
  try {
    validateMode(state.currentMode || "");
    userPlan = validateResponseInput(responseInput.value);
  } catch(e) {
    showToast(e.message, "error");
    if (!state.currentMode) return;
    if (!responseInput.value.trim()) return;
    return;
  }

  // Rate limiting — evaluation is expensive
  try { checkRateLimit("submit", 8000); } catch(e) { showToast(e.message, "error"); return; }

  stopTimer();
  const responseTime = state.timerSeconds;

  submitBtn.disabled     = true;
  responseInput.disabled = true;
  submitBtn.innerHTML    = `<span class="btn-spinner"></span> Evaluating...`;

  // Pre-navigate to step 3 with loading state
  navBtns[3].disabled = false;
  goToPage(3);
  scoreNumber.textContent  = "…";
  evaluationOutput.innerHTML = `<div class="loading-pulse"><div class="pulse-line w70"></div><div class="pulse-line w90"></div><div class="pulse-line w50"></div><div class="pulse-line w80"></div><div class="pulse-line w60"></div><div class="pulse-line w75"></div></div>`;

  try {
    const evaluation = await callAPI(
      apiKey,
      buildEvaluationPrompt(state.currentMode),
      buildEvaluationMessage(state.currentScenario, userPlan, state.currentMode)
    );

    evaluationOutput.innerHTML = renderMarkdown(evaluation);

    const scoreMatch = evaluation.match(/##\s+Score:\s+(\d+(?:\.\d+)?)\/10/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

    if (score !== null) {
      animateScore(score);
      const entry = {
        score, responseTime,
        scenario:        state.currentScenario,
        evaluation,
        userPlan,
        modeId:          state.currentMode,
        categoryLabel:   CATEGORY_LABELS[state.currentCategory],
        difficultyLabel: DIFFICULTY_LABELS[state.currentDifficulty],
        category:        state.currentCategory,
        difficulty:      state.currentDifficulty,
        timestamp:       new Date().toLocaleTimeString(),
      };
      addHistory(entry);
      setEvalMeta(entry);
      const v = score >= 8 ? "Excellent work." : score >= 5 ? "Needs improvement." : "Critical failures detected.";
      showToast(`Score: ${score}/10 — ${v}`, score >= 7 ? "success" : "error");
    }

    scenarioBadge.textContent = "EVALUATED";
    scenarioBadge.className   = "badge badge-neutral";

  } catch(err) {
    evaluationOutput.innerHTML = `<div class="error-state">⚠ ${err.message}</div>`;
    showToast(err.message, "error");
    goToPage(2);
  } finally {
    submitBtn.disabled     = false;
    responseInput.disabled = false;
    submitBtn.innerHTML    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Submit for Evaluation`;
  }
});

// ─── Step 3 Actions ───────────────────────────────────────────
tryAgainBtn.addEventListener("click", () => {
  scenarioBadge.textContent = "IDLE";
  scenarioBadge.className   = "badge badge-neutral";
  navBtns[2].disabled       = true;
  navBtns[3].disabled       = true;
  timerDisplay.textContent  = "00:00";
  goToPage(1);
});

reReviewBtn.addEventListener("click", () => {
  goToPage(2);
  responseInput.disabled = false;
  submitBtn.disabled     = !state.currentMode;
  showToast("Revise your response and resubmit.", "info");
});

// ─── Init ─────────────────────────────────────────────────────
buildModeGrid();
loadHistory();

// API key intentionally NOT persisted to sessionStorage (VULN-002 fix)
// Users must re-enter their key each session for security.
// The password input field provides sufficient UX.
