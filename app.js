// ============================================================
// SOC TRAINER v4 — "Incident Command"
// 4-stage flow: Setup → Investigate → Respond → Evaluate,
// plus a standalone Interview Room. Gamified, demo + live AI.
// ============================================================

import { callAPI } from "./api.js";
import {
  buildScenarioPrompt, buildEvaluationPrompt, buildEvaluationMessage,
  DIFFICULTY_LABELS, CATEGORY_LABELS, RESPONSE_MODES,
} from "./prompts.js";
import {
  renderMarkdown, validateDifficulty, validateCategory, validateMode,
  validateResponseInput, checkRateLimit, loadHistorySafe, escapeHTML,
} from "./security.js";
import { DEMO_SCENARIOS, buildDemoEvaluation, demoDelay } from "./demo.js";
import { computeScore, renderBreakdown } from "./scoring.js";
import { Auth } from "./auth.js";
import { CASES } from "./case-data.js";
import { Investigation } from "./investigation.js";
import { Interview } from "./interview.js";

const $ = (id) => document.getElementById(id);

// ─── State ───────────────────────────────────────────────────
const state = {
  scenario: null, difficulty: "tier2", category: "ransomware", mode: null,
  history: [], timerSeconds: 0, demo: true, xp: 0, lastStage: 1,
};

// ─── Ranks ───────────────────────────────────────────────────
const RANKS = [
  { min: 0, tier: "Recruit", badge: "R" },
  { min: 500, tier: "Analyst I", badge: "A1" },
  { min: 1500, tier: "Analyst II", badge: "A2" },
  { min: 3200, tier: "Responder", badge: "RS" },
  { min: 5500, tier: "Sentinel", badge: "S" },
  { min: 8500, tier: "Commander", badge: "CMD" },
  { min: 12500, tier: "Incident Lead", badge: "IL" },
];
function rankFor(xp) {
  let cur = RANKS[0], idx = 0;
  for (let i = 0; i < RANKS.length; i++) { if (xp >= RANKS[i].min) { cur = RANKS[i]; idx = i; } }
  const next = RANKS[idx + 1] || null;
  const floor = cur.min, ceil = next ? next.min : cur.min;
  const prog = next ? Math.max(4, Math.min(100, ((xp - floor) / (ceil - floor)) * 100)) : 100;
  const toNext = next ? `${(next.min - xp).toLocaleString()} XP to ${next.tier}` : "Max rank achieved";
  return { cur, next, prog, toNext };
}

const MODE_ICON = {
  ir: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  threat_hunt: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  forensic: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  executive: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  ctf: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
};
const MODE_LABEL_SHORT = { ir: "IR Plan", threat_hunt: "Hunt", forensic: "Forensic", executive: "Exec", ctf: "CTF" };

const DIFF_HINTS = {
  tier1: "Common attack vectors, straightforward observables, no lateral movement. ~15–20 min.",
  tier2: "Moderate complexity — lateral movement, defense evasion, 2–3 log sources. ~20–30 min.",
  tier3: "Multi-stage attack, active C2, ambiguous indicators, difficult tradeoffs. ~30–45 min.",
  apt: "Nation-state TTPs, living-off-the-land, long dwell time already established. ~45–60 min.",
};

const TEMPLATES = {
  ir: `## CONTAINMENT\n### Immediate (0–4h):\n- \n### Long-term:\n- \n\n## ERADICATION\n### Root cause removal:\n- \n### Verification:\n- \n\n## RECOVERY\n### Restoration:\n- \n### Post-recovery monitoring:\n- \n\n## COMMUNICATION\n### Internal / External:\n- \n\n## POST-INCIDENT\n### Lessons learned:\n- `,
  threat_hunt: `## HYPOTHESIS\nThreat actor is [X] based on [Y].\n\n## DATA SOURCES\n- \n\n## HUNT QUERIES\n### Query 1:\nLogic: \n\n## PIVOT POINTS\n- IOC → pivot to:\n\n## SCOPE ASSESSMENT\n### Compromised hosts / accounts / data:\n- `,
  forensic: `## EVIDENCE PRESERVATION\n### Order of volatility:\n1. RAM / processes\n2. Network state\n3. Disk image\n### Chain of custody:\n- Collected by / time / hash:\n\n## ARTIFACT COLLECTION\n- \n\n## TIMELINE RECONSTRUCTION\n| Time | Event | Source |\n|---|---|---|\n|  |  |  |\n\n## CONCLUSIONS\n### Root cause / attribution confidence:\n- `,
  executive: `## SITUATION SUMMARY\n[2–3 sentences, no jargon]\n\n## BUSINESS IMPACT\n- Affected systems / downtime / exposure / regulatory:\n\n## CURRENT STATUS\n🔴 RED / 🟡 AMBER / 🟢 GREEN — \n\n## ACTIONS TAKEN\n- \n\n## DECISIONS REQUIRED\n- [ ] `,
  ctf: `## IOC EXTRACTION\n### IPs / Domains / Hashes / Paths / Accounts:\n- \n\n## ATTACK CHAIN\n1. Initial access:\n2. Execution:\n3. Persistence:\n4. Lateral movement:\n5. Exfiltration:\n\n## MITRE ATT&CK\n| Technique | Name | Evidence |\n|---|---|---|\n|  |  |  |\n\n## CRITICAL ANSWERS\n- Patient zero / initial vector / dwell time:\n\n## RED HERRINGS\n- `,
};

