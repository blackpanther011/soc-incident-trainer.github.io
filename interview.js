// ============================================================
// SOC TRAINER v4 — Interview Room controller
// Scenario question bank · type your answer · reveal model
// answer + talking points · self-rate or AI feedback.
// ============================================================
import { INTERVIEW_QUESTIONS, INTERVIEW_CATEGORIES } from "./interview-data.js";
import { callAPI } from "./api.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const LS = "soc_trainer_v4_interview";

export const Interview = {
  filter: "all", current: null, revealed: false, practiced: new Set(),
  getKey: () => "", toast: null, log: null,

  init() {
    try { this.practiced = new Set(JSON.parse(localStorage.getItem(LS) || "[]")); } catch (_) { this.practiced = new Set(); }
    this.buildFilters();
    this.renderList();
    this.select(INTERVIEW_QUESTIONS[0].id);
    this.updateProgress();
  },

  buildFilters() {
    const wrap = $("ivFilters");
    const cats = [["all", "All"], ...Object.entries(INTERVIEW_CATEGORIES)];
    wrap.innerHTML = cats.map(([k, v]) => `<button class="iv-filter ${k === this.filter ? "on" : ""}" data-cat="${k}">${esc(v)}</button>`).join("");
    wrap.querySelectorAll(".iv-filter").forEach((b) => {
      b.onclick = () => { this.filter = b.dataset.cat; this.buildFilters(); this.renderList(); };
    });
  },

  renderList() {
    const list = $("ivList");
    const qs = INTERVIEW_QUESTIONS.filter((q) => this.filter === "all" || q.cat === this.filter);
    const lvlColor = { Entry: "var(--green)", Mid: "var(--amber)", Senior: "var(--orange)" };
    list.innerHTML = qs.map((q) => `
      <div class="iv-item ${this.current === q.id ? "on" : ""} ${this.practiced.has(q.id) ? "done" : ""}" data-q="${q.id}">
        <div class="iv-item-top">
          <span class="iv-cat">${esc(INTERVIEW_CATEGORIES[q.cat])}</span>
          <span class="iv-lvl" style="color:${lvlColor[q.level]};border-color:${lvlColor[q.level]}">${esc(q.level)}</span>
        </div>
        <div class="iv-item-q">${esc(q.q)}</div>
        ${this.practiced.has(q.id) ? '<div class="iv-item-done">✓ practiced</div>' : ""}
      </div>`).join("") || '<div class="iv-empty">No questions in this category.</div>';
    list.querySelectorAll(".iv-item").forEach((el) => { el.onclick = () => this.select(el.dataset.q); });
  },

  select(id) {
    const q = INTERVIEW_QUESTIONS.find((x) => x.id === id);
    if (!q) return;
    this.current = id; this.revealed = false;
    this.renderList();
    const lvlColor = { Entry: "var(--green)", Mid: "var(--amber)", Senior: "var(--orange)" };
    $("ivQuestion").innerHTML = `
      <div class="ivq-meta">
        <span class="ivq-cat">${esc(INTERVIEW_CATEGORIES[q.cat])}</span>
        <span class="ivq-lvl" style="color:${lvlColor[q.level]};border-color:${lvlColor[q.level]}">${esc(q.level)} LEVEL</span>
      </div>
      <div class="ivq-text">${esc(q.q)}</div>
      <div class="ivq-answer-wrap">
        <div class="ivq-answer-hd"><span>Your answer</span><span class="ivq-tip">Say it out loud, or type — then reveal the model answer</span></div>
        <textarea id="ivAnswerInput" class="ivq-textarea" placeholder="Structure your answer… (what you'd check, in what order, and why)" spellcheck="false"></textarea>
      </div>
      <div class="ivq-actions">
        <button class="btn btn-primary" id="ivRevealBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Reveal Model Answer</button>
        <button class="btn btn-ghost" id="ivAiBtn">✦ AI Feedback</button>
      </div>
      <div class="ivq-model hidden" id="ivModel"></div>`;
    $("ivRevealBtn").onclick = () => this.reveal();
    $("ivAiBtn").onclick = () => this.aiFeedback();
    this.renderSide(q);
  },

  reveal() {
    const q = INTERVIEW_QUESTIONS.find((x) => x.id === this.current);
    if (!q) return;
    this.revealed = true;
    if (!this.practiced.has(q.id)) { this.practiced.add(q.id); this.persist(); this.updateProgress(); this.renderList(); }
    const model = $("ivModel");
    model.classList.remove("hidden");
    model.innerHTML = `
      <div class="ivm-hd"><span class="ivm-k">MODEL ANSWER</span><span class="ivm-note">one strong way to answer — not the only way</span></div>
      <div class="ivm-body">${esc(q.answer)}</div>
      <div class="ivm-selfrate">
        <span>How did your answer compare?</span>
        <div class="ivm-rates">
          <button class="ivm-rate" data-r="nailed">Nailed it</button>
          <button class="ivm-rate" data-r="partial">Partial</button>
          <button class="ivm-rate" data-r="missed">Missed it</button>
        </div>
      </div>`;
    model.querySelectorAll(".ivm-rate").forEach((b) => {
      b.onclick = () => {
        model.querySelectorAll(".ivm-rate").forEach((x) => x.classList.toggle("on", x === b));
        if (this.toast) this.toast(b.dataset.r === "nailed" ? "Logged — strong answer." : b.dataset.r === "partial" ? "Logged — review the talking points." : "Logged — re-read the model answer and retry.", b.dataset.r === "missed" ? "error" : "success");
      };
    });
    model.scrollIntoView && null; // avoid scrollIntoView per guidelines
    $("ivModel").classList.remove("hidden");
    // reveal side talking points
    $("ivSide").querySelectorAll(".ivs-point").forEach((p) => p.classList.add("show"));
  },

  renderSide(q) {
    $("ivSide").innerHTML = `
      <div class="seg-label">Talking Points</div>
      <div class="ivs-points">
        ${q.points.map((p) => `<div class="ivs-point"><span class="ivs-dot">◆</span><span>${esc(p)}</span></div>`).join("")}
      </div>
      <div class="seg-label" style="margin-top:6px">Likely Follow-ups</div>
      <div class="ivs-follow">
        ${q.followups.map((f) => `<div class="ivs-f">${esc(f)}</div>`).join("")}
      </div>
      <div class="ivs-hint">Talking points reveal with the model answer. Try to hit them before you peek.</div>`;
  },

  async aiFeedback() {
    const q = INTERVIEW_QUESTIONS.find((x) => x.id === this.current);
    const ans = ($("ivAnswerInput") && $("ivAnswerInput").value || "").trim();
    if (!ans) { if (this.toast) this.toast("Type your answer first, then get AI feedback.", "error"); return; }
    const key = this.getKey();
    if (!key) { if (this.toast) this.toast("AI feedback needs an API key (Mission Setup). Use Reveal + self-rate in Demo mode.", "info"); return; }
    const btn = $("ivAiBtn"); btn.disabled = true; btn.innerHTML = `<span class="btn-spinner"></span> Reviewing…`;
    try {
      const sys = "You are a senior SOC hiring manager giving concise, candid interview feedback. In under 160 words: what was strong, what was missing or wrong, and one tip to level up. Reference the key points a great answer would hit. Be direct but encouraging. Use short markdown.";
      const msg = `INTERVIEW QUESTION:\n${q.q}\n\nKEY POINTS A STRONG ANSWER HITS:\n${q.points.join("\n")}\n\nCANDIDATE ANSWER:\n${ans}\n\nGive feedback.`;
      const out = await callAPI(key, sys, msg);
      this.reveal();
      const fb = document.createElement("div");
      fb.className = "ivm-aifeedback";
      fb.innerHTML = `<div class="ivm-k" style="color:var(--cyan)">✦ AI FEEDBACK</div><div class="ivm-body">${esc(out)}</div>`;
      $("ivModel").appendChild(fb);
    } catch (e) {
      if (this.toast) this.toast(e.message, "error");
    } finally {
      btn.disabled = false; btn.innerHTML = "✦ AI Feedback";
    }
  },

  updateProgress() {
    const total = INTERVIEW_QUESTIONS.length, done = this.practiced.size;
    if ($("ivProgFill")) $("ivProgFill").style.width = `${Math.round((done / total) * 100)}%`;
    if ($("ivProgText")) $("ivProgText").textContent = `${done}/${total} practiced`;
  },
  persist() { try { localStorage.setItem(LS, JSON.stringify([...this.practiced])); } catch (_) {} },
};
