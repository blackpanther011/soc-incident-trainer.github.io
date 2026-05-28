// ============================================================
// SOC TRAINER v3.0 — Core Application Logic
// ============================================================

import { callAPI } from "./api.js";
import {
  buildScenarioPrompt,
  buildEvaluationPrompt,
  buildEvaluationMessage,
  DIFFICULTY_LABELS,
  CATEGORY_LABELS,
} from "./prompts.js";

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentScenario: null,
  currentDifficulty: "tier2",
  currentCategory: "ransomware",
  sessionHistory: [],
  sessionStartTime: Date.now(),
};

// ─── DOM References ───────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  apiKey:           $("apiKey"),
  difficulty:       $("difficulty"),
  category:         $("category"),
  generateBtn:      $("generateBtn"),
  scenarioPanel:    $("scenarioPanel"),
  scenarioOutput:   $("scenarioOutput"),
  scenarioBadge:    $("scenarioBadge"),
  timerDisplay:     $("timerDisplay"),
  responseInput:    $("responseInput"),
  charCount:        $("charCount"),
  submitBtn:        $("submitBtn"),
  frameworkToggle:  $("frameworkToggle"),
  evaluationOutput: $("evaluationOutput"),
  scoreDisplay:     $("scoreDisplay"),
  scoreRing:        $("scoreRing"),
  scoreNumber:      $("scoreNumber"),
  historyList:      $("historyList"),
  sessionCount:     $("sessionCount"),
  avgScore:         $("avgScore"),
  bestScore:        $("bestScore"),
  exportBtn:        $("exportBtn"),
  clearBtn:         $("clearBtn"),
  toast:            $("toast"),
};

// ─── Timer ────────────────────────────────────────────────────────────────────

let timerInterval = null;
let timerSeconds  = 0;

function startTimer() {
  stopTimer();
  timerSeconds = 0;
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
    const s = String(timerSeconds % 60).padStart(2, "0");
    els.timerDisplay.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

// ─── Toast Notifications ──────────────────────────────────────────────────────

function showToast(message, type = "info") {
  els.toast.textContent = message;
  els.toast.className = `toast toast-${type} show`;
  setTimeout(() => els.toast.classList.remove("show"), 3500);
}

// ─── Character Counter ────────────────────────────────────────────────────────

els.responseInput.addEventListener("input", () => {
  const len = els.responseInput.value.length;
  els.charCount.textContent = `${len.toLocaleString()} chars`;
  els.charCount.style.color = len < 100
    ? "var(--danger)"
    : len < 300
    ? "var(--warning)"
    : "var(--success)";
});

// ─── Framework Template Toggle ────────────────────────────────────────────────

const FRAMEWORK_TEMPLATE = `## CONTAINMENT
### Immediate (0-4 hours):
- 

### Long-term Containment:
- 

## ERADICATION
### Root Cause Removal:
- 

### Verification:
- 

## RECOVERY
### System Restoration:
- 

### Monitoring Post-Recovery:
- 

## MITRE ATT&CK RESPONSE
### Techniques Identified:
- [T____.___] 

### Defensive Countermeasures:
- 

## COMMUNICATION
### Internal Stakeholders Notified:
- 

### Regulatory/Legal Considerations:
- `;

els.frameworkToggle.addEventListener("click", () => {
  if (els.responseInput.value.trim() === "" || els.responseInput.value === FRAMEWORK_TEMPLATE) {
    els.responseInput.value = els.responseInput.value === FRAMEWORK_TEMPLATE ? "" : FRAMEWORK_TEMPLATE;
  } else {
    if (confirm("This will replace your current notes with the framework template. Continue?")) {
      els.responseInput.value = FRAMEWORK_TEMPLATE;
    }
  }
  els.responseInput.dispatchEvent(new Event("input"));
});

// ─── Score Ring Animation ─────────────────────────────────────────────────────

function animateScore(score) {
  const circumference = 2 * Math.PI * 36; // r=36
  const offset = circumference - (score / 10) * circumference;

  els.scoreRing.style.strokeDasharray  = `${circumference}`;
  els.scoreRing.style.strokeDashoffset = `${circumference}`;
  els.scoreDisplay.classList.remove("hidden");

  // Color the ring based on score
  const color =
    score >= 8 ? "var(--success)" :
    score >= 5 ? "var(--warning)" :
    "var(--danger)";

  els.scoreRing.style.stroke = color;
  els.scoreNumber.style.color = color;

  // Animate
  requestAnimationFrame(() => {
    els.scoreRing.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)";
    els.scoreRing.style.strokeDashoffset = `${offset}`;
  });

  // Count up number
  let current = 0;
  const step = score / 30;
  const counter = setInterval(() => {
    current = Math.min(current + step, score);
    els.scoreNumber.textContent = current.toFixed(1);
    if (current >= score) {
      els.scoreNumber.textContent = score;
      clearInterval(counter);
    }
  }, 40);
}