// ─── Page nav (4 stages) ─────────────────────────────────────
const stages = { 1: $("stage1"), 2: $("stage2"), 3: $("stage3"), 4: $("stage4") };
const navBtns = { 1: $("nav1"), 2: $("nav2"), 3: $("nav3"), 4: $("nav4") };
const THREAT = { 1: "idle", 2: "active", 3: "active", 4: "graded" };
const STATUS = { 1: ["idle", "STANDBY"], 2: ["active", "INVESTIGATING"], 3: ["active", "LIVE INCIDENT"], 4: ["graded", "RESOLVED"] };
const CLOCK2 = { 1: ["—", "STATUS"], 2: ["", "TO DEADLINE"], 3: ["", "TO DEADLINE"], 4: ["RESOLVED", "OUTCOME"] };

function goTo(n) {
  exitInterview(true);
  state.lastStage = n;
  Object.values(stages).forEach((s) => s.classList.remove("on"));
  stages[n].classList.add("on");
  Object.entries(navBtns).forEach(([k, b]) => {
    b.classList.remove("active", "done");
    const num = +k;
    if (num < n) b.classList.add("done");
    else if (num === n) b.classList.add("active");
  });
  document.body.dataset.threat = THREAT[n];
  const [cls, txt] = STATUS[n];
  $("statusChip").className = `statuschip ${cls}`;
  $("statusText").textContent = txt;
  const [v, lbl] = CLOCK2[n];
  $("clockSecondaryLabel").textContent = lbl;
  if (n !== 2 && n !== 3) { $("clockSecondary").textContent = v; $("clockSecondary").className = "v"; $("clockSecondary").style.color = n === 4 ? "var(--ok)" : "var(--t2)"; }
}
navBtns[1].onclick = () => goTo(1);
navBtns[2].onclick = () => { if (!navBtns[2].disabled) goTo(2); };
navBtns[3].onclick = () => { if (!navBtns[3].disabled) goTo(3); };
navBtns[4].onclick = () => { if (!navBtns[4].disabled) goTo(4); };

// ─── Interview Room ──────────────────────────────────────────
let interviewInit = false;
function showInterview() {
  Object.values(stages).forEach((s) => s.classList.remove("on"));
  $("stageInterview").classList.add("on");
  $("interviewBtn").classList.add("on");
  document.body.dataset.threat = "idle";
  if (!interviewInit) {
    Interview.getKey = () => $("apiKey").value.trim();
    Interview.toast = toast;
    Interview.init();
    interviewInit = true;
  }
}
function exitInterview(silent) {
  $("interviewBtn").classList.remove("on");
  if ($("stageInterview").classList.contains("on") && !silent) goTo(state.lastStage);
  else if ($("stageInterview").classList.contains("on")) $("stageInterview").classList.remove("on");
}
$("interviewBtn").onclick = () => {
  if ($("stageInterview").classList.contains("on")) { goTo(state.lastStage); $("interviewBtn").classList.remove("on"); }
  else showInterview();
};
$("ivExitBtn").onclick = () => { goTo(state.lastStage); $("interviewBtn").classList.remove("on"); };

// ─── Timer + dual clock ──────────────────────────────────────
let timerInterval = null;
const DEADLINE = 18 * 3600;
function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function startTimer() {
  stopTimer(); state.timerSeconds = 0; tickClock();
  timerInterval = setInterval(() => { state.timerSeconds++; tickClock(); }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }
function tickClock() {
  $("clockElapsed").textContent = fmt(state.timerSeconds);
  const rem = Math.max(0, DEADLINE - state.timerSeconds);
  const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60);
  const el = $("clockSecondary");
  const t = document.body.dataset.threat;
  if (t === "active") { el.textContent = `${h}:${String(m).padStart(2, "0")}`; el.className = "v warn"; }
}

// ─── Toast ───────────────────────────────────────────────────
let toastT = null;
function toast(msg, type = "info") {
  const el = $("toast");
  el.innerHTML = escapeHTML(msg);
  el.className = `toast toast-${type} show`;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), type === "hint" ? 6500 : 3600);
}

