// ============================================================
// SOC TRAINER v5 — Scoring & Feedback Module
// Composite triage score:
//   60% accuracy   — the AI/offline evaluator's quality score
//   25% coverage   — findings confirmed on the investigation board
//   15% speed      — response time vs a per-tier par time
// ============================================================

import { escapeHTML } from "./security.js";

// Par times (seconds) mirror the estimated effort per threat tier.
export const PAR_TIMES = { tier1: 1200, tier2: 1800, tier3: 2700, apt: 3600 };

const GRADES = [
  { min: 9,   g: "S",  label: "Elite triage",        color: "var(--ok)" },
  { min: 8,   g: "A",  label: "Operational standard", color: "var(--ok)" },
  { min: 6.5, g: "B",  label: "Solid, gaps remain",   color: "var(--cyan)" },
  { min: 5,   g: "C",  label: "Adequate",             color: "var(--warn)" },
  { min: 3.5, g: "D",  label: "Below standard",       color: "var(--warn)" },
  { min: 0,   g: "F",  label: "Failed triage",        color: "var(--crit)" },
];

/**
 * computeScore({ aiScore, responseTime, difficulty, findingsConfirmed, findingsTotal })
 * → { final, grade, gradeLabel, gradeColor, components: [{key,label,value,weight,detail}] }
 * All component values are on a 0–10 scale.
 */
export function computeScore({ aiScore, responseTime, difficulty, findingsConfirmed, findingsTotal }) {
  const accuracy = Math.max(0, Math.min(10, aiScore));

  // Coverage: how much of the evidence picture was actually confirmed.
  const coverage = findingsTotal > 0 ? (findingsConfirmed / findingsTotal) * 10 : accuracy;

  // Speed: full marks at or under par, linear decay to 0 at 2× par.
  const par = PAR_TIMES[difficulty] || PAR_TIMES.tier2;
  const t = Math.max(0, responseTime || 0);
  const speed = t <= par ? 10 : Math.max(0, 10 * (1 - (t - par) / par));

  const final = Math.round((accuracy * 0.6 + coverage * 0.25 + speed * 0.15) * 10) / 10;
  const grade = GRADES.find((x) => final >= x.min) || GRADES[GRADES.length - 1];

  const mm = Math.floor(t / 60), parM = Math.round(par / 60);
  return {
    final, grade: grade.g, gradeLabel: grade.label, gradeColor: grade.color,
    components: [
      { key: "accuracy", label: "Accuracy",  value: accuracy, weight: 60, detail: "Evaluator quality score" },
      { key: "coverage", label: "Coverage",  value: Math.round(coverage * 10) / 10, weight: 25, detail: `${findingsConfirmed}/${findingsTotal} findings confirmed` },
      { key: "speed",    label: "Speed",     value: Math.round(speed * 10) / 10, weight: 15, detail: `${mm}m vs ${parM}m par` },
    ],
  };
}

const barColor = (v) => (v >= 8 ? "var(--ok)" : v >= 5 ? "var(--warn)" : "var(--crit)");

/** Render the breakdown panel into a container element. */
export function renderBreakdown(el, b) {
  if (!el) return;
  if (!b) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="sb-head">
      <span class="seg-label" style="margin:0">Score Breakdown</span>
      <span class="sb-grade" style="--gc:${b.gradeColor}">${escapeHTML(b.grade)}<small>${escapeHTML(b.gradeLabel)}</small></span>
    </div>
    ${b.components.map((c) => `
      <div class="sb-row">
        <div class="sb-top">
          <span class="sb-k">${escapeHTML(c.label)} <em>${c.weight}%</em></span>
          <span class="sb-v mono">${c.value.toFixed(1)}</span>
        </div>
        <div class="sb-bar"><div class="sb-fill" style="--w:${c.value * 10}%;background:${barColor(c.value)}"></div></div>
        <div class="sb-detail">${escapeHTML(c.detail)}</div>
      </div>`).join("")}`;
  // animate the fills in after paint
  requestAnimationFrame(() => el.querySelectorAll(".sb-fill").forEach((f) => f.classList.add("grow")));
}
