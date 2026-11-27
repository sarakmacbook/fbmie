import crypto from "node:crypto";
import { CHAIN_META, detectAddress, EVM_SCAN_CHAINS } from "./chains";
import { getIntelStats, lookupLocalIntel } from "./intel-index";
import { analyzeLaunderingPatterns } from "./laundering-analyzer";
import {
  checkGoPlusSecurity,
  checkLiveOfacGithub,
  checkOpenSanctionsLive,
  fetchEvmChainTelemetry,
  fetchSolanaTelemetry,
  fetchTronTelemetry,
  fetchUtxoTelemetry,
  fetchXrpTelemetry,
} from "./live-sources";
import { computeComplianceScore } from "./scoring";
import {
  ChainActivitySnapshot,
  ChainId,
  NormalizedTx,
  RiskSeverity,
  ScreeningFinding,
  ScreeningReport,
  SourceAuditEntry,
  ThreatCategory,
} from "./types";

const CATEGORY_WEIGHT: Record<ThreatCategory, number> = {
  ofac_sanctions: 98,
  eu_sanctions: 96,
  un_sanctions: 96,
  uk_sanctions: 94,
  nbctf_sanctions: 92,
  ransomware: 94,
  darknet: 90,
  exploit: 88,
  mixer: 84,
  laundering: 70,
  scam: 68,
  bridge: 0,
  exchange: 0,
  benign: 0,
};

function mapGoPlusFlag(flag: string): {
  category: ThreatCategory;
  severity: RiskSeverity;
  title: string;
  weight: number;
} {
  if (flag.startsWith("malicious_contracts_created:")) {
    const count = flag.split(":")[1];
    return {
      category: "scam",
      severity: "high",
      title: `GoPlus: Deployed ${count} Malicious Contract(s)`,
      weight: 72,
    };
  }
  switch (flag) {
    case "sanctioned":
      return {
        category: "ofac_sanctions",
        severity: "critical",
        title: "GoPlus Threat Intel: Sanctioned Address",
        weight: 96,
      };
    case "money_laundering":
      return {
        category: "laundering",
        severity: "critical",
        title: "GoPlus Threat Intel: Money Laundering Activity",
        weight: 84,
      };
    case "mixer":
      return {
        category: "mixer",
        severity: "high",
        title: "GoPlus Threat Intel: Coin Mixer / Tumbler Interaction",
        weight: 80,
      };
    case "darkweb_transactions":
      return {
        category: "darknet",
        severity: "critical",
        title: "GoPlus Threat Intel: Darkweb / Darknet Transactions",
        weight: 88,
      };
    case "blackmail_activities":
      return {
        category: "ransomware",
        severity: "critical",
        title: "GoPlus Threat Intel: Blackmail / Ransomware Extortion",
        weight: 90,
      };
    case "cybercrime":
      return {
        category: "exploit",
        severity: "critical",
        title: "GoPlus Threat Intel: Cybercrime Associated Address",
        weight: 85,
      };
    case "stealing_attack":
      return {
        category: "exploit",
        severity: "critical",
        title: "GoPlus Threat Intel: Theft / Stealing Attack Wallet",
        weight: 86,
      };
    case "financial_crime":
      return {
        category: "laundering",
        severity: "high",
        title: "GoPlus Threat Intel: Financial Crime Flagged",
        weight: 78,
      };
    case "phishing_activities":
      return {
        category: "scam",
        severity: "high",
        title: "GoPlus Threat Intel: Phishing Activities",
        weight: 70,
      };
    case "honeypot_related_address":
      return {
        category: "scam",
        severity: "high",
        title: "GoPlus Threat Intel: Honeypot Related Address",
        weight: 68,
      };
    case "blacklist_doubt":
      return {
        category: "scam",
        severity: "medium",
        title: "GoPlus Threat Intel: Suspected Malicious / Blacklisted",
        weight: 50,
      };
    default:
      return {
        category: "scam",
        severity: "medium",
        title: `GoPlus Threat Signal: ${flag.replace(/_/g, " ")}`,
        weight: 42,
      };
  }
}

export interface ScreenOptions {
  chain?: ChainId | "auto";
  deepScan?: boolean;
}