// ─── Activity log ────────────────────────────────────────────
function logEvent(msg, sev = "c") {
  const stream = $("eventStream");
  if (!stream) return;
  const ts = new Date().toLocaleTimeString("en-GB");
  const row = document.createElement("div");
  row.className = "eev";
  row.innerHTML = `<span class="ets">${ts}</span><span class="esv ${sev}"></span><span class="emsg">${escapeHTML(msg)}</span>`;
  stream.prepend(row);
  while (stream.children.length > 7) stream.lastChild.remove();
}

function setObj(key, st) {
  const el = document.querySelector(`.obj[data-obj="${key}"]`);
  if (!el) return;
  el.classList.remove("done", "now");
  if (st) el.classList.add(st);
}

// ─── Setup selectors ─────────────────────────────────────────
$("diffGrid").querySelectorAll(".diff").forEach((b) => {
  b.onclick = () => {
    $("diffGrid").querySelectorAll(".diff").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    state.difficulty = b.dataset.diff;
    $("diffHint").textContent = DIFF_HINTS[b.dataset.diff];
    updateReady();
  };
});
$("catGrid").querySelectorAll(".cat").forEach((b) => {
  b.onclick = () => {
    $("catGrid").querySelectorAll(".cat").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    state.category = b.dataset.cat;
    updateReady();
  };
});
$("demoToggle").onclick = () => {
  state.demo = !state.demo;
  $("demoToggle").classList.toggle("on", state.demo);
  updateReady();
};
$("apiKey").addEventListener("input", () => {
  if ($("apiKey").value.trim() && state.demo) { state.demo = false; $("demoToggle").classList.remove("on"); }
  if (!$("apiKey").value.trim() && !state.demo) { state.demo = true; $("demoToggle").classList.add("on"); }
  updateReady();
});
function updateReady() {
  const mode = state.demo ? "Demo mode" : "Live AI";
  $("readyLine").textContent = `Range armed · ${mode} · ${state.difficulty.toUpperCase()} · ${CATEGORY_LABELS[state.category].split(" / ")[0]}`;
}

// ─── Char counter ────────────────────────────────────────────
$("responseInput").addEventListener("input", () => {
  const len = $("responseInput").value.length;
  $("charCount").textContent = `${len.toLocaleString()} chars`;
  $("charCount").style.color = len < 100 ? "var(--crit)" : len < 300 ? "var(--warn)" : "var(--ok)";
  if (state.mode) {
    if (len >= 50) { setObj("draft", "done"); setObj("submit", "now"); }
    else { setObj("draft", "now"); setObj("submit", ""); }
  }
});

// ─── Mode grid ───────────────────────────────────────────────
function buildModeGrid() {
  const grid = $("modeGrid");
  grid.innerHTML = Object.values(RESPONSE_MODES).map((m) => `
    <button class="mode" data-mode="${m.id}" ${state.scenario ? "" : "disabled"}>
      <span class="mi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${MODE_ICON[m.id]}</svg></span>
      <span class="ml">${MODE_LABEL_SHORT[m.id]}</span>
    </button>`).join("");
  grid.querySelectorAll(".mode").forEach((b) => { b.onclick = () => selectMode(b.dataset.mode); });
}
function selectMode(id) {
  state.mode = id;
  const m = RESPONSE_MODES[id];
  $("modeGrid").querySelectorAll(".mode").forEach((b) => b.classList.toggle("on", b.dataset.mode === id));
  $("guideSection").classList.remove("hidden");
  $("guideTitle").textContent = `${m.label} — Writing Guide`;
  $("guideBody").innerHTML = m.guide.map((g) => `<div class="gcard"><span class="gtag">${g.heading}</span><p>${g.hint}</p></div>`).join("");
  $("guideBody").style.display = "";
  $("guideCollapseBtn").textContent = "▼ HIDE";
  $("responseTitle").innerHTML = `${m.label} <span class="tag">${MODE_LABEL_SHORT[id].toUpperCase()} · ARMED</span>`;
  $("uplinkFramework").textContent = m.evaluationFocus.split(" ").slice(0, 2).join(" ").toUpperCase();
  const ta = $("responseInput");
  ta.disabled = false;
  const ph = {
    ir: "Draft your Incident Response Plan…\n\nContainment → Eradication → Recovery → Communication. Cite the IOCs you confirmed on the board. ◆ Findings pulls them in; ⌘ Template scaffolds.",
    threat_hunt: "Draft your Threat Hunt…\n\nHypothesis, data sources, query logic, pivot points, scope.",
    forensic: "Draft your Forensic Investigation…\n\nEvidence preservation (order of volatility), artifacts, timeline, analysis.",
    executive: "Draft your Executive Briefing…\n\nNo jargon. Impact, RAG status, actions taken, decisions needed.",
    ctf: "Hunt the flags…\n\nExtract every IOC, reconstruct the kill chain, map MITRE ATT&CK IDs.",
  };
  ta.placeholder = ph[id] || "Draft your response…";
  ta.dispatchEvent(new Event("input"));
  $("submitBtn").disabled = false;
  $("submitMeta").className = "tm-meta ready";
  $("submitMetaText").textContent = `${m.label} armed`;
  setObj("mode", "done"); setObj("draft", "now");
  logEvent(`Engagement mode set → ${m.label}`, "c");
}

