import {
  CompliancePillarStatus,
  LaunderingHeuristicResult,
  RiskTier,
  ScreeningFinding,
} from "./types";

export interface ScoringResult {
  riskScore: number;
  riskTier: RiskTier;
  recommendation: string;
  executiveSummary: string;
  pillars: CompliancePillarStatus[];
}

export function computeComplianceScore(
  findings: ScreeningFinding[],
  heuristics: LaunderingHeuristicResult[],
  isBenignOnly: boolean
): ScoringResult {
  const activeRiskFindings = findings.filter(
    (f) => f.category !== "benign" && f.category !== "exchange" && f.category !== "bridge"
  );

  // Deduplicate weight contribution by category so multiple mirrors of the same list don't artificially inflate minor risks,
  // while severe multi-category hits cleanly hit 95-100.
  let rawScore = 0;
  const categoryMax = new Map<string, number>();

  for (const f of activeRiskFindings) {
    const prev = categoryMax.get(f.category) ?? 0;
    if (f.weight > prev) {
      rawScore += f.weight - prev;
      categoryMax.set(f.category, f.weight);
    } else {
      // Secondary corroboration adds small incremental confidence weight
      rawScore += Math.round(f.weight * 0.12);
    }
  }

  // Enforce hard floor for direct statutory sanctions / ransomware / critical darknet / critical mixer
  const hasDirectSanction = activeRiskFindings.some(
    (f) =>
      (f.matchType === "direct" || f.matchType === "oracle" || f.matchType === "api_signal") &&
      ["ofac_sanctions", "eu_sanctions", "un_sanctions", "uk_sanctions", "nbctf_sanctions"].includes(
        f.category
      )
  );
  const hasDirectRansomware = activeRiskFindings.some(
    (f) => f.matchType !== "counterparty_1hop" && f.category === "ransomware"
  );
  const hasDirectDarknet = activeRiskFindings.some(
    (f) => f.matchType !== "counterparty_1hop" && f.category === "darknet" && f.severity === "critical"
  );
  const hasDirectMixer = activeRiskFindings.some(
    (f) => f.matchType !== "counterparty_1hop" && f.category === "mixer"
  );
  const hasDirectExploit = activeRiskFindings.some(
    (f) => f.matchType !== "counterparty_1hop" && f.category === "exploit"
  );

  if (hasDirectSanction) rawScore = Math.max(rawScore, 96);
  else if (hasDirectRansomware || hasDirectDarknet) rawScore = Math.max(rawScore, 92);
  else if (hasDirectExploit) rawScore = Math.max(rawScore, 88);
  else if (hasDirectMixer) rawScore = Math.max(rawScore, 82);

  const riskScore = isBenignOnly && activeRiskFindings.length === 0 ? 0 : Math.min(100, Math.max(0, Math.round(rawScore)));

  let riskTier: RiskTier = "LOW";
  let recommendation =
    "No direct sanctions, ransomware, mixer, darknet, or severe laundering flags detected. Standard transaction monitoring applies.";

  if (riskScore >= 85) {
    riskTier = "SEVERE";
    recommendation =
      "BLOCK / FREEZE IMMEDIATELY. Direct hit on sanctions, ransomware, darknet, major exploit, or high-risk mixer infrastructure. Escalate to MLRO / SAR filing workflow.";
  } else if (riskScore >= 65) {
    riskTier = "HIGH";
    recommendation =
      "HOLD & ESCALATE FOR ENHANCED DUE DILIGENCE (EDD). Significant illicit, mixer, drainer, or sanctioned 1-hop exposure identified.";
  } else if (riskScore >= 40) {
    riskTier = "ELEVATED";
    recommendation =
      "MANUAL COMPLIANCE REVIEW REQUIRED. Indirect counterparty exposure or suspicious on-chain layering signals detected.";
  } else if (riskScore >= 20) {
    riskTier = "MODERATE";
    recommendation =
      "PROCEED WITH CAUTION & CONTINUOUS MONITORING. Minor behavioral anomalies or low-confidence heuristics flagged.";
  }

  // Build the 6 compliance pillar statuses
  const buildPillar = (
    id: CompliancePillarStatus["id"],
    label: string,
    categories: string[],
    includeHeuristics = false
  ): CompliancePillarStatus => {
    const directHits = activeRiskFindings.filter(
      (f) => f.matchType !== "counterparty_1hop" && categories.includes(f.category)
    );
    const indirectHits = activeRiskFindings.filter(
      (f) => f.matchType === "counterparty_1hop" && categories.includes(f.category)
    );
    const triggeredHeuristics = includeHeuristics
      ? heuristics.filter((h) => h.triggered)
      : [];

    const totalHits = directHits.length + indirectHits.length + triggeredHeuristics.length;

    if (directHits.length > 0 || (includeHeuristics && triggeredHeuristics.some((h) => h.severity === "high"))) {
      return {
        id,
        label,
        status: "HIT",
        hitCount: totalHits,
        summary:
          directHits[0]?.title ||
          triggeredHeuristics[0]?.name ||
          `${totalHits} match${totalHits > 1 ? "es" : ""} detected`,
      };
    }
    if (indirectHits.length > 0 || (includeHeuristics && triggeredHeuristics.length > 0)) {
      return {
        id,
        label,
        status: "EXPOSURE",
        hitCount: totalHits,
        summary:
          indirectHits[0]?.title ||
          `${triggeredHeuristics.length} behavioral pattern${triggeredHeuristics.length > 1 ? "s" : ""} flagged`,
      };
    }
    return {
      id,
      label,
      status: "CLEAR",
      hitCount: 0,
      summary: "No matches detected",
    };
  };

  const pillars: CompliancePillarStatus[] = [
    buildPillar("ofac", "OFAC SDN", ["ofac_sanctions"]),
    buildPillar("un_eu", "UN / EU / UK Sanctions", [
      "un_sanctions",
      "eu_sanctions",
      "uk_sanctions",
      "nbctf_sanctions",
    ]),
    buildPillar("ransomware", "Ransomware Lists", ["ransomware"]),
    buildPillar("mixers", "Mixers & Privacy", ["mixer"]),
    buildPillar("darknet", "Darknet Services", ["darknet"]),
    buildPillar("laundering", "Laundering Patterns", ["laundering", "exploit", "scam"], true),
  ];

  // Executive summary
  let executiveSummary: string;
  if (activeRiskFindings.length === 0) {
    const benignMatch = findings.find((f) => f.category === "benign" || f.category === "exchange");
    executiveSummary = benignMatch
      ? `Address identified as ${benignMatch.title}. Zero sanctions, ransomware, mixer, darknet, or laundering risks detected across screened feeds.`
      : "No direct matches across OFAC, UN, EU, UK, NBCTF sanctions, ransomware lists, mixers, darknet services, or automated laundering heuristics.";
  } else {
    const hitPillars = pillars.filter((p) => p.status !== "CLEAR").map((p) => `${p.label} (${p.status})`);
    const topFinding = [...activeRiskFindings].sort((a, b) => b.weight - a.weight)[0];
    executiveSummary = `${riskTier} risk (${riskScore}/100): ${topFinding.title}. Flagged pillars: ${hitPillars.join(", ")}.`;
  }

  return {
    riskScore,
    riskTier,
    recommendation,
    executiveSummary,
    pillars,
  };
}