// ─── Stats Update ─────────────────────────────────────────────────────────────

function updateStats() {
  const history = state.sessionHistory;
  els.sessionCount.textContent = history.length;

  if (history.length === 0) {
    els.avgScore.textContent = "—";
    els.bestScore.textContent = "—";
    return;
  }

  const scores  = history.map((h) => h.score);
  const avg     = scores.reduce((a, b) => a + b, 0) / scores.length;
  const best    = Math.max(...scores);

  els.avgScore.textContent  = avg.toFixed(1);
  els.bestScore.textContent = best;
}

// ─── History Rendering ────────────────────────────────────────────────────────

function addHistoryEntry(entry) {
  state.sessionHistory.unshift(entry);
  updateStats();
  renderHistory();

  // Persist to localStorage
  try {
    localStorage.setItem("soc_trainer_history", JSON.stringify(state.sessionHistory));
  } catch (_) {}
}

function renderHistory() {
  if (state.sessionHistory.length === 0) {
    els.historyList.innerHTML = `<div class="history-empty">No sessions yet.</div>`;
    return;
  }

  els.historyList.innerHTML = state.sessionHistory
    .map((entry, idx) => {
      const scoreClass =
        entry.score >= 8 ? "score-high" :
        entry.score >= 5 ? "score-mid"  :
        "score-low";
      return `
        <div class="history-item" data-idx="${idx}">
          <div class="history-meta">
            <span class="history-cat">${entry.categoryLabel}</span>
            <span class="history-diff">${entry.difficultyLabel}</span>
          </div>
          <div class="history-bottom">
            <span class="history-time">${entry.timestamp}</span>
            <span class="history-score ${scoreClass}">${entry.score}/10</span>
          </div>
        </div>`;
    })
    .join("");

  // Click to view old scenarios
  els.historyList.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", () => {
      const entry = state.sessionHistory[parseInt(el.dataset.idx)];
      els.scenarioOutput.innerHTML = marked.parse(entry.scenario);
      els.evaluationOutput.innerHTML = marked.parse(entry.evaluation);
      animateScore(entry.score);
      showToast("Loaded past session", "info");
    });
  });
}

// ─── Load History from LocalStorage ──────────────────────────────────────────

function loadHistory() {
  try {
    const saved = localStorage.getItem("soc_trainer_history");
    if (saved) {
      state.sessionHistory = JSON.parse(saved);
      updateStats();
      renderHistory();
    }
  } catch (_) {}
}

// ─── Export Session ───────────────────────────────────────────────────────────

els.exportBtn.addEventListener("click", () => {
  if (!state.currentScenario) {
    showToast("No active session to export.", "error");
    return;
  }

  const entry = state.sessionHistory[0];
  const content = [
    `# SOC TRAINER — SESSION EXPORT`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Difficulty:** ${DIFFICULTY_LABELS[state.currentDifficulty]}`,
    `**Category:** ${CATEGORY_LABELS[state.currentCategory]}`,
    entry?.score ? `**Score:** ${entry.score}/10` : "",
    `\n---\n`,
    `## SCENARIO\n`,
    state.currentScenario,
    entry?.userPlan ? `\n---\n\n## YOUR RESPONSE PLAN\n\n${entry.userPlan}` : "",
    entry?.evaluation ? `\n---\n\n## COMMANDER EVALUATION\n\n${entry.evaluation}` : "",
  ].join("\n");

  const blob = new Blob([content], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `soc-trainer-session-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Session exported as Markdown.", "success");
});

// ─── Clear History ────────────────────────────────────────────────────────────

els.clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all session history? This cannot be undone.")) return;
  state.sessionHistory = [];
  localStorage.removeItem("soc_trainer_history");
  updateStats();
  renderHistory();
  showToast("History cleared.", "info");
});

// ─── Generate Scenario ────────────────────────────────────────────────────────

els.generateBtn.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    showToast("Enter your Gemini API key first.", "error");
    els.apiKey.focus();
    return;
  }

  const difficulty = els.difficulty.value;
  const category   = els.category.value;

  state.currentDifficulty = difficulty;
  state.currentCategory   = category;

  // UI: loading state
  els.generateBtn.disabled = true;
  els.generateBtn.innerHTML = `<span class="btn-spinner"></span> Generating...`;
  els.scenarioOutput.innerHTML = `<div class="loading-pulse">
    <div class="pulse-line w80"></div>
    <div class="pulse-line w60"></div>
    <div class="pulse-line w90"></div>
    <div class="pulse-line w50"></div>
    <div class="pulse-line w70"></div>
  </div>`;
  els.scenarioBadge.textContent = "GENERATING...";
  els.scenarioBadge.className   = "badge badge-warning";
  els.scoreDisplay.classList.add("hidden");

  try {
    const scenario = await callAPI(
      apiKey,
      buildScenarioPrompt(difficulty, category),
      "Generate a new incident response scenario now."
    );

    state.currentScenario = scenario;

    els.scenarioOutput.innerHTML  = marked.parse(scenario);
    els.scenarioBadge.textContent = "ACTIVE INCIDENT";
    els.scenarioBadge.className   = "badge badge-danger";

    els.responseInput.disabled = false;
    els.submitBtn.disabled     = false;
    els.responseInput.value    = "";
    els.responseInput.dispatchEvent(new Event("input"));
    els.evaluationOutput.innerHTML = `<div class="eval-idle">
      <div class="eval-idle-icon">⌛</div>
      <p>Draft your response plan and submit for evaluation.</p>
    </div>`;

    startTimer();
    els.responseInput.focus();
    showToast("Incident generated. Clock is running.", "success");

  } catch (err) {
    els.scenarioOutput.innerHTML  = `<div class="error-state">⚠ ${err.message}</div>`;
    els.scenarioBadge.textContent = "ERROR";
    els.scenarioBadge.className   = "badge badge-danger";
    showToast(err.message, "error");
  } finally {
    els.generateBtn.disabled    = false;
    els.generateBtn.innerHTML   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Generate Incident`;
  }
});