$("guideToggle").onclick = () => {
  const body = $("guideBody");
  const hidden = body.style.display === "none";
  body.style.display = hidden ? "" : "none";
  $("guideCollapseBtn").textContent = hidden ? "▼ HIDE" : "▶ SHOW";
};
$("templateBtn").onclick = () => {
  if (!state.mode) { toast("Select an engagement mode first.", "error"); return; }
  const t = TEMPLATES[state.mode] || "";
  const ta = $("responseInput");
  if (ta.value.trim() && !confirm("Replace current notes with the template?")) return;
  ta.value = t; ta.dispatchEvent(new Event("input")); ta.focus();
};
$("findingsBtn").onclick = () => {
  const summary = Investigation.findingsSummary();
  if (!summary) { toast("Log findings on the board first.", "error"); return; }
  const ta = $("responseInput");
  if (ta.value.includes("INVESTIGATION FINDINGS")) { toast("Findings already inserted.", "info"); return; }
  ta.value = (summary + "\n\n" + ta.value).trim() + "\n"; ta.dispatchEvent(new Event("input")); ta.focus();
  toast("Confirmed findings inserted.", "success");
};
$("backToBoardBtn").onclick = () => goTo(2);

// ─── Gauges ──────────────────────────────────────────────────
const CIRC = 2 * Math.PI * 72;
function setInvSeverity(c) {
  const s = c.severity;
  $("invSevRing").style.stroke = s.color;
  $("invSevRing").style.strokeDasharray = `${CIRC}`;
  $("invSevRing").style.strokeDashoffset = `${CIRC}`;
  $("invSevBig").style.color = s.color; $("invSevSub").style.color = s.color; $("invSevSub").textContent = s.label;
  requestAnimationFrame(() => { $("invSevRing").style.strokeDashoffset = `${CIRC * (1 - s.frac)}`; });
  let cur = 0; const target = parseFloat(s.score);
  const iv = setInterval(() => { cur = Math.min(cur + target / 26, target); $("invSevBig").textContent = cur.toFixed(1); if (cur >= target) { $("invSevBig").textContent = s.score; clearInterval(iv); } }, 32);
}
function animateScore(score) {
  const color = score >= 8 ? "var(--ok)" : score >= 5 ? "var(--warn)" : "var(--crit)";
  const off = CIRC * (1 - score / 10);
  $("scoreRing").style.stroke = color;
  $("scoreRing").style.strokeDasharray = `${CIRC}`;
  $("scoreRing").style.strokeDashoffset = `${CIRC}`;
  $("scoreBig").style.color = color;
  requestAnimationFrame(() => { $("scoreRing").style.strokeDashoffset = `${off}`; });
  let cur = 0; const step = score / 34;
  const iv = setInterval(() => { cur = Math.min(cur + step, score); $("scoreBig").textContent = cur.toFixed(1); if (cur >= score) { $("scoreBig").textContent = score; clearInterval(iv); } }, 40);
  const V = score >= 9 ? ["Outstanding", "Operational standard met. You'd lead the post-incident review."]
    : score >= 7 ? ["Solid Response", "Minor gaps to close, but fundamentally sound."]
    : score >= 5 ? ["Adequate", "Significant room to improve — vague where it counts."]
    : score >= 3 ? ["Concerning", "Would likely fail under real-world pressure."]
    : ["Critical Failure", "Actions here would cause active harm. Reset and rethink."];
  $("verdictText").textContent = V[0]; $("verdictText").style.color = color;
  $("verdictSub").textContent = V[1];
}

