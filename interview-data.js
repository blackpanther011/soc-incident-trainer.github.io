// ============================================================
// SOC TRAINER v4 — Interview Room question bank
// Real scenario-based SOC/IR interview questions with model
// answers, talking points, and follow-ups. Self-rate or
// (with a key) get AI feedback on your answer.
// ============================================================

export const INTERVIEW_CATEGORIES = {
  triage: "Triage & Detection",
  ir: "Incident Response",
  forensics: "Forensics & DFIR",
  threat: "Threat Hunting",
  network: "Network & Logs",
  scenario: "Scenario / Behavioral",
};

export const INTERVIEW_QUESTIONS = [
  {
    id: "q1", cat: "triage", level: "Entry",
    q: "You get an alert: 'Multiple failed logins followed by a success for one user.' Walk me through your first five minutes.",
    points: [
      "Confirm it's real, not a tuning/false-positive (was the success from a normal location/device?).",
      "Pull context: source IP(s), geo, time, the account's role and privilege.",
      "Decide brute-force vs password-spray vs credential-stuffing by the pattern (one account vs many).",
      "Check what the successful session did next — any privilege use, new tokens, lateral auth.",
      "Contain proportionally: force re-auth / disable session if suspicious; don't nuke a VIP account on a hunch.",
    ],
    answer: "I'd treat it as possible account compromise but verify before acting. First I confirm the success is anomalous — comparing source IP, geo, device and time against the user's baseline. I look at the failed-login pattern: many failures on one account suggests brute force, while the same password across many accounts is spraying. Then I pivot to what the successful session actually did — any MFA prompt, new OAuth grant, mailbox rule, or lateral authentication. If it looks malicious I revoke the session and force re-auth rather than immediately disabling, to avoid tipping off and to keep the user working if it's benign. Throughout, I document timestamps and IOCs for the case.",
    followups: ["What distinguishes spraying from brute force in the logs?", "The account is a domain admin — what changes?"],
  },
  {
    id: "q2", cat: "ir", level: "Mid",
    q: "Ransomware is encrypting files on a server right now. The business says it runs live payroll and you can't lose evidence. What do you do, in what order?",
    points: [
      "Containment first, but isolate — don't power off: network-isolate (switchport/EDR) to stop spread while preserving RAM.",
      "Preserve volatile evidence: memory image, running processes, network connections — chain of custody.",
      "Identify scope: which hosts, which account is the pivot, is data exfil happening too (double extortion).",
      "Kill persistence and the C2 channel; block IOCs at the perimeter.",
      "Only then plan recovery from known-good backups; define 'clean' before reconnecting; comms to stakeholders.",
    ],
    answer: "I separate containment from destruction. I network-isolate the host at the switch or via EDR so encryption can't spread to other shares, but I deliberately don't power it off — that would destroy RAM I need for the legal hold and to understand the malware. Next I preserve volatile evidence: a memory image and process/network capture with a documented chain of custody. In parallel I scope it — which accounts and hosts are involved, and critically whether data was exfiltrated before encryption, because that's a reportable breach, not just downtime. I kill persistence and block the C2 IOCs. Recovery comes last and only from validated backups, with a clear definition of 'clean' before anything reconnects. And because it's payroll, I'm briefing leadership on impact and the payday deadline throughout.",
    followups: ["How do you tell if data was exfiltrated before encryption?", "Backups are also encrypted — now what?"],
  },
  {
    id: "q3", cat: "forensics", level: "Mid",
    q: "Explain the order of volatility and why it matters when you collect evidence.",
    points: [
      "Collect most-volatile first: CPU registers/cache → RAM → network state/ARP → running processes → disk → logs/archival.",
      "Volatile data vanishes on power loss or reboot, so sequencing preserves the most perishable artifacts.",
      "Memory holds injected code, decrypted payloads, keys, and connections you'll never see on disk.",
      "Maintain chain of custody and hashing at every step so it's defensible.",
    ],
    answer: "Order of volatility means collecting evidence from the most perishable source to the least. Registers and cache go first, then RAM, then network state like active connections and ARP tables, then running processes, then disk, and finally archival logs and backups. It matters because volatile data disappears the moment the machine loses power or reboots — and memory is often where the real story lives: injected code, decrypted ransomware payloads, encryption keys, and live C2 connections that never touch disk. If I image the disk first and then pull the plug, I've lost all of that. At each stage I hash the evidence and document who collected what and when, so it holds up to scrutiny.",
    followups: ["What tools would you use to capture memory on Windows?", "How do you image a disk without altering it?"],
  },
  {
    id: "q4", cat: "threat", level: "Senior",
    q: "Walk me through building a threat hunt for living-off-the-land activity. You suspect an APT but have no specific IOC.",
    points: [
      "Start hypothesis-driven, not IOC-driven: e.g. 'an adversary is using PowerShell/WMI for persistence and DNS for C2.'",
      "Map to ATT&CK and pick data sources: process creation (4688/Sysmon 1), PowerShell 4104, WMI subscriptions, DNS logs.",
      "Baseline normal, then hunt anomalies: encoded commands, parent-child anomalies (Office spawning shells), periodic beacons.",
      "Pivot on hits; widen scope across hosts; confirm with corroborating evidence before calling it.",
      "Turn confirmed TTPs into detections so the hunt becomes a rule.",
    ],
    answer: "With no IOC I hunt by hypothesis. I'd start from a concrete behavior — say, 'an adversary is persisting via WMI event subscriptions and beaconing over DNS.' I map that to ATT&CK techniques and choose data sources that would reveal them: Sysmon process creation and command lines, PowerShell script-block logging, WMI subscription events, and DNS query logs. Then I baseline what's normal so anomalies stand out — hidden encoded PowerShell, suspicious parent-child chains like Office spawning a shell, or near-perfectly periodic DNS lookups that scream automated beacon. When I get a hit I pivot on the host and account, widen across the fleet, and corroborate before declaring an incident. Finally I operationalize: anything confirmed becomes a detection rule so the next instance alerts automatically.",
    followups: ["How would you spot DNS tunneling specifically?", "What makes WMI persistence hard to find?"],
  },
  {
    id: "q5", cat: "network", level: "Entry",
    q: "What's the difference between IDS and IPS, and where would you place each?",
    points: [
      "IDS detects and alerts (passive, out-of-band, often on a SPAN/TAP); IPS detects and blocks inline.",
      "IPS sits in the traffic path so it can drop malicious packets; IDS observes a copy so it can't.",
      "Tradeoff: IPS can break legitimate traffic on false positives; IDS is safer but only alerts.",
      "Often deployed together: IPS at the perimeter, IDS for internal visibility.",
    ],
    answer: "An IDS is a detection system — it watches traffic, usually out-of-band on a SPAN port or TAP, and raises alerts on suspicious activity, but it doesn't stop anything. An IPS is inline in the traffic path, so it can actively drop or block malicious packets in real time. The key tradeoff is risk: because an IPS sits in the flow, a false positive can break legitimate traffic, so it needs careful tuning, whereas an IDS is safe but reactive. In practice you often run both — an IPS at the perimeter to block known-bad inline, and IDS sensors internally for east-west visibility you can investigate.",
    followups: ["Signature-based vs anomaly-based detection — pros and cons?", "Where does a WAF fit in this picture?"],
  },
  {
    id: "q6", cat: "scenario", level: "Mid",
    q: "You believe a colleague misconfigured a firewall rule, which caused an exposure. How do you handle it?",
    points: [
      "Lead with the incident, not the person — contain the exposure first.",
      "Stay factual and blameless: focus on what happened and remediation, not fault.",
      "Raise it through the right channel privately; preserve evidence/logs of the change.",
      "Drive a post-incident review and a guardrail (change control, peer review) so it can't recur.",
    ],
    answer: "My first priority is the exposure, not the colleague — I'd contain the misconfiguration immediately and verify nothing was exploited through it. When it comes to the human side, I keep it blameless and factual: I'd raise it privately and frame it around what happened and how we fix it, not who's at fault, because a blame culture makes people hide mistakes. I'd preserve the change logs as evidence and then push for a post-incident review focused on the systemic gap — for example, adding change control or peer review on firewall rules so a single misconfiguration can't reach production again. The goal is a stronger process, not a scapegoat.",
    followups: ["What if it was a senior person who won't admit it?", "How do you balance speed of disclosure with getting facts right?"],
  },
  {
    id: "q7", cat: "triage", level: "Mid",
    q: "An endpoint alerts on a 'suspicious PowerShell' execution. How do you determine if it's malicious?",
    points: [
      "Look at the full command line — encoded (-enc), hidden window, download cradles (IEX, Net.WebClient, Invoke-Expression).",
      "Check the parent process — Office apps or wscript spawning PowerShell is a red flag.",
      "Examine what it did: network connections, files dropped, registry/persistence, child processes.",
      "Decode the base64 and read it; correlate with threat intel and PowerShell 4104 script-block logs.",
      "Decide and act: isolate if malicious, document IOCs, hunt for the same pattern elsewhere.",
    ],
    answer: "I start with the command line itself, because that's where intent shows. Encoded commands, a hidden window, or download cradles like IEX with Net.WebClient are strong malicious signals. Then I look at lineage — what spawned it? PowerShell launched by Word or wscript is very suspicious, versus a known admin script. I check behavior: did it open network connections, drop files, write a Run key, or spawn children? I'll decode the base64 to read the actual script and pull script-block logging from event 4104 for the full picture, correlating any domains or hashes against threat intel. If it's malicious I isolate the host, record the IOCs, and hunt for the same command pattern across the fleet in case it's wider.",
    followups: ["How does AMSI help here?", "Attackers obfuscate — how do you handle that?"],
  },
  {
    id: "q8", cat: "ir", level: "Senior",
    q: "How do you decide whether an incident needs to be escalated and disclosed (e.g. to regulators or customers)?",
    points: [
      "Determine if regulated/personal data was accessed or exfiltrated — that triggers legal obligations (GDPR 72h, HIPAA, etc.).",
      "Assess scope, sensitivity, and whether confidentiality was actually breached vs merely at risk.",
      "Engage Legal, Privacy, and Comms early — disclosure is a legal decision, not just technical.",
      "Document the basis for the decision and timeline; err toward over-communicating internally.",
    ],
    answer: "Disclosure is ultimately a legal and risk decision, so my job is to give them an accurate technical picture fast. The pivotal question is whether regulated or personal data was actually accessed or exfiltrated, not just exposed — that's what triggers obligations like GDPR's 72-hour clock or HIPAA. I assess scope and data sensitivity and try to establish, with evidence, whether confidentiality was truly breached. Then I bring in Legal, Privacy, and Communications early rather than deciding unilaterally, because the thresholds are jurisdiction-specific. I document the evidence and reasoning behind the decision and the timeline of what we knew when, and internally I lean toward over-communicating so leadership is never surprised.",
    followups: ["Access vs exfiltration — how do you prove which happened?", "The 72-hour clock — when does it start?"],
  },
  {
    id: "q9", cat: "forensics", level: "Senior",
    q: "A host is compromised but you need it to stay online for business. How do you investigate a live system safely?",
    points: [
      "Live response: collect volatile data with trusted, statically-linked tools from external media.",
      "Minimize footprint and document every command (you're altering state — note it).",
      "Capture memory, network connections, processes, autoruns, and recent artifacts before disk.",
      "Use EDR for visibility/containment without full isolation; watch for tripwires the attacker set.",
      "Balance evidence integrity vs business need; get sign-off on the tradeoff.",
    ],
    answer: "This is live response, where I accept that I'm touching the system and document accordingly. I use trusted, statically-linked tools run from external media so I'm not relying on potentially-tampered binaries on the host, and I record every command and timestamp because I'm altering state. I prioritize volatile data — memory, active network connections, process list, autoruns and recently-created artifacts — before anything on disk. EDR is invaluable here: it gives me telemetry and the option to contain at the process or network level without fully isolating a system the business needs online. I also stay alert for attacker tripwires or anti-forensics. Throughout it's a documented tradeoff between evidence integrity and availability, and I get explicit sign-off on that balance.",
    followups: ["What anti-forensic techniques would you watch for?", "How do you avoid alerting the attacker while you collect?"],
  },
  {
    id: "q10", cat: "network", level: "Mid",
    q: "Walk me through what happens, step by step, when you type a URL and press Enter — from a security lens.",
    points: [
      "DNS resolution (cache → resolver) — risk: DNS hijack/poisoning, tunneling.",
      "TCP handshake + TLS negotiation — cert validation, downgrade/MITM risks.",
      "HTTP request/response — headers, cookies, redirects; injection and session risks.",
      "Browser renders — JS execution, XSS, supply-chain of third-party scripts.",
      "Security controls along the path: proxy, WAF, CASB, DNS filtering.",
    ],
    answer: "From a security lens, first the name resolves through DNS — local cache then a resolver — and that step is a target for hijacking, cache poisoning, or being used as a covert tunnel. Then a TCP handshake and TLS negotiation establish the channel, where I care about certificate validation and protocol downgrade or man-in-the-middle risks. The browser sends an HTTP request with headers and cookies and follows redirects, which is where session hijacking and injection come into play. The response is rendered, executing JavaScript — that's the XSS and third-party supply-chain surface. Along the whole path there are controls I'd expect: a forward proxy or DNS filtering to block known-bad destinations, and a WAF protecting the server side. Framing the question this way shows I understand both how the web works and where it breaks.",
    followups: ["How does HSTS reduce risk here?", "Where would DNS-over-HTTPS help or hurt defenders?"],
  },
  {
    id: "q11", cat: "scenario", level: "Entry",
    q: "Why do you want to work in a SOC, and how do you stay current with threats?",
    points: [
      "Show genuine motivation: love of investigation, defending, continuous learning.",
      "Name concrete sources: vendor blogs, ATT&CK updates, CISA advisories, CTFs, labs.",
      "Demonstrate hands-on habits: home lab, capture-the-flag, detection engineering practice.",
      "Connect it to the role: curiosity + persistence under pressure.",
    ],
    answer: "I'm drawn to the SOC because it's investigative work with real stakes — you're piecing together what happened from fragments and defending people who'll never know you did. To stay current I follow a mix of sources: vendor threat-research blogs, MITRE ATT&CK updates, and CISA advisories for what's actively exploited, and I read incident write-ups to learn how real intrusions unfold. I keep it hands-on too — a home lab where I generate and detect attacks, CTFs for the puzzle-solving muscle, and practicing detection engineering so I understand both offense and defense. The thread through all of it is curiosity and persistence, which is exactly what triage under pressure demands.",
    followups: ["Tell me about a recent threat or breach that interested you and why.", "What's in your home lab?"],
  },
  {
    id: "q12", cat: "threat", level: "Mid",
    q: "What is the MITRE ATT&CK framework and how do you actually use it day to day?",
    points: [
      "A knowledge base of adversary tactics (the 'why'), techniques (the 'how'), and procedures.",
      "Use it to map detections and find coverage gaps (e.g. via ATT&CK Navigator).",
      "Common language for describing incidents and threat actors across teams.",
      "Drives hunts, red/blue exercises, and prioritization by technique prevalence.",
    ],
    answer: "ATT&CK is a structured knowledge base of real-world adversary behavior, organized into tactics — the attacker's goal at each stage, like persistence or exfiltration — and the techniques and procedures they use to achieve them. Day to day I use it three ways. First, as a coverage map: I plot our detections against the matrix, usually in ATT&CK Navigator, to see where we're blind. Second, as a shared language — when I describe an incident as 'T1566 into T1059 into T1490,' everyone instantly understands the chain. Third, it drives proactive work: I pick high-prevalence techniques for that threat landscape and build hunts or purple-team tests around them. It turns abstract 'are we secure' into specific, prioritized gaps.",
    followups: ["What's the difference between a tactic and a technique?", "How would you prioritize which techniques to cover first?"],
  },
];
