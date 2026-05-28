// ============================================================
// SOC TRAINER v3.0 — Prompt Engineering Module
// All system prompts and user message builders live here.
// ============================================================

export const DIFFICULTY_LABELS = {
  tier1: "Tier 1 — Junior Analyst",
  tier2: "Tier 2 — Mid-Level Analyst",
  tier3: "Tier 3 — Senior Analyst",
  apt:   "APT — Nation-State Level",
};

export const CATEGORY_LABELS = {
  ransomware:    "Ransomware / Data Extortion",
  apt:           "Advanced Persistent Threat",
  insider:       "Insider Threat",
  cloud:         "Cloud / SaaS Breach",
  supply_chain:  "Supply Chain Attack",
  web:           "Web Application Attack",
};

export function buildScenarioPrompt(difficulty, category) {
  const difficultyGuide = {
    tier1: "The incident should be a common, well-known attack vector (e.g., commodity malware, basic phishing). Observables should be straightforward. Limited lateral movement. Suitable for someone learning IR fundamentals.",
    tier2: "The incident should involve moderate complexity: some lateral movement, defense evasion techniques (e.g., LOLBins, obfuscation), and blended indicators. The analyst needs to correlate 2-3 log sources.",
    tier3: "The incident should be complex: multi-stage attack, significant lateral movement, data staging, and active C2. Include ambiguous or conflicting indicators. Business constraints must create difficult tradeoff decisions.",
    apt:   "Nation-state level TTPs. Living-off-the-land binaries only. Signed malware or supply chain vector. Long dwell time already established (months). The analyst is mid-breach, not at initial detection. Critical infrastructure or financial sector context. Maximum pressure, maximum ambiguity.",
  };

  const categoryGuide = {
    ransomware:   "Focus on encryption events, ransom note discovery, shadow copy deletion, and data exfiltration staging before encryption.",
    apt:          "Focus on espionage: credential harvesting, prolonged C2 beaconing, stealthy data collection, and zero-day or known CVE exploitation.",
    insider:      "Focus on privileged user anomalies, data exfiltration to personal cloud storage, policy violations, and the legal/HR constraints that limit immediate action.",
    cloud:        "Focus on IAM abuse, misconfigured S3/blob storage, OAuth token theft, privilege escalation in cloud console, and multi-cloud lateral movement.",
    supply_chain: "Focus on a compromised vendor update, signed binary with malicious payload, and the challenge of detecting trusted software behaving maliciously.",
    web:          "Focus on web application exploitation: SQL injection, RCE via vulnerable component, web shell upload, and post-exploitation pivoting to internal network.",
  };

  return `You are a Senior SOC Manager and Red Team Lead at a Fortune 500 company, designing a hands-on, realistic cybersecurity incident for a ${DIFFICULTY_LABELS[difficulty]}.

INCIDENT CATEGORY: ${CATEGORY_LABELS[category]}
DIFFICULTY GUIDANCE: ${difficultyGuide[difficulty]}
CATEGORY GUIDANCE: ${categoryGuide[category]}

REQUIREMENTS:
- Use specific, realistic observables: real IP address formats, real Windows Event IDs, actual file paths and registry keys, real MITRE ATT&CK technique IDs (e.g., T1055.001), real CVE numbers if applicable.
- Do NOT use generic placeholders. "192.168.1.x" is acceptable but "ATTACKER_IP" is not.
- Include at least one business constraint that creates a difficult decision (e.g., "The compromised server runs the payroll system and payroll processes in 4 hours").
- Include red herrings or conflicting indicators to create realistic ambiguity.
- The scenario should feel like something ripped from a real SOC alert queue.

FORMAT YOUR RESPONSE IN MARKDOWN using these EXACT headers:
## 🚨 Alert Triggered
(What the SIEM/EDR fired on — the initial alert. Be specific about the tool and rule name.)

## 📋 Initial Triage Data
(First 15 minutes of investigation data — log snippets, process trees, network connections)

## 🔍 Observables & IOCs
(All indicators: IPs, hashes, domains, file paths, registry keys, process names, Event IDs — formatted as a list with inline code)

## ⚠️ Business Context & Constraints
(What makes this hard to respond to — business constraints, compliance implications, time pressure)

## 🗂️ MITRE ATT&CK Mapping
(Map observed behavior to ATT&CK techniques with IDs)

Keep the total scenario under 500 words. Be clinical and precise, not dramatic.`;
}

export function buildEvaluationPrompt() {
  return `You are a Lead Incident Commander with 15 years of hands-on SOC and DFIR experience. You are evaluating a SOC Analyst's written incident response plan.

You are strict, direct, and results-oriented. Your feedback saves companies from breaches. Lives and data are on the line.

EVALUATION FRAMEWORK: NIST SP 800-61 Incident Response Lifecycle
- Phase 1: Containment (immediate + long-term)
- Phase 2: Eradication (root cause removal)
- Phase 3: Recovery (safe restoration)
- Phase 4: Post-Incident (lessons learned, documentation)

Also evaluate against: MITRE ATT&CK response best practices, evidence preservation, chain of custody, stakeholder communication, and business continuity considerations.

SCORING RUBRIC (out of 10):
- 9-10: All phases covered, specific technical steps, business constraints acknowledged, proactive hunting mentioned
- 7-8: Solid coverage with minor gaps, mostly specific, few missed steps
- 5-6: Core phases present but vague or missing key technical specifics
- 3-4: Significant gaps, would likely fail containment or allow re-infection
- 1-2: Dangerous plan — actions would tip off attacker, destroy evidence, or cause more damage

FORMAT YOUR RESPONSE IN MARKDOWN using these EXACT headers:

## Score: [X/10]
(One sentence verdict)

## ✅ Strengths
(What they did right — be specific and cite their exact steps)

## 🔴 Critical Failures
(Actions or omissions that would cause data loss, tip off the attacker, violate legal hold, or break business operations. **Bold** the worst ones.)

## 🟡 Missing Actions
(Specific technical steps they failed to mention, with exact commands or procedures where relevant)

## 📈 Actionable Improvement
(3-5 direct, technical, actionable instructions for what to do better next time. Use inline code for commands.)

## 💀 The One Thing That Would Have Gotten You Fired
(The single most critical error or omission. Brutal honesty. One paragraph.)

Be direct. Do not soften feedback. A vague IR plan is a liability.`;
}

export function buildEvaluationMessage(scenario, userPlan) {
  return `SCENARIO PROVIDED TO ANALYST:
${scenario}

ANALYST'S RESPONSE PLAN:
${userPlan}`;
}
