// ============================================================
// SOC TRAINER v4 — "Incident Command"
// Core application: 3-stage flow, gamified, demo + live AI.
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

const $ = (id) => document.getElementById(id);

// ─── State ───────────────────────────────────────────────────
const state = {
  scenario: null, difficulty: "tier2", category: "ransomware", mode: null,
  history: [], hintsUsed: 0, timerSeconds: 0, demo: true, xp: 0,
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

// ─── Mode icons (SVG) ────────────────────────────────────────
const MODE_ICON = {
  ir: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  threat_hunt: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  forensic: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  executive: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  ctf: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
};
const MODE_LABEL_SHORT = { ir: "IR Plan", threat_hunt: "Hunt", forensic: "Forensic", executive: "Exec", ctf: "CTF" };

// ─── Severity map (step 2 gauge) ─────────────────────────────
const SEVERITY = {
  tier1: { v: "4.2", sub: "GUARDED", color: "var(--green)", frac: .42 },
  tier2: { v: "6.4", sub: "ELEVATED", color: "var(--amber)", frac: .64 },
  tier3: { v: "8.1", sub: "HIGH", color: "var(--orange)", frac: .81 },
  apt: { v: "9.4", sub: "CRITICAL", color: "var(--red)", frac: .94 },
};

const DIFF_HINTS = {
  tier1: "Common attack vectors, straightforward observables, no lateral movement. ~15–20 min.",
  tier2: "Moderate complexity — lateral movement, defense evasion, 2–3 log sources. ~20–30 min.",
  tier3: "Multi-stage attack, active C2, ambiguous indicators, difficult tradeoffs. ~30–45 min.",
  apt: "Nation-state TTPs, living-off-the-land, long dwell time already established. ~45–60 min.",
};

const HINTS = {
  ransomware: ["Check `vssadmin` and `wmic` — shadow copy deletion via `vssadmin delete shadows /all /quiet` is near-universal in ransomware pre-encryption.", "Look at the 32 SMB shares. Which user account had write access to all of them? That account is your lateral-movement pivot.", "Event ID 1102 fired one minute *before* the deletion — the attacker cleared logs first. Treat everything after as partially blind."],
  apt: ["The DNS beacon to `cdn-telemetry-eu[.]net` has near-perfect periodicity — that 2% jitter is the tell. Real CDNs don't beacon every 4 hours.", "WMI `__EventConsumer` persistence survives reboots and is invisible to most autoruns tools. Check `Get-WmiObject -Namespace root\\subscription`.", "`svc-backup` authenticating Type 3 to four servers is your lateral path. Map every host that account touched before you contain."],
  insider: ["Cloud-sync activity at 23:47 outside business hours, plus a 1.8 GB archive created 6 minutes prior — correlate the 7-Zip event with the upload timestamp.", "You cannot act unilaterally. The first move is preserving evidence (disk + cloud logs) with chain of custody, not disabling the account.", "Check whether `q4_export.7z` contents match the user's legitimate job function — that's what separates malice from sloppiness."],
  cloud: ["`GetSecretValue` x12 followed by `CreateAccessKey` for a *new* user is the backdoor. Kill that access key before you rotate anything else.", "IMDSv1 + an SSRF in the web app is the initial vector. Enforcing IMDSv2 closes the door permanently.", "The GDPR clock starts at *exfiltration*, not access. The bulk `GetObject` on `acme-customer-exports` is your evidence it started."],
  supply_chain: ["The signature is valid but the signing cert is 6 days old from a never-before-used CA — that's the supply-chain tell, not the binary behavior alone.", "Don't disable all 200 agents at once — you'll blind yourself mid-incident. Quarantine a sample and detonate v8.4.1 in a sandbox first.", "Compare the v8.4.1 hash against the vendor's published release hash. A mismatch is proof; a match means the vendor's build pipeline is compromised."],
  web: ["The exploit is in the `fmt` parameter of `/api/v2/report/export` — grep raw access logs for that exact payload across all 4 nodes, not just WEB-PROD-02.", "Look for child processes of `w3wp.exe` — `cmd.exe`/`powershell.exe` spawned by the web server is the post-exploitation signal on the other nodes.", "`info.aspx` is the web shell. Find its creation timestamp on each node — that tells you which nodes are actually compromised."],
};

const TEMPLATES = {
  ir: `## CONTAINMENT\n### Immediate (0–4h):\n- \n### Long-term:\n- \n\n## ERADICATION\n### Root cause removal:\n- \n### Verification:\n- \n\n## RECOVERY\n### Restoration:\n- \n### Post-recovery monitoring:\n- \n\n## COMMUNICATION\n### Internal / External:\n- \n\n## POST-INCIDENT\n### Lessons learned:\n- `,
  threat_hunt: `## HYPOTHESIS\nThreat actor is [X] based on [Y].\n\n## DATA SOURCES\n- \n\n## HUNT QUERIES\n### Query 1:\nLogic: \n\n## PIVOT POINTS\n- IOC → pivot to:\n\n## SCOPE ASSESSMENT\n### Compromised hosts / accounts / data:\n- `,
  forensic: `## EVIDENCE PRESERVATION\n### Order of volatility:\n1. RAM / processes\n2. Network state\n3. Disk image\n### Chain of custody:\n- Collected by / time / hash:\n\n## ARTIFACT COLLECTION\n- \n\n## TIMELINE RECONSTRUCTION\n| Time | Event | Source |\n|---|---|---|\n|  |  |  |\n\n## CONCLUSIONS\n### Root cause / attribution confidence:\n- `,
  executive: `## SITUATION SUMMARY\n[2–3 sentences, no jargon]\n\n## BUSINESS IMPACT\n- Affected systems / downtime / exposure / regulatory:\n\n## CURRENT STATUS\n🔴 RED / 🟡 AMBER / 🟢 GREEN — \n\n## ACTIONS TAKEN\n- \n\n## DECISIONS REQUIRED\n- [ ] `,
  ctf: `## IOC EXTRACTION\n### IPs / Domains / Hashes / Paths / Accounts:\n- \n\n## ATTACK CHAIN\n1. Initial access:\n2. Execution:\n3. Persistence:\n4. Lateral movement:\n5. Exfiltration:\n\n## MITRE ATT&CK\n| Technique | Name | Evidence |\n|---|---|---|\n|  |  |  |\n\n## CRITICAL ANSWERS\n- Patient zero / initial vector / dwell time:\n\n## RED HERRINGS\n- `,
};

// ─── Page nav ────────────────────────────────────────────────
const stages = { 1: $("stage1"), 2: $("stage2"), 3: $("stage3") };
const navBtns = { 1: $("nav1"), 2: $("nav2"), 3: $("nav3") };
const THREAT = { 1: "idle", 2: "active", 3: "graded" };
const STATUS = { 1: ["idle", "STANDBY"], 2: ["active", "LIVE INCIDENT"], 3: ["graded", "RESOLVED"] };
const CLOCK2 = { 1: ["—", "STATUS"], 2: ["", "TO DEADLINE"], 3: ["RESOLVED", "OUTCOME"] };

function goTo(n) {
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
  if (n !== 2) { $("clockSecondary").textContent = v; $("clockSecondary").className = "v"; $("clockSecondary").style.color = n === 3 ? "var(--green)" : "var(--t2)"; }
}
navBtns[1].onclick = () => goTo(1);
navBtns[2].onclick = () => { if (!navBtns[2].disabled) goTo(2); };
navBtns[3].onclick = () => { if (!navBtns[3].disabled) goTo(3); };

// ─── Timer + dual clock ──────────────────────────────────────
let timerInterval = null;
const DEADLINE = 18 * 3600; // 18h flavor countdown
function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function startTimer() {
  stopTimer(); state.timerSeconds = 0;
  tickClock();
  timerInterval = setInterval(() => { state.timerSeconds++; tickClock(); }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }
function tickClock() {
  $("clockElapsed").textContent = fmt(state.timerSeconds);
  const rem = Math.max(0, DEADLINE - state.timerSeconds);
  const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60);
  const el = $("clockSecondary");
  if (document.body.dataset.threat === "active") {
    el.textContent = `${h}:${String(m).padStart(2, "0")}`;
    el.className = "v warn";
  }
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
  const ts = new Date().toLocaleTimeString("en-GB");
  const row = document.createElement("div");
  row.className = "eev";
  row.innerHTML = `<span class="ets">${ts}</span><span class="esv ${sev}"></span><span class="emsg">${escapeHTML(msg)}</span>`;
  stream.prepend(row);
  while (stream.children.length > 7) stream.lastChild.remove();
}

// ─── Objectives ──────────────────────────────────────────────
function setObj(key, st) {
  const el = document.querySelector(`.obj[data-obj="${key}"]`);
  if (!el) return;
  el.classList.remove("done", "now");
  if (st) el.classList.add(st);
}

// ─── Difficulty / category selectors ─────────────────────────
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

// ─── Demo toggle ─────────────────────────────────────────────
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
  $("charCount").style.color = len < 100 ? "var(--red)" : len < 300 ? "var(--amber)" : "var(--green)";
  if (state.mode) {
    if (len >= 50) { setObj("draft", "done"); setObj("submit", "now"); }
    else { setObj("draft", "now"); setObj("submit", ""); }
  }
});