export async function screenWalletAddress(
  rawAddress: string,
  options: ScreenOptions = {}
): Promise<ScreeningReport> {
  const startedAt = Date.now();
  const deepScan = options.deepScan ?? true;
  const detection = detectAddress(rawAddress, options.chain ?? "auto");

  if (!detection.valid) {
    throw new Error(detection.error || "Invalid wallet address format");
  }

  const address = rawAddress.trim();
  const primaryChain = detection.primaryChain;
  const findings: ScreeningFinding[] = [];
  const sources: SourceAuditEntry[] = [];
  const chainSnapshots: ChainActivitySnapshot[] = [];
  let allTransactions: NormalizedTx[] = [];

  // -------------------------------------------------------------------------
  // 1. LOCAL VERIFIED INTELLIGENCE INDEX (O(1), 5,350+ REAL VERIFIED RECORDS)
  // -------------------------------------------------------------------------
  const localStart = Date.now();
  const localHits = lookupLocalIntel(address);
  const intelStats = getIntelStats();
  sources.push({
    id: "local_verified_index",
    name: "FBMIE Verified Local Intel Registry",
    category: "local_index",
    status: "live",
    latencyMs: Date.now() - localStart,
    matchesFound: localHits.length,
    detail: `Screened ${intelStats.totalRecords.toLocaleString()} records (OFAC 18 chains, EU FSF, UN/DPRK, UK FCDO, IL NBCTF, Conti/LockBit/WannaCry ransomware, mixers, darknet, MEW & ScamSniffer)`,
  });

  for (let i = 0; i < localHits.length; i++) {
    const rec = localHits[i];
    findings.push({
      id: `local_${i}_${rec.category}`,
      category: rec.category,
      severity: rec.severity,
      matchType: "direct",
      title: rec.label,
      detail:
        rec.description ||
        `Direct address match in ${rec.source}${rec.reference ? ` (Ref: ${rec.reference})` : ""}.`,
      jurisdiction: rec.jurisdiction,
      source: rec.source,
      reference: rec.reference,
      sourceUrl: rec.sourceUrl,
      chain: primaryChain,
      weight: CATEGORY_WEIGHT[rec.category] ?? 50,
    });
  }

  // -------------------------------------------------------------------------
  // 2. LIVE PARALLEL THREAT FEEDS + MULTI-CHAIN TELEMETRY
  // -------------------------------------------------------------------------
  const isEvm = CHAIN_META[primaryChain]?.family === "evm";

  const [liveOfacRes, openSanctionsRes, goPlusRes, telemetryResult] = await Promise.all([
    checkLiveOfacGithub(address, primaryChain),
    checkOpenSanctionsLive(address, primaryChain),
    checkGoPlusSecurity(address, primaryChain),
    (async () => {
      if (isEvm) {
        // Screen across major EVM chains in parallel; fetch full Blockscout tx history on primary + ethereum/base
        const chainsToProbe = EVM_SCAN_CHAINS;
        const evmResults = await Promise.all(
          chainsToProbe.map((c) =>
            fetchEvmChainTelemetry(
              address,
              c,
              deepScan && (c === primaryChain || c === "ethereum" || c === "base")
            )
          )
        );
        return { kind: "evm" as const, evmResults };
      }
      if (primaryChain === "bitcoin" || primaryChain === "litecoin") {
        const res = await fetchUtxoTelemetry(address, primaryChain, deepScan);
        return { kind: "single" as const, res };
      }
      if (primaryChain === "tron") {
        const res = await fetchTronTelemetry(address, deepScan);
        return { kind: "single" as const, res };
      }
      if (primaryChain === "solana") {
        const res = await fetchSolanaTelemetry(address, deepScan);
        return { kind: "single" as const, res };
      }
      if (primaryChain === "xrp") {
        const res = await fetchXrpTelemetry(address);
        return { kind: "single" as const, res };
      }
      return { kind: "none" as const };
    })(),
  ]);

  // Process Live OFAC GitHub result
  sources.push(liveOfacRes.audit);
  if (liveOfacRes.matched) {
    const alreadyHasOfac = findings.some((f) => f.category === "ofac_sanctions");
    if (!alreadyHasOfac) {
      findings.push({
        id: "live_ofac_github",
        category: "ofac_sanctions",
        severity: "critical",
        matchType: "direct",
        title: `US Treasury OFAC SDN Live Match (${liveOfacRes.ticker})`,
        detail: `Address is actively listed on the live daily US Treasury OFAC SDN digital currency extract (0xB10C lists branch).`,
        jurisdiction: "US",
        source: "US Treasury OFAC SDN Live Feed",
        reference: `OFAC-LIVE-${liveOfacRes.ticker}`,
        sourceUrl: liveOfacRes.audit.url,
        chain: primaryChain,
        weight: 98,
      });
    }
  }

  // Process Live OpenSanctions results (FBI Lazarus, NBCTF, Ransomwhere)
  for (const osItem of openSanctionsRes) {
    sources.push(osItem.audit);
    if (osItem.hit) {
      const ds = osItem.hit.dataset;
      const cat: ThreatCategory =
        ds === "ransomwhere"
          ? "ransomware"
          : ds === "il_mod_crypto"
            ? "nbctf_sanctions"
            : "un_sanctions";
      const dup = findings.some((f) => f.category === cat && f.matchType === "direct");
      if (!dup) {
        findings.push({
          id: `live_opensanctions_${ds}`,
          category: cat,
          severity: "critical",
          matchType: "direct",
          title: `OpenSanctions Live Hit: ${osItem.hit.label}`,
          detail: `Live match in OpenSanctions public dataset "${ds}" (${osItem.audit.name}).`,
          jurisdiction: ds === "il_mod_crypto" ? "IL" : ds === "us_fbi_lazarus_crypto" ? "US/UN" : "GLOBAL",
          source: osItem.audit.name,
          reference: `OPENSANCTIONS-${ds.toUpperCase()}`,
          sourceUrl: osItem.audit.url,
          chain: primaryChain,
          weight: CATEGORY_WEIGHT[cat],
        });
      }
    }
  }

  // Process GoPlus Security result
  if (CHAIN_META[primaryChain]?.goplusChainId) {
    sources.push({
      id: "goplus_security",
      name: `GoPlus Address Security API (${CHAIN_META[primaryChain].name})`,
      category: "threat_intel",
      status: goPlusRes.available ? "live" : "unavailable",
      latencyMs: goPlusRes.latencyMs,
      matchesFound: goPlusRes.activeFlags.length,
      detail: goPlusRes.available
        ? goPlusRes.activeFlags.length > 0
          ? `Flagged: ${goPlusRes.activeFlags.join(", ")} (Source: ${goPlusRes.dataSource})`
          : "All 16 GoPlus threat flags clear (sanctions, mixer, darkweb, blackmail, laundering, cybercrime, phishing)"
        : `GoPlus API unreachable (${goPlusRes.error || "network"})`,
      url: `https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${CHAIN_META[primaryChain].goplusChainId}`,
    });

    if (goPlusRes.available && goPlusRes.activeFlags.length > 0) {
      for (const flag of goPlusRes.activeFlags) {
        const mapped = mapGoPlusFlag(flag);
        findings.push({
          id: `goplus_${flag}`,
          category: mapped.category,
          severity: mapped.severity,
          matchType: "api_signal",
          title: mapped.title,
          detail: `Real-time flag "${flag}" reported by GoPlus Security threat intelligence${goPlusRes.dataSource ? ` (attributed via ${goPlusRes.dataSource})` : ""}.`,
          jurisdiction: mapped.category === "ofac_sanctions" ? "US/GLOBAL" : "GLOBAL",
          source: `GoPlus Security API${goPlusRes.dataSource ? ` · ${goPlusRes.dataSource}` : ""}`,
          reference: `GOPLUS-${flag.toUpperCase()}`,
          sourceUrl: "https://docs.gopluslabs.io/reference/addresscontractusingget_1",
          chain: primaryChain,
          weight: mapped.weight,
        });
      }
    }
  }

  // Process Telemetry & Chainalysis Oracle
  if (telemetryResult.kind === "evm") {
    let oracleHitCount = 0;
    let oracleLiveCount = 0;
    let oracleLatency = 0;
    const oracleHitChains: string[] = [];

    for (const item of telemetryResult.evmResults) {
      if (item.snapshot.chain === primaryChain && goPlusRes.available) {
        item.snapshot.goplusFlagged = goPlusRes.activeFlags.length > 0;
        item.snapshot.goplusFlags = goPlusRes.activeFlags;
      }
      chainSnapshots.push(item.snapshot);
      if (item.transactions.length > 0) {
        allTransactions.push(...item.transactions);
      }
      if (item.explorerAudit) {
        sources.push(item.explorerAudit);
      }
      if (item.oracleAudit) {
        oracleLatency = Math.max(oracleLatency, item.oracleAudit.latencyMs);
        if (item.oracleAudit.status === "live") oracleLiveCount++;
        if (item.snapshot.chainalysisOracleSanctioned === true) {
          oracleHitCount++;
          oracleHitChains.push(item.snapshot.chainName);
        }
      }
    }

    // Aggregate Chainalysis On-Chain Sanctions Oracle audit entry cleanly
    sources.push({
      id: "chainalysis_oracle_multichain",
      name: "Chainalysis On-Chain Sanctions Oracle (US / EU / UN)",
      category: "oracle",
      status: oracleLiveCount > 0 ? "live" : "unavailable",
      latencyMs: oracleLatency,
      matchesFound: oracleHitCount,
      detail:
        oracleHitCount > 0
          ? `SANCTIONED on ${oracleHitChains.join(", ")} via on-chain isSanctioned() oracle (US OFAC / EU / UN)`
          : oracleLiveCount > 0
            ? `Verified clear across ${oracleLiveCount} EVM chains via live isSanctioned() smart contract calls`
            : "Public EVM RPC endpoints unreachable in current environment",
      url: "https://etherscan.io/address/0x40C57923924B5c5c5455c48D93317139ADDaC8fb",
    });

    if (oracleHitCount > 0) {
      findings.push({
        id: "chainalysis_oracle_hit",
        category: "ofac_sanctions",
        severity: "critical",
        matchType: "oracle",
        title: "Chainalysis On-Chain Sanctions Oracle: SANCTIONED (US / EU / UN)",
        detail: `On-chain smart contract 0x40C57923924B5c5c5455c48D93317139ADDaC8fb returned isSanctioned(address) = true on ${oracleHitChains.join(", ")}. Oracle aggregates US OFAC, EU, and UN sanctions lists.`,
        jurisdiction: "US/EU/UN",
        source: "Chainalysis Sanctions Oracle (On-Chain RPC)",
        reference: "CHAINALYSIS-ORACLE-TRUE",
        sourceUrl: "https://etherscan.io/address/0x40C57923924B5c5c5455c48D93317139ADDaC8fb",
        chain: primaryChain,
        weight: 99,
      });
    }
  } else if (telemetryResult.kind === "single") {
    const snap = telemetryResult.res.snapshot;
    if (goPlusRes.available) {
      snap.goplusFlagged = goPlusRes.activeFlags.length > 0;
      snap.goplusFlags = goPlusRes.activeFlags;
    }
    chainSnapshots.push(snap);
    allTransactions = telemetryResult.res.transactions;
    sources.push(telemetryResult.res.audit);
  } else {
    // Privacy / non-indexed chain (e.g. Monero, Zcash, Dash, BCH, TON) — direct sanctions & watchlist screening still completed!
    const meta = CHAIN_META[primaryChain];
    chainSnapshots.push({
      chain: primaryChain,
      chainName: meta.name,
      symbol: meta.symbol,
      active: false,
      balanceNative: null,
      totalReceivedNative: null,
      totalSentNative: null,
      txCount: null,
      explorerUrl: meta.explorerAddressUrl(address),
      telemetryStatus: "unavailable",
    });
    if (meta.family === "privacy") {
      findings.push({
        id: `privacy_chain_${primaryChain}`,
        category: "mixer",
        severity: "medium",
        matchType: "heuristic",
        title: `Enhanced Anonymity / Privacy Asset (${meta.name})`,
        detail: `${meta.name} uses cryptographic obfuscation (ring signatures / shielded pools) preventing transparent transaction graph tracing. Requires enhanced source-of-funds due diligence.`,
        jurisdiction: "GLOBAL",
        source: "FBMIE Asset Risk Policy",
        reference: `PRIVACY-COIN-${meta.symbol}`,
        chain: primaryChain,
        weight: 38,
      });
    }
  }

  // Sort transactions newest first
  allTransactions.sort((a, b) => b.timestamp - a.timestamp);
  allTransactions = allTransactions.slice(0, 35);

  // -------------------------------------------------------------------------
  // 3. LAUNDERING PATTERN & 1-HOP COUNTERPARTY TAINT ANALYSIS
  // -------------------------------------------------------------------------
  const laundering = analyzeLaunderingPatterns(address, allTransactions, chainSnapshots);
  findings.push(...laundering.counterpartyFindings, ...laundering.heuristicFindings);

  // Sort findings by weight desc
  findings.sort((a, b) => b.weight - a.weight);

  const isBenignOnly =
    localHits.length > 0 &&
    localHits.every((h) => h.category === "benign" || h.category === "exchange" || h.category === "bridge");

  const scoring = computeComplianceScore(findings, laundering.heuristics, isBenignOnly);

  const reportId = `FBMIE-${crypto
    .createHash("sha256")
    .update(`${detection.normalized}-${startedAt}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase()}`;

  return {
    reportId,
    screenedAt: new Date().toISOString(),
    address,
    normalizedAddress: detection.normalized,
    detectedChains: detection.detectedChains,
    primaryChain,
    addressFormat: detection.format,
    riskScore: scoring.riskScore,
    riskTier: scoring.riskTier,
    recommendation: scoring.recommendation,
    executiveSummary: scoring.executiveSummary,
    pillars: scoring.pillars,
    findings,
    chainSnapshots,
    heuristics: laundering.heuristics,
    recentTransactions: laundering.annotatedTransactions,
    counterparties: laundering.counterparties,
    sources,
    deepScanEnabled: deepScan,
    durationMs: Date.now() - startedAt,
  };
}