// ─── Submit Response Plan ─────────────────────────────────────────────────────

els.submitBtn.addEventListener("click", async () => {
  const apiKey   = els.apiKey.value.trim();
  const userPlan = els.responseInput.value.trim();

  if (!userPlan) {
    showToast("Write a response plan before submitting.", "error");
    return;
  }
  if (userPlan.length < 50) {
    showToast("Response too short — add more detail.", "error");
    return;
  }

  stopTimer();
  const responseTimeSeconds = timerSeconds;

  // UI: loading state
  els.submitBtn.disabled   = true;
  els.responseInput.disabled = true;
  els.submitBtn.innerHTML  = `<span class="btn-spinner"></span> Evaluating...`;
  els.evaluationOutput.innerHTML = `<div class="loading-pulse">
    <div class="pulse-line w70"></div>
    <div class="pulse-line w90"></div>
    <div class="pulse-line w50"></div>
    <div class="pulse-line w80"></div>
    <div class="pulse-line w60"></div>
  </div>`;

  try {
    const evaluation = await callAPI(
      apiKey,
      buildEvaluationPrompt(),
      buildEvaluationMessage(state.currentScenario, userPlan)
    );

    els.evaluationOutput.innerHTML = marked.parse(evaluation);

    // Extract score from markdown
    const scoreMatch = evaluation.match(/##\s+Score:\s+(\d+(?:\.\d+)?)\/10/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

    if (score !== null) {
      animateScore(score);
      addHistoryEntry({
        score,
        scenario:        state.currentScenario,
        evaluation,
        userPlan,
        categoryLabel:   CATEGORY_LABELS[state.currentCategory],
        difficultyLabel: DIFFICULTY_LABELS[state.currentDifficulty],
        timestamp:       new Date().toLocaleTimeString(),
        responseTime:    responseTimeSeconds,
      });

      const verdict = score >= 8 ? "Excellent work." : score >= 5 ? "Needs improvement." : "Critical failures detected.";
      showToast(`Score: ${score}/10 — ${verdict}`, score >= 7 ? "success" : "error");
    }

    els.scenarioBadge.textContent = "EVALUATED";
    els.scenarioBadge.className   = "badge badge-neutral";

  } catch (err) {
    els.evaluationOutput.innerHTML = `<div class="error-state">⚠ ${err.message}</div>`;
    showToast(err.message, "error");
  } finally {
    els.submitBtn.disabled     = false;
    els.responseInput.disabled = false;
    els.submitBtn.innerHTML    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Submit for Evaluation`;
  }
});

// ─── Difficulty / Category sync to state ─────────────────────────────────────

els.difficulty.addEventListener("change", () => { state.currentDifficulty = els.difficulty.value; });
els.category.addEventListener("change",   () => { state.currentCategory   = els.category.value;   });

// ─── Init ─────────────────────────────────────────────────────────────────────

loadHistory();

// Restore API key from session storage
const savedKey = sessionStorage.getItem("soc_gemini_key");
if (savedKey) els.apiKey.value = savedKey;

els.apiKey.addEventListener("change", () => {
  sessionStorage.setItem("soc_gemini_key", els.apiKey.value);
});

console.log("%cSOC TRAINER v3.0", "color:#f97316;font-size:18px;font-weight:bold;");
console.log("%cBuilt for portfolio-grade incident response practice.", "color:#94a3b8;");