// ─── Mode grid ───────────────────────────────────────────────
function buildModeGrid() {
  const grid = $("modeGrid");
  grid.innerHTML = Object.values(RESPONSE_MODES).map((m) => `
    <button class="mode" data-mode="${m.id}" style="--mc:${m.color}" ${state.scenario ? "" : "disabled"}>
      <span class="mi"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${MODE_ICON[m.id]}</svg></span>
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
  $("guideBody").innerHTML = m.guide.map((g) => `
    <div class="gcard"><span class="gtag" style="background:${m.color}1f;color:${m.color};border:1px solid ${m.color}55">${g.heading}</span><p>${g.hint}</p></div>`).join("");
  $("guideBody").style.display = "";
  $("guideCollapseBtn").textContent = "▼ HIDE";

  $("responseTitle").innerHTML = `${m.label} <span class="tag" id="responseTag">${MODE_LABEL_SHORT[id].toUpperCase()} · ARMED</span>`;
  $("uplinkFramework").textContent = m.evaluationFocus.split(" ").slice(0, 2).join(" ").toUpperCase();
  const ta = $("responseInput");
  ta.disabled = false; ta.value = "";
  const ph = {
    ir: "Draft your Incident Response Plan…\n\nContainment → Eradication → Recovery → Communication. Cite the IOCs. Hit ⌘ Template for scaffolding.",
    threat_hunt: "Draft your Threat Hunt…\n\nStart with a hypothesis, then data sources, query logic, pivot points, and scope.",
    forensic: "Draft your Forensic Investigation…\n\nEvidence preservation (order of volatility), artifacts, timeline, analysis.",
    executive: "Draft your Executive Briefing…\n\nNo jargon. Impact, RAG status, actions taken, decisions needed from leadership.",
    ctf: "Hunt the flags…\n\nExtract every IOC, reconstruct the kill chain, map MITRE ATT&CK IDs, answer the key questions.",
  };
  ta.placeholder = ph[id] || "Draft your response…";
  ta.dispatchEvent(new Event("input"));
  $("submitBtn").disabled = false;
  $("submitMeta").className = "tm-meta ready";
  $("submitMetaText").textContent = `${m.label} armed`;
  setObj("mode", "done"); setObj("draft", "now");
  logEvent(`Engagement mode set → ${m.label}`, "c");
}

// ─── Guide toggle ────────────────────────────────────────────
$("guideToggle").onclick = () => {
  const body = $("guideBody");
  const hidden = body.style.display === "none";
  body.style.display = hidden ? "" : "none";
  $("guideCollapseBtn").textContent = hidden ? "▼ HIDE" : "▶ SHOW";
};

// ─── Templates ───────────────────────────────────────────────
$("templateBtn").onclick = () => {
  if (!state.mode) { toast("Select an engagement mode first.", "error"); return; }
  const t = TEMPLATES[state.mode] || "";
  const ta = $("responseInput");
  if (ta.value.trim() && ta.value !== t && !confirm("Replace current notes with the template?")) return;
  ta.value = t; ta.dispatchEvent(new Event("input")); ta.focus();
  logEvent(`Inserted ${RESPONSE_MODES[state.mode].label} template`, "c");
};

// ─── Hints ───────────────────────────────────────────────────
$("hintBtn").onclick = () => {
  const hints = HINTS[state.category] || [];
  if (state.hintsUsed >= hints.length) { toast("No more hints available.", "info"); return; }
  toast(hints[state.hintsUsed].replace(/`/g, ""), "hint");
  logEvent("Hint requested", "a");
  state.hintsUsed++;
  $("hintCount").textContent = Math.max(0, hints.length - state.hintsUsed);
  if (state.hintsUsed >= hints.length) { $("hintBtn").disabled = true; }
};

