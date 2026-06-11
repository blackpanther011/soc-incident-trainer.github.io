// ============================================================
// SOC TRAINER v4 — Diagram Renderers
// Pure functions → HTML strings. Every interactive element
// carries data-ent / data-ents / data-ev so the board can
// pivot-highlight an entity across ALL views at once.
// ============================================================
import { RISK, ENTITY_ICON, entityById } from "./case-data.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sevColor = { r: "var(--red)", o: "var(--orange)", a: "var(--amber)", c: "var(--cyan)", g: "var(--green)" };

// ─── 1 · TIMELINE ────────────────────────────────────────────
export function renderTimeline(c) {
  const rows = c.evidence.map((e) => {
    const ents = (e.iocs || []).join(" ");
    return `<div class="tl-row" data-ev="${e.id}" data-ents="${esc(ents)}">
      <div class="tl-time mono">${esc(e.time)}</div>
      <div class="tl-spine"><span class="tl-dot" style="background:${sevColor[e.sev] || "var(--t3)"}"></span></div>
      <div class="tl-card">
        <div class="tl-card-hd"><span class="tl-src">${esc(e.source)}</span><span class="tl-eid mono">${esc(e.event)}</span>${e.finding ? '<span class="tl-link" title="Tied to a finding">◆</span>' : ""}</div>
        <div class="tl-detail">${esc(e.detail)}</div>
        <div class="tl-ents">${(e.iocs || []).map((id) => entChip(c, id)).join("")}</div>
      </div>
    </div>`;
  }).join("");
  return `<div class="tl-wrap">${rows}</div>`;
}

// ─── 2 · ATTACK CHAIN (kill-chain flow) ──────────────────────
export function renderAttackChain(c) {
  const statusCls = { confirmed: "ac-confirmed", suspected: "ac-suspected", unknown: "ac-unknown" };
  const cards = c.attackChain.map((s, i) => {
    const ents = (s.entityIds || []).join(" ");
    return `<div class="ac-node ${statusCls[s.status] || ""}" data-ents="${esc(ents)}">
      <div class="ac-stage">${esc(s.stage)}</div>
      <div class="ac-tech mono">${esc(s.technique)}</div>
      <div class="ac-title">${esc(s.title)}</div>
      <div class="ac-detail">${esc(s.detail)}</div>
      <div class="ac-status">${s.status === "confirmed" ? "✓ CONFIRMED" : s.status === "suspected" ? "◐ SUSPECTED" : "? UNKNOWN"}</div>
      ${i < c.attackChain.length - 1 ? '<div class="ac-arrow">→</div>' : ""}
    </div>`;
  }).join("");
  return `<div class="ac-wrap">${cards}</div>`;
}