// ─── XP / Ranks ──────────────────────────────────────────────
function renderRanks(animateProg) {
  const r = rankFor(state.xp);
  $("hudRankBadge").textContent = r.cur.badge;
  $("hudRankTier").textContent = r.cur.tier;
  $("hudRankXp").textContent = `${state.xp.toLocaleString()} XP`;
  $("dossierBadge").textContent = r.cur.badge;
  $("dossierTier").textContent = r.cur.tier;
  $("dossierXp").textContent = `${state.xp.toLocaleString()} XP`;
  $("xpNextLabel").textContent = r.toNext;
  $("xpBarFill").style.width = `${r.prog}%`;
  if (animateProg) {
    $("xpRankNow").textContent = r.cur.tier;
    $("xpRankLabel").textContent = r.toNext;
    requestAnimationFrame(() => { $("xpRankProg").style.width = `${r.prog}%`; });
  }
}
function awardXP(score, diff, invXP) {
  const bonus = { tier1: 10, tier2: 25, tier3: 45, apt: 70 }[diff] || 0;
  const gained = Math.round(score * 30 + bonus) + (invXP || 0);
  state.xp += gained;
  try { localStorage.setItem(Auth.key("soc_trainer_v4_xp"), String(state.xp)); } catch (_) {}
  $("xpEarnedVal").textContent = `+${gained}`;
  $("xpEarnedVal").classList.remove("xp-gain-pop"); void $("xpEarnedVal").offsetWidth; $("xpEarnedVal").classList.add("xp-gain-pop");
  renderRanks(true);
  return gained;
}

// ─── Skill radar ─────────────────────────────────────────────
const RADAR_AXES = [
  { id: "ir", label: "IR" }, { id: "threat_hunt", label: "HUNT" }, { id: "forensic", label: "FORENSIC" },
  { id: "executive", label: "EXEC" }, { id: "ctf", label: "CTF" },
];
function renderRadar() {
  const el = $("skillRadar"); if (!el) return;
  const agg = {};
  for (const e of state.history) { if (e.modeId == null || e.score == null) continue; (agg[e.modeId] = agg[e.modeId] || []).push(e.score); }
  const data = RADAR_AXES.map((a) => { const arr = agg[a.id] || []; const avg = arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null; return { ...a, avg }; });
  const played = data.filter((d) => d.avg != null);
  const W = 240, H = 188, cx = W / 2, cy = 96, R = 66, N = RADAR_AXES.length;
  const ang = (i) => (-90 + i * (360 / N)) * Math.PI / 180;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  let grid = "";
  for (let lvl = 1; lvl <= 4; lvl++) { const r = (R * lvl) / 4; grid += `<polygon class="radar-grid" points="${RADAR_AXES.map((_, i) => pt(i, r).join(",")).join(" ")}"/>`; }
  let axes = "", labels = "";
  data.forEach((d, i) => {
    const [ex, ey] = pt(i, R);
    axes += `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    const [lx, ly] = pt(i, R + 16);
    let anchor = "middle"; if (lx < cx - 6) anchor = "end"; else if (lx > cx + 6) anchor = "start";
    labels += `<text class="radar-label${d.avg == null ? " dim" : ""}" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}">${d.label}</text>`;
    if (d.avg != null) { const [vx, vy] = pt(i, R + 16); labels += `<text class="radar-val" x="${vx.toFixed(1)}" y="${(vy + 13).toFixed(1)}" text-anchor="${anchor}">${d.avg.toFixed(1)}</text>`; }
  });
  let body;
  if (!played.length) body = `${grid}${axes}${labels}<text class="radar-empty" x="${cx}" y="${cy + 3}" text-anchor="middle">No data yet</text>`;
  else {
    const valPoly = data.map((d, i) => pt(i, R * ((d.avg || 0) / 10)).join(",")).join(" ");
    let dots = ""; data.forEach((d, i) => { if (d.avg != null) { const [dx, dy] = pt(i, R * (d.avg / 10)); dots += `<circle class="radar-dot" cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.6"/>`; } });
    body = `${grid}${axes}<polygon class="radar-poly" points="${valPoly}"/>${dots}${labels}`;
  }
  let legend;
  if (played.length) {
    const best = played.reduce((a, b) => (b.avg > a.avg ? b : a)), worst = played.reduce((a, b) => (b.avg < a.avg ? b : a));
    const FULL = { ir: "Incident Response", threat_hunt: "Threat Hunt", forensic: "Forensics", executive: "Exec Brief", ctf: "CTF Hunt" };
    legend = `<div class="radar-legend"><div class="rl-strong"><span class="rl-k">Strongest</span><span class="rl-v">${FULL[best.id]} · ${best.avg.toFixed(1)}</span></div>${played.length > 1 ? `<div class="rl-weak"><span class="rl-k">Focus Area</span><span class="rl-v">${FULL[worst.id]} · ${worst.avg.toFixed(1)}</span></div>` : ""}</div>`;
  } else legend = `<div class="radar-legend"><span class="rl-k" style="margin:0 auto">Run incidents in each mode to map your profile</span></div>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Skill profile by mode">${body}</svg>${legend}`;
}