// ─── Severity gauge (step 2) ─────────────────────────────────
const CIRC = 2 * Math.PI * 72;
function setSeverity(diff) {
  const s = SEVERITY[diff];
  $("sevRing").style.stroke = s.color;
  $("sevRing").style.strokeDasharray = `${CIRC}`;
  $("sevRing").style.strokeDashoffset = `${CIRC}`;
  $("sevBig").style.color = s.color; $("sevSub").style.color = s.color; $("sevSub").textContent = s.sub;
  $("sevSweep").style.borderTopColor = s.color;
  requestAnimationFrame(() => { $("sevRing").style.strokeDashoffset = `${CIRC * (1 - s.frac)}`; });
  let cur = 0; const target = parseFloat(s.v);
  const iv = setInterval(() => { cur = Math.min(cur + target / 28, target); $("sevBig").textContent = cur.toFixed(1); if (cur >= target) { $("sevBig").textContent = s.v; clearInterval(iv); } }, 32);
}

// ─── Score gauge (step 3) ────────────────────────────────────
function animateScore(score) {
  const color = score >= 8 ? "var(--green)" : score >= 5 ? "var(--amber)" : "var(--red)";
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
function awardXP(score, diff) {
  const bonus = { tier1: 10, tier2: 25, tier3: 45, apt: 70 }[diff] || 0;
  const gained = Math.round(score * 40 + bonus);
  state.xp += gained;
  try { localStorage.setItem("soc_trainer_v4_xp", String(state.xp)); } catch (_) {}
  $("xpEarnedVal").textContent = `+${gained}`;
  $("xpEarnedVal").classList.remove("xp-gain-pop"); void $("xpEarnedVal").offsetWidth; $("xpEarnedVal").classList.add("xp-gain-pop");
  renderRanks(true);
  return gained;
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
  updateStats(); renderHistory();
  try { localStorage.setItem("soc_trainer_v3_history", JSON.stringify(state.history)); } catch (_) {}
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
  list.querySelectorAll(".hitem").forEach((el) => {
    el.onclick = () => loadHistoryEntry(state.history[+el.dataset.idx]);
  });
}
function loadHistoryEntry(e) {
  state.scenario = e.scenario; state.mode = e.modeId;
  state.difficulty = e.difficulty || state.difficulty; state.category = e.category || state.category;
  $("scenarioOutput").innerHTML = renderMarkdown(e.scenario);
  $("recapBody").innerHTML = renderMarkdown(e.scenario);
  $("evaluationOutput").innerHTML = renderMarkdown(e.evaluation);
  setEvalMeta(e); animateScore(e.score);
  $("evalFrameworkRt").textContent = (RESPONSE_MODES[e.modeId]?.evaluationFocus || "").split(" ").slice(0, 2).join(" ").toUpperCase();
  navBtns[2].disabled = false; navBtns[3].disabled = false;
  goTo(3);
  toast("Loaded past operation.", "info");
}
function setEvalMeta(e) {
  const m = RESPONSE_MODES[e.modeId];
  $("evalMode").textContent = m ? m.label : "—";
  $("evalCategory").textContent = e.categoryLabel || "—";
  $("evalDifficulty").textContent = e.difficultyLabel?.split("—")[1]?.trim() || "—";
  const mm = Math.floor((e.responseTime || 0) / 60), ss = ((e.responseTime || 0) % 60).toString().padStart(2, "0");
  $("evalTime").textContent = e.responseTime ? `${mm}m ${ss}s` : "—";
}

// ─── Recap toggle ────────────────────────────────────────────
$("recapToggle").onclick = () => {
  const hidden = $("recapBody").classList.toggle("hidden");
  $("recapIcon").textContent = hidden ? "▶" : "▼";
};

// ─── Export ──────────────────────────────────────────────────
$("exportBtn").onclick = () => {
  if (!state.scenario) { toast("No session to export.", "error"); return; }
  const e = state.history[0]; const m = state.mode ? RESPONSE_MODES[state.mode] : null;
  const content = [
    `# SOC TRAINER — OPERATION EXPORT`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Tier:** ${DIFFICULTY_LABELS[state.difficulty]}`,
    `**Class:** ${CATEGORY_LABELS[state.category]}`,
    m ? `**Mode:** ${m.label}` : "",
    e?.score != null ? `**Score:** ${e.score}/10` : "",
    `\n---\n\n## SCENARIO\n\n${state.scenario}`,
    e?.userPlan ? `\n---\n\n## YOUR RESPONSE\n\n${e.userPlan}` : "",
    e?.evaluation ? `\n---\n\n## EVALUATION\n\n${e.evaluation}` : "",
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  a.download = `soc-operation-${Date.now()}.md`; a.click();
  URL.revokeObjectURL(a.href);
  toast("Operation exported.", "success");
};
$("clearBtn").onclick = () => {
  if (!confirm("Clear all operation history?")) return;
  state.history = []; localStorage.removeItem("soc_trainer_v3_history");
  updateStats(); renderHistory(); toast("History cleared.", "info");
};

// ─── Generate ────────────────────────────────────────────────
$("generateBtn").onclick = async () => {
  const key = $("apiKey").value.trim();
  const useDemo = state.demo || !key;
  if (!useDemo) { try { checkRateLimit("generate", 5000); } catch (e) { return toast(e.message, "error"); } }
  try { validateDifficulty(state.difficulty); validateCategory(state.category); } catch (e) { return toast(e.message, "error"); }

  state.mode = null; state.hintsUsed = 0;
  const btn = $("generateBtn"); btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> ${useDemo ? "Spinning up range…" : "Generating…"}`;

  // pre-stage step 2 loading
  $("scenarioOutput").innerHTML = `<div class="loading-pulse"><div class="pulse-line w60"></div><div class="pulse-line w90"></div><div class="pulse-line w50"></div><div class="pulse-line w80"></div><div class="pulse-line w70"></div><div class="pulse-line w40"></div></div>`;

  try {
    let scenario;
    if (useDemo) { await demoDelay(950); scenario = DEMO_SCENARIOS[state.category] || DEMO_SCENARIOS.ransomware; }
    else { scenario = await callAPI(key, buildScenarioPrompt(state.difficulty, state.category), "Generate a new incident response scenario now."); }
    state.scenario = scenario;

    // populate step 2
    $("scenarioOutput").innerHTML = renderMarkdown(scenario);
    $("recapBody").innerHTML = renderMarkdown(scenario);
    setSeverity(state.difficulty);
    $("s2Cat").textContent = CATEGORY_LABELS[state.category].split(" / ")[0];
    $("s2Diff").textContent = state.difficulty.toUpperCase();

    buildModeGrid();
    $("guideSection").classList.add("hidden");
    const ta = $("responseInput"); ta.disabled = true; ta.value = ""; ta.dispatchEvent(new Event("input"));
    $("submitBtn").disabled = true;
    $("submitMeta").className = "tm-meta"; $("submitMetaText").textContent = "No mode selected";
    $("responseTitle").innerHTML = `Response`;
    $("uplinkFramework").textContent = "AWAITING MODE";
    $("hintBtn").classList.remove("hidden"); $("hintBtn").disabled = false; $("hintCount").textContent = "3";

    // reset step 3
    $("evaluationOutput").innerHTML = `<div class="idle-msg">Transmit your response to receive evaluation.</div>`;
    $("scoreBig").textContent = "—"; $("scoreBig").style.color = "var(--green)";
    $("verdictText").textContent = "Awaiting evaluation"; $("verdictSub").textContent = "";

    // objectives + events
    setObj("triage", "done"); setObj("killchain", "done"); setObj("mode", "now");
    setObj("draft", ""); setObj("submit", "");
    $("eventStream").innerHTML = "";
    logEvent(`Incident generated — ${CATEGORY_LABELS[state.category].split(" / ")[0]} · ${state.difficulty.toUpperCase()}`, "r");
    logEvent("IOCs extracted · kill chain mapped", "o");
    logEvent(useDemo ? "Demo range online" : "Live AI scenario received", "g");

    navBtns[2].disabled = false; navBtns[3].disabled = true;
    goTo(2); startTimer();
    toast("Incident live — select an engagement mode.", "success");
  } catch (err) {
    toast(err.message, "error");
    $("scenarioOutput").innerHTML = `<div class="error-state">⚠ ${escapeHTML(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Initiate Incident`;
  }
};

// ─── Submit ──────────────────────────────────────────────────
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
  logEvent("Response transmitted for evaluation", "c");

  const btn = $("submitBtn"); btn.disabled = true; $("responseInput").disabled = true;
  btn.innerHTML = `<span class="btn-spinner"></span> Evaluating…`;

  navBtns[3].disabled = false; goTo(3);
  $("scoreBig").textContent = "…";
  $("evalFrameworkRt").textContent = (RESPONSE_MODES[state.mode]?.evaluationFocus || "").split(" ").slice(0, 2).join(" ").toUpperCase();
  $("evaluationOutput").innerHTML = `<div class="loading-pulse"><div class="pulse-line w70"></div><div class="pulse-line w90"></div><div class="pulse-line w50"></div><div class="pulse-line w80"></div><div class="pulse-line w60"></div><div class="pulse-line w75" style="width:75%"></div></div>`;

  try {
    let evaluation;
    if (useDemo) { await demoDelay(1150); evaluation = buildDemoEvaluation(state.scenario, plan, state.mode, state.difficulty); }
    else { evaluation = await callAPI(key, buildEvaluationPrompt(state.mode), buildEvaluationMessage(state.scenario, plan, state.mode)); }

    $("evaluationOutput").innerHTML = renderMarkdown(evaluation);
    const match = evaluation.match(/##\s*Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    const score = match ? parseFloat(match[1]) : null;

    if (score != null) {
      animateScore(score);
      const gained = awardXP(score, state.difficulty);
      const entry = {
        score, responseTime, scenario: state.scenario, evaluation, userPlan: plan,
        modeId: state.mode, categoryLabel: CATEGORY_LABELS[state.category],
        difficultyLabel: DIFFICULTY_LABELS[state.difficulty], category: state.category,
        difficulty: state.difficulty, timestamp: new Date().toLocaleTimeString(),
      };
      addHistory(entry); setEvalMeta(entry);
      logEvent(`Evaluation complete — ${score}/10 · +${gained} XP`, score >= 7 ? "g" : "r");
      const v = score >= 8 ? "Excellent work." : score >= 5 ? "Needs improvement." : "Critical failures detected.";
      toast(`Score ${score}/10 · +${gained} XP — ${v}`, score >= 7 ? "success" : "error");
    } else {
      $("scoreBig").textContent = "—";
    }
  } catch (err) {
    $("evaluationOutput").innerHTML = `<div class="error-state">⚠ ${escapeHTML(err.message)}</div>`;
    toast(err.message, "error"); goTo(2);
  } finally {
    btn.disabled = false; $("responseInput").disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Transmit`;
  }
};

// ─── Step 3 actions ──────────────────────────────────────────
$("newScenarioBtn").onclick = () => {
  navBtns[2].disabled = true; navBtns[3].disabled = true;
  $("clockElapsed").textContent = "00:00"; state.timerSeconds = 0;
  goTo(1);
};
$("reviseBtn").onclick = () => {
  goTo(2); $("responseInput").disabled = false; $("submitBtn").disabled = !state.mode;
  startTimer();
  toast("Revise and re-transmit.", "info");
};

// ─── Init ────────────────────────────────────────────────────
function init() {
  state.history = loadHistorySafe("soc_trainer_v3_history");
  try { state.xp = parseInt(localStorage.getItem("soc_trainer_v4_xp") || "0", 10) || 0; } catch (_) { state.xp = 0; }
  buildModeGrid(); updateStats(); renderHistory(); renderRanks(false); updateReady();
}
init();