// ─── 3 · ENTITY GRAPH (force-free radial, edges from evidence co-occurrence) ──
export function renderEntityGraph(c) {
  // build adjacency from evidence iocs co-occurrence
  const adj = {};
  c.entities.forEach((e) => (adj[e.id] = new Set()));
  c.evidence.forEach((ev) => {
    const ids = ev.iocs || [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (adj[ids[i]] && adj[ids[j]]) { adj[ids[i]].add(ids[j]); adj[ids[j]].add(ids[i]); }
    }
  });
  const W = 760, H = 460, cx = W / 2, cy = H / 2;
  const ents = c.entities;
  const N = ents.length;
  const R = 168;
  const pos = {};
  ents.forEach((e, i) => {
    const a = (-90 + i * (360 / N)) * Math.PI / 180;
    pos[e.id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  });
  // edges
  const seen = new Set();
  let edges = "";
  ents.forEach((e) => {
    adj[e.id].forEach((to) => {
      const key = [e.id, to].sort().join("|");
      if (seen.has(key)) return; seen.add(key);
      const a = pos[e.id], b = pos[to];
      edges += `<line class="eg-edge" data-pair="${esc(e.id)} ${esc(to)}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
    });
  });
  let nodes = "";
  ents.forEach((e) => {
    const p = pos[e.id], col = RISK[e.risk] || "var(--t3)";
    nodes += `<g class="eg-node" data-ent="${esc(e.id)}" data-ents="${esc(e.id)}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
      <circle class="eg-halo" r="30" fill="${col}" opacity="0.10"/>
      <circle class="eg-core" r="20" fill="var(--bg-2)" stroke="${col}" stroke-width="2"/>
      <g transform="translate(-9,-9) scale(0.75)" stroke="${col}" stroke-width="2" fill="none"><svg width="24" height="24" viewBox="0 0 24 24">${ENTITY_ICON[e.type] || ""}</svg></g>
      <text class="eg-label" y="38" text-anchor="middle">${esc(e.label)}</text>
      <text class="eg-sub" y="50" text-anchor="middle">${esc(e.type.toUpperCase())}</text>
    </g>`;
  });
  return `<div class="eg-wrap"><svg viewBox="0 0 ${W} ${H}" class="eg-svg" preserveAspectRatio="xMidYMid meet">
    <g class="eg-edges">${edges}</g><g class="eg-nodes">${nodes}</g></svg>
    <div class="eg-hint">Click a node to pivot · edges = artifacts seen together in evidence</div></div>`;
}

// ─── 4 · PROCESS TREE ────────────────────────────────────────
export function renderProcessTree(c) {
  function node(n, depth) {
    const cls = n.bad ? "pt-bad" : "";
    const sig = n.signed === false ? '<span class="pt-tag pt-unsigned">UNSIGNED</span>' : "";
    const tech = n.technique ? `<span class="pt-tag pt-tech">${esc(n.technique)}</span>` : "";
    const kids = (n.children || []).map((k) => node(k, depth + 1)).join("");
    return `<div class="pt-node" style="--d:${depth}">
      <div class="pt-row ${cls}">
        <span class="pt-pid mono">${n.pid ? esc(n.pid) : "•"}</span>
        <span class="pt-name mono">${esc(n.name)}</span>
        ${n.args ? `<span class="pt-args mono">${esc(n.args)}</span>` : ""}
        ${sig}${tech}
      </div>
      ${kids ? `<div class="pt-children">${kids}</div>` : ""}
    </div>`;
  }
  return `<div class="pt-wrap">${node(c.processTree, 0)}</div>`;
}

// ─── 5 · NETWORK / LATERAL MAP ───────────────────────────────
export function renderNetwork(c) {
  const net = c.network;
  const W = 760, H = 360;
  const zoneW = 230;
  // zone bands
  let bands = net.zones.map((z) => `
    <div class="nm-zone" style="left:${z.x}px;--zc:${z.color}">
      <span class="nm-zone-label">${esc(z.label)}</span>
    </div>`).join("");
  // node lookup
  const nById = {}; net.nodes.forEach((n) => (nById[n.id] = n));
  const zById = {}; net.zones.forEach((z) => (zById[z.id] = z));
  const px = (n) => zById[n.zone].x + 64;
  const py = (n) => n.y;
  // edges (svg)
  let edges = net.edges.map((e) => {
    const a = nById[e.from], b = nById[e.to];
    if (!a || !b) return "";
    const x1 = px(a) + 60, y1 = py(a) + 22, x2 = px(b), y2 = py(b) + 22;
    const mx = (x1 + x2) / 2;
    return `<path class="nm-edge ${e.malicious ? "nm-mal" : ""}" d="M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" data-pair="${esc(a.entity)} ${esc(b.entity)}"/>
      <text class="nm-edge-label" x="${mx}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">${esc(e.label)}</text>`;
  }).join("");
  // nodes (html)
  let nodes = net.nodes.map((n) => {
    const col = n.compromised ? "var(--red)" : "var(--cyan)";
    return `<div class="nm-node ${n.compromised ? "nm-comp" : ""}" data-ent="${esc(n.entity)}" data-ents="${esc(n.entity)}" style="left:${px(n)}px;top:${py(n)}px;--nc:${col}">
      <span class="nm-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ENTITY_ICON[{ host: "host", ip: "ip", user: "user", file: "file" }[n.kind] || "host"]}</svg></span>
      <span class="nm-label">${esc(n.label)}</span>
      ${n.compromised ? '<span class="nm-flag">⚠</span>' : ""}
    </div>`;
  }).join("");
  return `<div class="nm-wrap" style="height:${H}px">
    <div class="nm-bands">${bands}</div>
    <svg class="nm-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${edges}</svg>
    <div class="nm-nodes">${nodes}</div>
  </div>`;
}

// ─── 6 · EVIDENCE LOG (filterable table) ─────────────────────
export function renderEvidence(c) {
  const rows = c.evidence.map((e) => {
    const ents = (e.iocs || []).join(" ");
    return `<tr class="ev-row" data-ev="${e.id}" data-ents="${esc(ents)}" data-src="${esc(e.source)}">
      <td class="ev-time mono">${esc(e.time)}</td>
      <td><span class="ev-src">${esc(e.source)}</span></td>
      <td class="ev-host mono">${esc(hostLabel(c, e.host))}</td>
      <td class="ev-eid mono"><span class="ev-sev" style="background:${sevColor[e.sev] || "var(--t3)"}"></span>${esc(e.event)}</td>
      <td class="ev-detail">${esc(e.detail)}</td>
      <td class="ev-act">${e.finding ? `<button class="ev-pin" data-finding="${esc(e.finding)}" title="Log as finding">◆ LOG</button>` : '<span class="ev-noise">noise</span>'}</td>
    </tr>`;
  }).join("");
  const sources = [...new Set(c.evidence.map((e) => e.source))];
  const filters = `<button class="ev-filter on" data-src="all">ALL</button>` + sources.map((s) => `<button class="ev-filter" data-src="${esc(s)}">${esc(s)}</button>`).join("");
  return `<div class="ev-wrap">
    <div class="ev-filters">${filters}</div>
    <table class="ev-table"><thead><tr><th>Time</th><th>Source</th><th>Host</th><th>Event</th><th>Detail</th><th>Finding</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function hostLabel(c, hid) {
  if (!hid || hid === "—") return "—";
  const e = entityById(c, hid);
  return e ? e.label : hid;
}

// small entity chip used in timeline
function entChip(c, id) {
  const e = entityById(c, id);
  if (!e) return "";
  const col = RISK[e.risk] || "var(--t3)";
  return `<span class="ent-chip" data-ent="${esc(id)}" data-ents="${esc(id)}" style="--ec:${col}">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${ENTITY_ICON[e.type] || ""}</svg>${esc(e.label)}</span>`;
}

export const DIAGRAMS = {
  timeline: { label: "Timeline", icon: '<line x1="12" y1="2" x2="12" y2="22"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="14" r="2"/>', render: renderTimeline },
  attack: { label: "Attack Chain", icon: '<path d="M4 12h6m4 0h6"/><circle cx="12" cy="12" r="3"/>', render: renderAttackChain },
  graph: { label: "Entity Graph", icon: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6.7 7.2l4 9M17.3 7.2l-4 9"/>', render: renderEntityGraph },
  process: { label: "Process Tree", icon: '<rect x="9" y="2" width="6" height="5"/><rect x="3" y="17" width="6" height="5"/><rect x="15" y="17" width="6" height="5"/><path d="M12 7v5M6 17v-2h12v2"/>', render: renderProcessTree },
  network: { label: "Network Map", icon: '<rect x="2" y="3" width="6" height="5"/><rect x="16" y="16" width="6" height="5"/><rect x="9" y="16" width="6" height="5"/><path d="M5 8v4h14v4M12 12v4"/>', render: renderNetwork },
  evidence: { label: "Evidence Log", icon: '<path d="M3 5h18M3 12h18M3 19h18"/>', render: renderEvidence },
};