// ─── Stats & history ─────────────────────────────────────────
function updateStats() {
  const h = state.history;
  $("statSessions").textContent = h.length;
  if (!h.length) { $("statAvg").textContent = "—"; $("statBest").textContent = "—"; $("statStreak").textContent = "0"; return; }
  const sc = h.map((x) => x.score);
  $("statAvg").textContent = (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1);
  $("statBest").textContent = Math.max(...sc);
  let streak = 0; for (const e of h) { if (e.score >= 7) streak++; else break; }
  $("statStreak").textContent = streak;
}
function addHistory(entry) {
  state.history.unshift(entry);
  updateStats(); renderHistory(); renderRadar();
  try { localStorage.setItem(Auth.key("soc_trainer_v3_history"), JSON.stringify(state.history)); } catch (_) {}
}
function renderHistory() {
  const list = $("historyList");
  if (!state.history.length) { list.innerHTML = `<div class="history-empty">No operations logged yet.</div>`; return; }
  list.innerHTML = state.history.map((e, i) => {
    const cls = e.score >= 8 ? "sc-high" : e.score >= 5 ? "sc-mid" : "sc-low";
    const m = RESPONSE_MODES[e.modeId];
    return `<div class="hitem" data-idx="${i}">
      <div class="htop"><span class="hcat">${escapeHTML(e.categoryLabel || "")}</span><span class="htag">${escapeHTML((e.difficultyLabel || "").split("—")[0].trim())}</span></div>
      <div class="hbot"><span class="htime">${escapeHTML(e.timestamp || "")} · ${m ? escapeHTML(m.label) : ""}</span><span class="hscore ${cls}">${e.score}/10</span></div>
    </div>`;
  }).join("");
  list.querySelectorAll(".hitem").forEach((el) => { el.onclick = () => loadHistoryEntry(state.history[+el.dataset.idx]); });
}
function loadHistoryEntry(e) {
  state.scenario = e.scenario; state.mode = e.modeId;
  state.difficulty = e.difficulty || state.difficulty; state.category = e.category || state.category;
  if (CASES[state.category]) loadBoard(CASES[state.category]);
  $("scenarioOutput").innerHTML = renderMarkdown(e.scenario);
  $("recapBody").innerHTML = renderMarkdown(e.scenario);
  $("evaluationOutput").innerHTML = renderMarkdown(e.evaluation);
  setEvalMeta(e); animateScore(e.score);
  if (e.accuracy != null) {
    const [fc, ft] = (e.findingsStat || "0/0").split("/").map((n) => parseInt(n, 10) || 0);
    renderBreakdown($("scoreBreakdown"), computeScore({
      aiScore: e.accuracy, responseTime: e.responseTime || 0,
      difficulty: e.difficulty || "tier2", findingsConfirmed: fc, findingsTotal: ft,
    }));
  } else renderBreakdown($("scoreBreakdown"), null);
  $("evalFrameworkRt").textContent = (RESPONSE_MODES[e.modeId]?.evaluationFocus || "").split(" ").slice(0, 2).join(" ").toUpperCase();
  navBtns[2].disabled = false; navBtns[3].disabled = false; navBtns[4].disabled = false;
  goTo(4);
  toast("Loaded past operation.", "info");
}
function setEvalMeta(e) {
  const m = RESPONSE_MODES[e.modeId];
  $("evalMode").textContent = m ? m.label : "—";
  $("evalCategory").textContent = e.categoryLabel || "—";
  $("evalFindings").textContent = e.findingsStat || "—";
  const mm = Math.floor((e.responseTime || 0) / 60), ss = ((e.responseTime || 0) % 60).toString().padStart(2, "0");
  $("evalTime").textContent = e.responseTime ? `${mm}m ${ss}s` : "—";
}

$("recapToggle").onclick = () => {
  const hidden = $("recapBody").classList.toggle("hidden");
  $("recapIcon").textContent = hidden ? "▶" : "▼";
};
$("clearBtn").onclick = () => {
  if (!confirm("Clear all operation history?")) return;
  state.history = []; localStorage.removeItem(Auth.key("soc_trainer_v3_history"));
  updateStats(); renderHistory(); renderRadar(); toast("History cleared.", "info");
};

// ─── Investigation board wiring ──────────────────────────────
Investigation.onLog = (msg, sev) => logEvent(msg, sev);
Investigation.onFinding = (f) => { toast(`Finding logged · +${f.xp} XP — ${f.category}`, "success"); };
Investigation.onComplete = () => { toast("Enough findings confirmed — you can proceed to Respond.", "success"); };
function loadBoard(caseObj) {
  Investigation.load(caseObj);
  $("invCodename").textContent = `OP · ${caseObj.codename}`;
  $("invCaseTitle").textContent = caseObj.title;
  $("invCaseOrg").textContent = `${caseObj.org} · ${CATEGORY_LABELS[caseObj.id] ? CATEGORY_LABELS[caseObj.id].split(" / ")[0] : caseObj.id}`;
  setInvSeverity(caseObj);
  $("invStats").innerHTML = caseObj.stats.map((s) => `<div class="srow"><span class="k"><span class="i" style="background:${s.i}"></span>${escapeHTML(s.k)}</span><span class="v">${escapeHTML(s.v)}</span></div>`).join("");
}
$("invProceedBtn").onclick = () => proceedToRespond();

