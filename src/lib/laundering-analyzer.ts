import { normalizeForLookup } from "./chains";
import { getHighestRiskHit, isKnownBenignOrExchange, isKnownBridge } from "./intel-index";
import {
  ChainActivitySnapshot,
  CounterpartyNode,
  LaunderingHeuristicResult,
  NormalizedTx,
  RiskSeverity,
  ScreeningFinding,
} from "./types";

const FIXED_MIXER_DENOMINATIONS = [0.1, 1, 10, 100, 1000];

function isNearFixedDenom(val: number): boolean {
  if (val <= 0) return false;
  return FIXED_MIXER_DENOMINATIONS.some((d) => Math.abs(val - d) / d < 0.002);
}

export interface LaunderingAnalysisOutput {
  heuristics: LaunderingHeuristicResult[];
  counterparties: CounterpartyNode[];
  annotatedTransactions: NormalizedTx[];
  counterpartyFindings: ScreeningFinding[];
  heuristicFindings: ScreeningFinding[];
}

export function analyzeLaunderingPatterns(
  targetAddress: string,
  transactions: NormalizedTx[],
  snapshots: ChainActivitySnapshot[]
): LaunderingAnalysisOutput {
  const targetNorm = normalizeForLookup(targetAddress);
  const targetIsBenign = Boolean(isKnownBenignOrExchange(targetAddress));

  // 1. Annotate transactions & aggregate counterparties
  const cpMap = new Map<string, CounterpartyNode>();
  const taintedCounterparties = new Map<
    string,
    { address: string; label: string; category: string; severity: RiskSeverity; source: string; txCount: number; direction: string }
  >();
  const bridgeHits = new Set<string>();

  const annotatedTransactions: NormalizedTx[] = transactions.map((tx) => {
    const cp = tx.counterparty;
    const cpNorm = normalizeForLookup(cp);
    const validAddr = cp && cpNorm !== targetNorm && !cp.includes(" ");

    let riskHit = validAddr ? getHighestRiskHit(cp) : null;
    const bridgeHit = validAddr ? isKnownBridge(cp) : null;
    const benignHit = validAddr ? isKnownBenignOrExchange(cp) : null;

    if (bridgeHit) {
      bridgeHits.add(`${bridgeHit.label} (${cp.slice(0, 10)}…)`);
    }

    // Track 1-hop illicit exposure (for known public figures like Vitalik, ignore unsolicited inbound dust < 0.001)
    if (riskHit && !(targetIsBenign && tx.direction === "in" && tx.valueNative < 0.01)) {
      const existing = taintedCounterparties.get(cpNorm);
      if (existing) {
        existing.txCount += 1;
      } else {
        taintedCounterparties.set(cpNorm, {
          address: cp,
          label: riskHit.label,
          category: riskHit.category,
          severity: riskHit.severity,
          source: riskHit.source,
          txCount: 1,
          direction: tx.direction,
        });
      }
    }

    const label = riskHit?.label || bridgeHit?.label || benignHit?.label || tx.counterpartyLabel;
    const risk: RiskSeverity | "clean" = riskHit ? riskHit.severity : "clean";
    const category = riskHit?.category || bridgeHit?.category || benignHit?.category;

    if (validAddr) {
      const prev = cpMap.get(cpNorm);
      const dir = tx.direction === "in" ? "inbound" : "outbound";
      if (prev) {
        prev.txCount += 1;
        prev.totalValueNative = Number((prev.totalValueNative + tx.valueNative).toFixed(6));
        if (prev.direction !== dir) prev.direction = "both";
      } else {
        cpMap.set(cpNorm, {
          address: cp,
          chain: tx.chain,
          label,
          category,
          risk,
          direction: dir,
          txCount: 1,
          totalValueNative: Number(tx.valueNative.toFixed(6)),
          symbol: tx.symbol,
        });
      }
    }

    return {
      ...tx,
      counterpartyLabel: label,
      counterpartyRisk: risk,
      counterpartyCategory: category,
    };
  });

  const counterparties = Array.from(cpMap.values())
    .sort((a, b) => {
      const riskOrder: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1, clean: 0 };
      const diff = (riskOrder[b.risk] || 0) - (riskOrder[a.risk] || 0);
      if (diff !== 0) return diff;
      return b.txCount - a.txCount;
    })
    .slice(0, 18);

  const counterpartyFindings: ScreeningFinding[] = [];
  for (const [, taint] of taintedCounterparties) {
    const isSanctionOrMixer = [
      "ofac_sanctions",
      "eu_sanctions",
      "un_sanctions",
      "uk_sanctions",
      "nbctf_sanctions",
      "mixer",
      "ransomware",
      "darknet",
    ].includes(taint.category);
    counterpartyFindings.push({
      id: `cp_1hop_${taint.address.slice(0, 10)}`,
      category: taint.category as ScreeningFinding["category"],
      severity: isSanctionOrMixer ? "high" : "medium",
      matchType: "counterparty_1hop",
      title: `1-Hop Exposure: ${taint.label}`,
      detail: `Direct ${taint.direction === "out" ? "outbound" : "inbound"} transaction (${taint.txCount} tx${taint.txCount > 1 ? "s" : ""}) with flagged counterparty ${taint.address}.`,
      jurisdiction: "GLOBAL",
      source: `On-Chain 1-Hop Graph · ${taint.source}`,
      relatedAddress: taint.address,
      weight: isSanctionOrMixer ? 32 : 18,
    });
  }

  const hasTxSample = annotatedTransactions.length >= 2;
  const inbound = annotatedTransactions.filter((t) => t.direction === "in" && t.valueNative > 0);
  const outbound = annotatedTransactions.filter((t) => t.direction === "out" && t.valueNative > 0);
  const totalIn = inbound.reduce((s, t) => s + t.valueNative, 0);
  const totalOut = outbound.reduce((s, t) => s + t.valueNative, 0);

  // Heuristic 1: 1-Hop Illicit Counterparty Taint
  const hCounterpartyTaint: LaunderingHeuristicResult = {
    id: "counterparty_taint",
    name: "1-Hop Sanctioned / Mixer / Darknet Exposure",
    triggered: taintedCounterparties.size > 0,
    severity: taintedCounterparties.size > 0 ? "high" : "info",
    confidence: taintedCounterparties.size > 0 ? 94 : 0,
    evidence:
      taintedCounterparties.size > 0
        ? `Interacted directly with ${taintedCounterparties.size} flagged illicit/sanctioned/mixer counterpart${taintedCounterparties.size > 1 ? "ies" : "y"} within the analyzed transaction window.`
        : annotatedTransactions.length > 0
          ? `Screened ${cpMap.size} unique 1-hop counterparties across ${annotatedTransactions.length} recent transactions — no direct watchlist hits.`
          : "No live transaction history available to evaluate 1-hop counterparties.",
    metric: `${taintedCounterparties.size} flagged / ${cpMap.size} counterparties`,
  };

  // Heuristic 2: Rapid Pass-Through / Layering Velocity
  let rapidPairs = 0;
  const sortedAsc = [...annotatedTransactions].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < sortedAsc.length - 1; i++) {
    if (sortedAsc[i].direction === "in" && sortedAsc[i].valueNative > 0) {
      for (let j = i + 1; j < sortedAsc.length; j++) {
        const dt = sortedAsc[j].timestamp - sortedAsc[i].timestamp;
        if (dt > 2700) break; // 45 minutes
        if (sortedAsc[j].direction === "out" && sortedAsc[j].valueNative >= sortedAsc[i].valueNative * 0.75) {
          rapidPairs++;
          break;
        }
      }
    }
  }
  const passThroughRatio = totalIn > 0 ? totalOut / totalIn : 0;
  const rapidTriggered =
    !targetIsBenign && hasTxSample && rapidPairs >= 2 && passThroughRatio >= 0.85 && passThroughRatio <= 1.2;
  const hRapidPassthrough: LaunderingHeuristicResult = {
    id: "rapid_passthrough",
    name: "Rapid Pass-Through / Layering Mule",
    triggered: rapidTriggered,
    severity: rapidTriggered ? "high" : "info",
    confidence: rapidTriggered ? Math.min(92, 65 + rapidPairs * 8) : 0,
    evidence: rapidTriggered
      ? `Detected ${rapidPairs} rapid inbound→outbound sweep cycles (<45 min dwell) with ${(passThroughRatio * 100).toFixed(0)}% pass-through ratio — hallmark of layering/mule relays.`
      : hasTxSample
        ? `Observed ${rapidPairs} sub-45m pass-through pair(s); outflow/inflow ratio ${(passThroughRatio * 100).toFixed(0)}% within normal bounds.`
        : "Insufficient live transaction sample for dwell-time velocity analysis.",
    metric: hasTxSample ? `${rapidPairs} rapid sweeps · ${(passThroughRatio * 100).toFixed(0)}% ratio` : "N/A",
  };

  // Heuristic 3: Peel Chain Pattern (BTC/UTXO 2-output hops or sequential outbound splitting)
  const peelTxs = annotatedTransactions.filter(
    (t) => t.direction === "out" && t.outputCount === 2 && (t.inputCount ?? 1) <= 2
  );
  const peelRatio = outbound.length > 0 ? peelTxs.length / outbound.length : 0;
  const peelTriggered = !targetIsBenign && peelTxs.length >= 4 && peelRatio >= 0.65;
  const hPeelChain: LaunderingHeuristicResult = {
    id: "peel_chain",
    name: "Peel Chain Obfuscation Sequence",
    triggered: peelTriggered,
    severity: peelTriggered ? "medium" : "info",
    confidence: peelTriggered ? 78 : 0,
    evidence: peelTriggered
      ? `${peelTxs.length} of ${outbound.length} outbound transactions match a 2-output UTXO peel-chain signature (${(peelRatio * 100).toFixed(0)}%), commonly used to bleed illicit funds incrementally.`
      : hasTxSample
        ? `No sustained sequential peel-chain signature identified in analyzed transfers.`
        : "Requires UTXO or multi-hop transfer history.",
    metric: `${peelTxs.length} peel-like txs`,
  };

  // Heuristic 4: Structuring / Smurfing & High Fan-Out Distribution
  const uniqueOutRecipients = new Set(outbound.map((t) => normalizeForLookup(t.counterparty))).size;
  const outValues = outbound.map((t) => Number(t.valueNative.toFixed(4)));
  const freqMap = new Map<number, number>();
  for (const v of outValues) freqMap.set(v, (freqMap.get(v) || 0) + 1);
  const maxSameAmount = Math.max(0, ...Array.from(freqMap.values()));
  const structuringTriggered =
    !targetIsBenign && ((outbound.length >= 8 && maxSameAmount >= 4) || (outbound.length >= 12 && uniqueOutRecipients >= 10));
  const hStructuring: LaunderingHeuristicResult = {
    id: "structuring_fanout",
    name: "Structuring / Smurfing & Fan-Out Splitting",
    triggered: structuringTriggered,
    severity: structuringTriggered ? "medium" : "info",
    confidence: structuringTriggered ? 76 : 0,
    evidence: structuringTriggered
      ? `High fan-out / uniform split pattern: ${outbound.length} outbound transfers across ${uniqueOutRecipients} distinct recipients (up to ${maxSameAmount} identical-value tranches).`
      : hasTxSample
        ? `${outbound.length} outbound transfers to ${uniqueOutRecipients} distinct recipients; no uniform structuring cluster detected.`
        : "Insufficient outbound transfer data.",
    metric: `${uniqueOutRecipients} recipients · ${maxSameAmount} repeated value`,
  };

  // Heuristic 5: Fixed-Denomination / CoinJoin Mixer Fingerprint
  const fixedDenomTxs = annotatedTransactions.filter((t) => isNearFixedDenom(t.valueNative));
  const coinJoinTxs = annotatedTransactions.filter((t) => t.equalOutputs);
  const mixerFpTriggered = !targetIsBenign && (coinJoinTxs.length >= 1 || fixedDenomTxs.length >= 3);
  const hMixerFp: LaunderingHeuristicResult = {
    id: "mixer_denomination",
    name: "Mixer Fixed-Denomination / CoinJoin Signature",
    triggered: mixerFpTriggered,
    severity: mixerFpTriggered ? "high" : "info",
    confidence: mixerFpTriggered ? (coinJoinTxs.length > 0 ? 88 : 74) : 0,
    evidence: mixerFpTriggered
      ? coinJoinTxs.length > 0
        ? `Detected ${coinJoinTxs.length} equal-output CoinJoin-style UTXO mixing transaction(s) and ${fixedDenomTxs.length} exact power-of-10 denomination transfer(s).`
        : `Detected ${fixedDenomTxs.length} exact power-of-10 transfers (0.1/1/10/100 units), matching fixed-pool mixer deposit/withdrawal behavior.`
      : hasTxSample
        ? "No CoinJoin equal-output structures or repeated fixed-pool mixer denominations observed."
        : "No transaction values available.",
    metric: `${coinJoinTxs.length} CoinJoin · ${fixedDenomTxs.length} fixed-denom`,
  };

  // Heuristic 6: High-Velocity Fresh / Burner Staging Wallet
  const primarySnap = snapshots.find((s) => s.active) || snapshots[0];
  const nowSec = Math.floor(Date.now() / 1000);
  const ageDays = primarySnap?.firstSeen ? (nowSec - primarySnap.firstSeen) / 86400 : null;
  const totalTx = primarySnap?.txCount ?? annotatedTransactions.length;
  const residualBal = primarySnap?.balanceNative ?? null;
  const burnerTriggered =
    !targetIsBenign &&
    ageDays !== null &&
    ageDays <= 14 &&
    totalTx >= 15 &&
    residualBal !== null &&
    residualBal < 0.005 &&
    totalIn > 0.5;
  const hBurner: LaunderingHeuristicResult = {
    id: "burner_velocity",
    name: "Fresh Burner / Staging Wallet Velocity",
    triggered: burnerTriggered,
    severity: burnerTriggered ? "medium" : "info",
    confidence: burnerTriggered ? 72 : 0,
    evidence: burnerTriggered
      ? `Account observed for only ${ageDays?.toFixed(1)} days with ${totalTx} transactions and drained residual balance (${residualBal?.toFixed(5)} ${primarySnap?.symbol || ""}).`
      : ageDays !== null
        ? `Observed age ~${ageDays.toFixed(0)} days across ${totalTx} transaction(s) — not consistent with a disposable burner wallet.`
        : "Account creation timestamp not available from public telemetry.",
    metric: ageDays !== null ? `${ageDays.toFixed(0)}d age · ${totalTx} txs` : "N/A",
  };

  // Heuristic 7: Cross-Chain Bridge Hopping
  const bridgeTriggered = !targetIsBenign && bridgeHits.size > 0 && (taintedCounterparties.size > 0 || rapidPairs > 0 || bridgeHits.size >= 2);
  const hBridge: LaunderingHeuristicResult = {
    id: "bridge_hopping",
    name: "Cross-Chain Bridge Hopping",
    triggered: bridgeTriggered,
    severity: bridgeTriggered ? (taintedCounterparties.size > 0 ? "high" : "medium") : "info",
    confidence: bridgeTriggered ? 82 : 0,
    evidence:
      bridgeHits.size > 0
        ? bridgeTriggered
          ? `Interacted with ${bridgeHits.size} cross-chain bridge(s) (${Array.from(bridgeHits).slice(0, 3).join(", ")}) alongside elevated layering/taint signals.`
          : `Normal single cross-chain bridge interaction noted (${Array.from(bridgeHits)[0]}) with no concurrent taint.`
        : "No interactions with tracked cross-chain bridge routers detected in recent transfers.",
    metric: `${bridgeHits.size} bridge router(s)`,
  };

  // Heuristic 8: Dusting / Address Poisoning Anomaly
  const dustTxs = annotatedTransactions.filter((t) => t.valueNative > 0 && t.valueNative <= 0.00005);
  const dustRatio = annotatedTransactions.length > 0 ? dustTxs.length / annotatedTransactions.length : 0;
  const dustTriggered = dustTxs.length >= 4 && dustRatio >= 0.3;
  const hDust: LaunderingHeuristicResult = {
    id: "dust_poisoning",
    name: "Dusting / Address Poisoning Activity",
    triggered: dustTriggered,
    severity: dustTriggered ? "low" : "info",
    confidence: dustTriggered ? 70 : 0,
    evidence: dustTriggered
      ? `${dustTxs.length} of ${annotatedTransactions.length} recent transfers (${(dustRatio * 100).toFixed(0)}%) are micro-value dust transfers — indicator of address poisoning or wallet surveillance.`
      : hasTxSample
        ? `Only ${dustTxs.length} micro-value transfer(s) in recent window.`
        : "No transfer sample available.",
    metric: `${dustTxs.length} dust txs`,
  };

  const heuristics: LaunderingHeuristicResult[] = [
    hCounterpartyTaint,
    hRapidPassthrough,
    hPeelChain,
    hStructuring,
    hMixerFp,
    hBurner,
    hBridge,
    hDust,
  ];

  const heuristicFindings: ScreeningFinding[] = heuristics
    .filter((h) => h.triggered && h.id !== "counterparty_taint")
    .map((h) => ({
      id: `heuristic_${h.id}`,
      category: "laundering",
      severity: h.severity,
      matchType: "heuristic",
      title: `Laundering Pattern: ${h.name}`,
      detail: h.evidence,
      jurisdiction: "GLOBAL",
      source: "FBMIE On-Chain Behavioral Engine",
      reference: `HEURISTIC-${h.id.toUpperCase()}`,
      weight: h.severity === "high" ? 26 : h.severity === "medium" ? 16 : 8,
    }));

  return {
    heuristics,
    counterparties,
    annotatedTransactions,
    counterpartyFindings,
    heuristicFindings,
  };
}
