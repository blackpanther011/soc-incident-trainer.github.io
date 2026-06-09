// ============================================================
// SOC TRAINER v4 — Investigation Board Controller
// Owns the diagram views, cross-view entity pivot, the
// evidence/entity inspector, and the findings loop.
// ============================================================
import { DIAGRAMS } from "./diagrams.js";
import { RISK, ENTITY_ICON, entityById } from "./case-data.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const Investigation = {
  case: null, view: "timeline", confirmed: new Set(), selected: null,
  onFinding: null, onComplete: null, onLog: null, _completed: false,

  load(caseObj) {
    this.case = caseObj; this.view = "timeline";
    this.confirmed = new Set(); this.selected = null; this._completed = false;
    this.buildTabs();
    this.renderView("timeline");
    this.renderFindings();
    this.renderInspectorEmpty();
    this.updateProgress();
    this.renderNarrative();
  },

  // ── view tabs ──
  buildTabs() {
    const tabs = $("invViewTabs");
    tabs.innerHTML = Object.entries(DIAGRAMS).map(([k, d]) => `
      <button class="inv-tab ${k === this.view ? "on" : ""}" data-view="${k}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${d.icon}</svg>
        <span>${d.label}</span>
      </button>`).join("");
    tabs.querySelectorAll(".inv-tab").forEach((b) => { b.onclick = () => this.switchView(b.dataset.view); });
  },

  switchView(v) {
    this.view = v;
    $("invViewTabs").querySelectorAll(".inv-tab").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    this.renderView(v);
    if (this.selected) this.highlight(this.selected); // keep pivot across views
  },

  renderView(v) {
    const canvas = $("invCanvas");
    canvas.className = `inv-canvas view-${v}`;
    canvas.innerHTML = DIAGRAMS[v].render(this.case);
    this.wireCanvas();
  },

  // ── wire interactions in the freshly-rendered canvas ──
  wireCanvas() {
    const canvas = $("invCanvas");
    // entity pivot: any element with data-ent
    canvas.querySelectorAll("[data-ent]").forEach((el) => {
      el.style.cursor = "pointer";
      el.onclick = (e) => { e.stopPropagation(); this.selectEntity(el.dataset.ent); };
    });
    // evidence selection
    canvas.querySelectorAll("[data-ev]").forEach((el) => {
      el.style.cursor = "pointer";
      el.onclick = (e) => {
        if (e.target.closest(".ev-pin")) return; // handled below
        this.selectEvidence(el.dataset.ev);
      };
    });
    // log-finding buttons
    canvas.querySelectorAll(".ev-pin").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.confirmFinding(b.dataset.finding, true); };
    });
    // evidence source filters
    canvas.querySelectorAll(".ev-filter").forEach((b) => {
      b.onclick = () => {
        canvas.querySelectorAll(".ev-filter").forEach((x) => x.classList.toggle("on", x === b));
        const src = b.dataset.src;
        canvas.querySelectorAll(".ev-row").forEach((r) => {
          r.style.display = (src === "all" || r.dataset.src === src) ? "" : "none";
        });
      };
    });
  },

  // ── cross-view highlight ──
  highlight(entId) {
    const canvas = $("invCanvas");
    const hasAny = !!entId;
    canvas.querySelectorAll("[data-ents]").forEach((el) => {
      const ents = (el.dataset.ents || "").split(/\s+/);
      const match = hasAny && ents.includes(entId);
      el.classList.toggle("pivot-hit", match);
      el.classList.toggle("pivot-dim", hasAny && !match);
    });
    // graph/network edges that touch the entity
    canvas.querySelectorAll("[data-pair]").forEach((el) => {
      const pair = (el.dataset.pair || "").split(/\s+/);
      const match = hasAny && pair.includes(entId);
      el.classList.toggle("pivot-edge-hit", match);
      el.classList.toggle("pivot-dim", hasAny && !match);
    });
  },
  clearHighlight() { this.selected = null; this.highlight(null); this.renderInspectorEmpty(); },

  // ── selection → inspector ──
  selectEntity(id) {
    const e = entityById(this.case, id);
    if (!e) return;
    this.selected = id; this.highlight(id);
    const related = this.case.evidence.filter((ev) => (ev.iocs || []).includes(id));
    const col = RISK[e.risk] || "var(--t3)";
    const meta = Object.entries(e.meta || {}).map(([k, v]) => `<div class="insp-meta-row"><span class="imk">${esc(k)}</span><span class="imv">${esc(v)}</span></div>`).join("");
    $("invInspector").innerHTML = `
      <div class="insp-head" style="--ic:${col}">
        <div class="insp-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ENTITY_ICON[e.type] || ""}</svg></div>
        <div class="insp-ht"><div class="insp-title">${esc(e.label)}</div><div class="insp-sub">${esc(e.type.toUpperCase())} · ${esc(e.sub || "")}</div></div>
        <span class="insp-risk" style="color:${col};border-color:${col}">${esc((e.risk || "").toUpperCase())}</span>
      </div>
      ${meta ? `<div class="insp-meta">${meta}</div>` : ""}
      <div class="insp-sec">Appears in ${related.length} evidence ${related.length === 1 ? "item" : "items"}</div>
      <div class="insp-ev">${related.map((ev) => this.evMini(ev)).join("") || '<div class="insp-empty">No linked evidence.</div>'}</div>
      <button class="insp-clear" id="inspClearBtn">✕ Clear pivot</button>`;
    this.wireInspector();
  },

  selectEvidence(evId) {
    const ev = this.case.evidence.find((e) => e.id === evId);
    if (!ev) return;
    // pivot on the evidence's primary entity (highlight all its entities)
    const primary = (ev.iocs || [])[0] || null;
    this.selected = primary; this.highlight(primary);
    const finding = ev.finding ? this.case.findings.find((f) => f.id === ev.finding) : null;
    const done = ev.finding && this.confirmed.has(ev.finding);
    $("invInspector").innerHTML = `
      <div class="insp-head" style="--ic:var(--cyan)">
        <div class="insp-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18M3 12h18M3 19h18"/></svg></div>
        <div class="insp-ht"><div class="insp-title mono">${esc(ev.event)} · ${esc(ev.source)}</div><div class="insp-sub mono">${esc(ev.time)}</div></div>
      </div>
      <div class="insp-detail">${esc(ev.detail)}</div>
      <div class="insp-sec">Linked artifacts</div>
      <div class="insp-chips">${(ev.iocs || []).map((id) => this.entChipBtn(id)).join("") || '<span class="insp-empty">—</span>'}</div>
      ${finding ? `<div class="insp-finding ${done ? "logged" : ""}">
          <div class="insp-finding-q">◆ ${esc(finding.q)}</div>
          ${done ? `<div class="insp-finding-a">${esc(finding.answer)}</div><div class="insp-logged">✓ LOGGED · +${finding.xp} XP</div>`
            : `<button class="insp-log-btn" data-finding="${esc(finding.id)}">Log this as a finding · +${finding.xp} XP</button>`}
        </div>` : `<div class="insp-noise">No finding tied to this — could be benign noise. Keep digging.</div>`}
      <button class="insp-clear" id="inspClearBtn">✕ Clear pivot</button>`;
    this.wireInspector();
  },

  wireInspector() {
    const insp = $("invInspector");
    const clr = $("inspClearBtn"); if (clr) clr.onclick = () => this.clearHighlight();
    insp.querySelectorAll(".insp-ev-mini").forEach((el) => { el.onclick = () => this.selectEvidence(el.dataset.ev); });
    insp.querySelectorAll(".ent-chip[data-ent]").forEach((el) => { el.onclick = () => this.selectEntity(el.dataset.ent); });
    const lb = insp.querySelector(".insp-log-btn");
    if (lb) lb.onclick = () => this.confirmFinding(lb.dataset.finding, true);
  },

  evMini(ev) {
    const sevC = { r: "var(--red)", o: "var(--orange)", a: "var(--amber)", c: "var(--cyan)", g: "var(--green)" }[ev.sev] || "var(--t3)";
    return `<div class="insp-ev-mini" data-ev="${esc(ev.id)}">
      <span class="iem-sev" style="background:${sevC}"></span>
      <span class="iem-time mono">${esc(ev.time)}</span>
      <span class="iem-detail">${esc(ev.detail)}</span>
      ${ev.finding ? '<span class="iem-flag">◆</span>' : ""}</div>`;
  },
  entChipBtn(id) {
    const e = entityById(this.case, id); if (!e) return "";
    const col = RISK[e.risk] || "var(--t3)";
    return `<span class="ent-chip" data-ent="${esc(id)}" style="--ec:${col}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${ENTITY_ICON[e.type] || ""}</svg>${esc(e.label)}</span>`;
  },
  renderInspectorEmpty() {
    $("invInspector").innerHTML = `<div class="insp-idle">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <div>Select any node, chip or evidence row to pivot the whole board and inspect it.</div></div>`;
  },

  // ── findings ──
  confirmFinding(fid, fromUser) {
    const f = this.case.findings.find((x) => x.id === fid);
    if (!f || this.confirmed.has(fid)) return;
    this.confirmed.add(fid);
    this.renderFindings(); this.updateProgress(); this.renderNarrative();
    // re-render current selection so logged-state shows
    if (this.selected) this.highlight(this.selected);
    if (this.onFinding && fromUser) this.onFinding(f);
    if (this.onLog) this.onLog(`Finding logged — ${f.category}: ${f.q}`, "g");
    // refresh inspector if it's showing this finding's evidence
    const open = $("invInspector").querySelector(`.insp-log-btn[data-finding="${fid}"]`);
    if (open) { const ev = this.case.evidence.find((e) => e.finding === fid); if (ev) this.selectEvidence(ev.id); }
    this.checkComplete();
  },

  renderFindings() {
    const wrap = $("invFindings");
    const total = this.case.findings.length;
    wrap.innerHTML = this.case.findings.map((f) => {
      const done = this.confirmed.has(f.id);
      return `<div class="finding ${done ? "done" : ""}" data-finding="${esc(f.id)}">
        <div class="finding-ck">${done ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : "◆"}</div>
        <div class="finding-body">
          <div class="finding-cat">${esc(f.category)}</div>
          <div class="finding-q">${esc(f.q)}</div>
          ${done ? `<div class="finding-a">${esc(f.answer)}</div>` : `<div class="finding-locked">Find the evidence and log it · +${f.xp} XP</div>`}
        </div>
      </div>`;
    }).join("");
    wrap.querySelectorAll(".finding").forEach((el) => {
      el.onclick = () => {
        const fid = el.dataset.finding;
        const ev = this.case.evidence.find((e) => e.finding === fid);
        if (ev) { this.switchView(this.view === "evidence" ? "evidence" : this.view); this.selectEvidence(ev.id); }
      };
    });
  },

  updateProgress() {
    const total = this.case.findings.length, done = this.confirmed.size;
    const pct = Math.round((done / total) * 100);
    $("invProgFill").style.width = `${pct}%`;
    $("invProgText").textContent = `${done}/${total} findings`;
    $("invProgPct").textContent = `${pct}%`;
  },

  renderNarrative() {
    const beats = [`<div class="nar-beat brief"><span class="nar-k">BRIEFING</span>${esc(this.case.brief)}</div>`];
    const confirmedFindings = this.case.findings.filter((f) => this.confirmed.has(f.id));
    confirmedFindings.forEach((f) => {
      beats.push(`<div class="nar-beat"><span class="nar-k" style="color:var(--green)">ESTABLISHED · ${esc(f.category)}</span>${esc(f.answer)}</div>`);
    });
    if (confirmedFindings.length === this.case.findings.length) {
      beats.push(`<div class="nar-beat done"><span class="nar-k" style="color:var(--cyan)">PICTURE COMPLETE</span>You've reconstructed the full attack. Move to Respond and write the plan that the evidence supports.</div>`);
    }
    $("invNarrative").innerHTML = beats.join("");
    $("invNarrative").scrollTop = $("invNarrative").scrollHeight;
  },

  checkComplete() {
    const total = this.case.findings.length, done = this.confirmed.size;
    const threshold = Math.ceil(total * 0.75);
    const btn = $("invProceedBtn");
    if (done >= threshold) {
      btn.disabled = false;
      btn.querySelector(".ipb-sub").textContent = done === total ? "All findings confirmed" : `${done}/${total} — enough to respond`;
      if (!this._completed) { this._completed = true; if (this.onComplete) this.onComplete(); }
    } else {
      btn.disabled = true;
      btn.querySelector(".ipb-sub").textContent = `Log ${threshold - done} more to proceed`;
    }
  },

  // summary string fed into the response editor / grading
  findingsSummary() {
    const done = this.case.findings.filter((f) => this.confirmed.has(f.id));
    if (!done.length) return "";
    return "## INVESTIGATION FINDINGS\n" + done.map((f) => `- **${f.category}:** ${f.answer}`).join("\n");
  },
  stats() {
    return { confirmed: this.confirmed.size, total: this.case.findings.length, xp: this.case.findings.filter((f) => this.confirmed.has(f.id)).reduce((a, f) => a + f.xp, 0) };
  },
};