function proceedToRespond() {
  $("scenarioOutput").innerHTML = renderMarkdown(state.scenario);
  $("recapBody").innerHTML = renderMarkdown(state.scenario);
  const st = Investigation.stats();
  $("s2Cat").textContent = CATEGORY_LABELS[state.category].split(" / ")[0];
  $("s2Diff").textContent = state.difficulty.toUpperCase();
  $("s2Findings").textContent = `${st.confirmed}/${st.total} confirmed`;
  state.mode = null;
  buildModeGrid();
  $("guideSection").classList.add("hidden");
  const ta = $("responseInput"); ta.disabled = true; ta.value = ""; ta.dispatchEvent(new Event("input"));
  $("submitBtn").disabled = true;
  $("submitMeta").className = "tm-meta"; $("submitMetaText").textContent = "No mode selected";
  $("responseTitle").innerHTML = `Response`;
  $("uplinkFramework").textContent = "AWAITING MODE";
  setObj("triage", "done"); setObj("killchain", "done"); setObj("mode", "now"); setObj("draft", ""); setObj("submit", "");
  navBtns[3].disabled = false; navBtns[4].disabled = true;
  logEvent(`Moved to Respond — ${st.confirmed}/${st.total} findings confirmed`, "g");
  goTo(3);
  toast("Pick an engagement mode and write your response.", "info");
}

// ─── Open Investigation (from Setup) ─────────────────────────
$("generateBtn").onclick = async () => {
  const key = $("apiKey").value.trim();
  const useDemo = state.demo || !key;
  if (!useDemo) { try { checkRateLimit("generate", 5000); } catch (e) { return toast(e.message, "error"); } }
  try { validateDifficulty(state.difficulty); validateCategory(state.category); } catch (e) { return toast(e.message, "error"); }

  state.mode = null;
  const btn = $("generateBtn"); btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> ${useDemo ? "Building case…" : "Generating…"}`;
  try {
    let scenario, fellBack = false;
    if (useDemo) { await demoDelay(850); scenario = DEMO_SCENARIOS[state.category] || DEMO_SCENARIOS.ransomware; }
    else {
      try {
        scenario = await callAPI(key, buildScenarioPrompt(state.difficulty, state.category),
          "Generate a new incident response scenario now.",
          { onRetry: (e, n, d) => toast(`${e.message} Retrying (attempt ${n}, ${Math.round(d / 1000)}s)…`, "info") });
      } catch (err) {
        // Never break a training run — fall back to the baked case.
        scenario = DEMO_SCENARIOS[state.category] || DEMO_SCENARIOS.ransomware;
        fellBack = true;
        toast(`Live AI unavailable — ${err.message} Running the baked case instead.`, "error");
      }
    }
    state.scenario = scenario;

    const caseObj = CASES[state.category] || CASES.ransomware;
    loadBoard(caseObj);

    // reset respond + eval
    $("scenarioOutput").innerHTML = `<div class="idle-msg">Confirm findings on the board, then proceed.</div>`;
    $("evaluationOutput").innerHTML = `<div class="idle-msg">Transmit your response to receive evaluation.</div>`;
    $("scoreBig").textContent = "—"; $("scoreBig").style.color = "var(--ok)";
    $("verdictText").textContent = "Awaiting evaluation"; $("verdictSub").textContent = "";
    $("eventStream").innerHTML = "";
    logEvent(`Case opened — ${caseObj.codename}`, "r");
    logEvent(useDemo ? "Evidence board online" : fellBack ? "Live AI failed — offline case engaged" : "Live AI scenario received", fellBack ? "a" : "g");

    navBtns[2].disabled = false; navBtns[3].disabled = true; navBtns[4].disabled = true;
    goTo(2); startTimer();
    toast("Investigation live — pivot the board and log your findings.", "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Open Investigation`;
  }
};

// ─── Submit for evaluation ───────────────────────────────────
$("submitBtn").onclick = async () => {
  const key = $("apiKey").value.trim();
  const useDemo = state.demo || !key;
  let plan;
  try { validateMode(state.mode || ""); plan = validateResponseInput($("responseInput").value); }
  catch (e) { return toast(e.message, "error"); }
  if (!useDemo) { try { checkRateLimit("submit", 8000); } catch (e) { return toast(e.message, "error"); } }

  stopTimer();
  const responseTime = state.timerSeconds;
  setObj("submit", "done");

  // fold confirmed findings into the graded text (rewards investigation)
  const summary = Investigation.findingsSummary();
  const gradedText = plan.includes("INVESTIGATION FINDINGS") || !summary ? plan : `${summary}\n\n## RESPONSE\n${plan}`;

  const btn = $("submitBtn"); btn.disabled = true; $("responseInput").disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> Evaluating…`;

  navBtns[4].disabled = false; goTo(4);
  $("scoreBig").textContent = "…";
  $("evalFrameworkRt").textContent = (RESPONSE_MODES[state.mode]?.evaluationFocus || "").split(" ").slice(0, 2).join(" ").toUpperCase();
  $("evaluationOutput").innerHTML = `<div class="loading-pulse"><div class="pulse-line w70"></div><div class="pulse-line w90"></div><div class="pulse-line w50"></div><div class="pulse-line w80"></div><div class="pulse-line w60"></div></div>`;

  try {
    let evaluation;
    if (useDemo) { await demoDelay(1100); evaluation = buildDemoEvaluation(state.scenario, gradedText, state.mode, state.difficulty); }
    else {
      try {
        evaluation = await callAPI(key, buildEvaluationPrompt(state.mode), buildEvaluationMessage(state.scenario, gradedText, state.mode),
          { onRetry: (e, n, d) => toast(`${e.message} Retrying (attempt ${n}, ${Math.round(d / 1000)}s)…`, "info") });
      } catch (err) {
        // Grading must never strand a finished response — use the offline evaluator.
        evaluation = `> ⚠ **Live AI grading unavailable** (${err.message.replace(/\n/g, " ")}) — offline evaluator used.\n\n`
          + buildDemoEvaluation(state.scenario, gradedText, state.mode, state.difficulty);
        toast("Live grading failed — offline evaluator used instead.", "error");
      }
    }
    $("evaluationOutput").innerHTML = renderMarkdown(evaluation);
    const match = evaluation.match(/##\s*Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    const aiScore = match ? parseFloat(match[1]) : null;
    const st = Investigation.stats();
    if (aiScore != null) {
      const breakdown = computeScore({
        aiScore, responseTime, difficulty: state.difficulty,
        findingsConfirmed: st.confirmed, findingsTotal: st.total,
      });
      const score = breakdown.final;
      animateScore(score);
      renderBreakdown($("scoreBreakdown"), breakdown);
      const gained = awardXP(score, state.difficulty, st.xp);
      const entry = {
        score, accuracy: aiScore, grade: breakdown.grade,
        responseTime, scenario: state.scenario, evaluation, userPlan: plan,
        modeId: state.mode, categoryLabel: CATEGORY_LABELS[state.category],
        difficultyLabel: DIFFICULTY_LABELS[state.difficulty], category: state.category,
        difficulty: state.difficulty, timestamp: new Date().toLocaleTimeString(),
        findingsStat: `${st.confirmed}/${st.total}`,
      };
      addHistory(entry); setEvalMeta(entry);
      const v = score >= 8 ? "Excellent work." : score >= 5 ? "Needs improvement." : "Critical failures detected.";
      toast(`Grade ${breakdown.grade} · ${score}/10 · +${gained} XP — ${v}`, score >= 7 ? "success" : "error");
    } else { $("scoreBig").textContent = "—"; renderBreakdown($("scoreBreakdown"), null); }
  } catch (err) {
    $("evaluationOutput").innerHTML = `<div class="error-state">⚠ ${escapeHTML(err.message)}</div>`;
    toast(err.message, "error"); goTo(3);
  } finally {
    btn.disabled = false; $("responseInput").disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Transmit`;
  }
};

// ─── Step 4 actions ──────────────────────────────────────────
$("newScenarioBtn").onclick = () => {
  navBtns[2].disabled = true; navBtns[3].disabled = true; navBtns[4].disabled = true;
  $("clockElapsed").textContent = "00:00"; state.timerSeconds = 0;
  goTo(1);
};
$("reviseBtn").onclick = () => {
  goTo(3); $("responseInput").disabled = false; $("submitBtn").disabled = !state.mode;
  startTimer();
  toast("Revise and re-transmit.", "info");
};

// ─── Init ────────────────────────────────────────────────────
function init() {
  state.history = loadHistorySafe(Auth.key("soc_trainer_v3_history"));
  try { state.xp = parseInt(localStorage.getItem(Auth.key("soc_trainer_v4_xp")) || "0", 10) || 0; } catch (_) { state.xp = 0; }
  buildModeGrid(); updateStats(); renderHistory(); renderRadar(); renderRanks(false); updateReady();
}
Auth.ready().then(init);
