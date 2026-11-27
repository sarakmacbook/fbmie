"use client";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  GitBranch,
  Printer,
  Radio,
  Share2,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from "lucide-react";
import { shortenAddress } from "@/lib/chains";
import { RiskSeverity, RiskTier, ScreeningReport } from "@/lib/types";
import { FlowGraph } from "./FlowGraph";

interface ScreeningReportViewProps {
  report: ScreeningReport;
  onPivotAddress: (address: string) => void;
}

function tierVisuals(tier: RiskTier) {
  switch (tier) {
    case "SEVERE":
      return {
        stroke: "#f43f5e",
        text: "text-rose-400",
        badge: "border-rose-500/40 bg-rose-500/15 text-rose-300",
        banner: "border-rose-500/35 bg-[#1B1016]",
      };
    case "HIGH":
      return {
        stroke: "#f97316",
        text: "text-orange-400",
        badge: "border-orange-500/40 bg-orange-500/15 text-orange-300",
        banner: "border-orange-500/35 bg-[#1C1410]",
      };
    case "ELEVATED":
      return {
        stroke: "#eab308",
        text: "text-amber-400",
        badge: "border-amber-500/40 bg-amber-500/15 text-amber-300",
        banner: "border-amber-500/35 bg-[#1A170E]",
      };
    case "MODERATE":
      return {
        stroke: "#38bdf8",
        text: "text-sky-400",
        badge: "border-sky-500/40 bg-sky-500/15 text-sky-300",
        banner: "border-sky-500/30 bg-[#0E1822]",
      };
    default:
      return {
        stroke: "#10b981",
        text: "text-emerald-400",
        badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
        banner: "border-emerald-500/30 bg-[#0C1915]",
      };
  }
}

function severityPill(sev: RiskSeverity) {
  switch (sev) {
    case "critical":
      return "border-rose-500/40 bg-rose-500/15 text-rose-300";
    case "high":
      return "border-orange-500/40 bg-orange-500/15 text-orange-300";
    case "medium":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300";
    case "low":
      return "border-sky-500/40 bg-sky-500/15 text-sky-300";
    default:
      return "border-slate-600/50 bg-slate-700/20 text-slate-300";
  }
}

function matchTypeLabel(mt: string) {
  switch (mt) {
    case "direct":
      return "Direct Watchlist Hit";
    case "oracle":
      return "On-Chain Oracle";
    case "api_signal":
      return "Live Threat API";
    case "counterparty_1hop":
      return "1-Hop Exposure";
    case "heuristic":
      return "Laundering Heuristic";
    default:
      return mt;
  }
}

export function ScreeningReportView({ report, onPivotAddress }: ScreeningReportViewProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [txFilter, setTxFilter] = useState<"all" | "flagged" | "in" | "out">("all");
  const visuals = tierVisuals(report.riskTier);

  // SVG gauge geometry
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (report.riskScore / 100) * circumference;

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.reportId}-${report.address.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const headers = [
      "report_id",
      "screened_at",
      "address",
      "primary_chain",
      "risk_score",
      "risk_tier",
      "finding_category",
      "severity",
      "match_type",
      "title",
      "jurisdiction",
      "source",
      "reference",
    ];
    const rows =
      report.findings.length > 0
        ? report.findings.map((f) =>
            [
              report.reportId,
              report.screenedAt,
              report.address,
              report.primaryChain,
              report.riskScore,
              report.riskTier,
              f.category,
              f.severity,
              f.matchType,
              f.title,
              f.jurisdiction,
              f.source,
              f.reference || "",
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(",")
          )
        : [
            [
              report.reportId,
              report.screenedAt,
              report.address,
              report.primaryChain,
              report.riskScore,
              report.riskTier,
              "clear",
              "info",
              "none",
              "No watchlist or compliance hits detected",
              "GLOBAL",
              "FBMIE",
              "",
            ]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(","),
          ];

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.reportId}-${report.address.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?address=${encodeURIComponent(report.address)}`
      : `?address=${encodeURIComponent(report.address)}`;

  const filteredTxs = report.recentTransactions.filter((tx) => {
    if (txFilter === "flagged") return tx.counterpartyRisk && tx.counterpartyRisk !== "clean" && tx.counterpartyRisk !== "info";
    if (txFilter === "in") return tx.direction === "in";
    if (txFilter === "out") return tx.direction === "out";
    return true;
  });

  const liveSourceCount = report.sources.filter((s) => s.status === "live" || s.status === "cached").length;

  return (
    <div className="space-y-5">
      {/* ===================================================================== */}
      {/* 1. EXECUTIVE VERDICT & RISK SCORE BANNER                              */}
      {/* ===================================================================== */}
      <section className={`print-card rounded-2xl border p-5 sm:p-6 ${visuals.banner}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Gauge + Verdict Details */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Precision Radial Gauge */}
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
              <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="#1E2736"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={visuals.stroke}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`font-mono text-2xl font-bold tabular-nums ${visuals.text}`}>
                  {report.riskScore}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  / 100
                </span>
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider ${visuals.badge}`}
                >
                  {report.riskTier === "LOW" ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <AlertOctagon className="h-3.5 w-3.5" />
                  )}
                  {report.riskTier} RISK
                </span>
                <span className="rounded-md border border-[#253145] bg-[#0B0F16] px-2 py-0.5 font-mono text-[11px] text-slate-300">
                  {report.addressFormat}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  ID: {report.reportId}
                </span>
              </div>

              {/* Address line */}
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-sm font-medium text-slate-100 sm:text-base">
                  {report.address}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(report.address, "addr")}
                  className="no-print inline-flex items-center gap-1 rounded border border-[#253145] bg-[#0B0F16] px-2 py-0.5 text-[11px] text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
                >
                  {copiedKey === "addr" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey === "addr" ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
                {report.executiveSummary}
              </p>

              <div className="rounded-lg border border-[#253145] bg-[#090C11]/70 px-3 py-2 text-xs text-slate-200">
                <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Compliance Action:
                </span>
                {report.recommendation}
              </div>
            </div>
          </div>

          {/* Export / Share Action Rail */}
          <div className="no-print flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
            <button
              type="button"
              onClick={() => copyText(shareUrl, "share")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#263247] bg-[#0F141D] px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500/40 hover:text-sky-300"
            >
              {copiedKey === "share" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
              <span>{copiedKey === "share" ? "Permalink Copied" : "Share Permalink"}</span>
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#263247] bg-[#0F141D] px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500/40 hover:text-sky-300"
            >
              <FileJson className="h-3.5 w-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#263247] bg-[#0F141D] px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500/40 hover:text-sky-300"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#263247] bg-[#0F141D] px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-500/40 hover:text-sky-300"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / PDF Dossier</span>
            </button>
          </div>
        </div>

        {/* Metadata Strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 pt-3 font-mono text-[11px] text-slate-400">
          <span>Screened: {new Date(report.screenedAt).toUTCString()}</span>
          <span>Latency: {report.durationMs}ms</span>
          <span>
            Sources: {liveSourceCount}/{report.sources.length} active
          </span>
          <span>Chains Scanned: {report.detectedChains.length}</span>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. SIX CORE COMPLIANCE PILLARS                                        */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {report.pillars.map((pillar) => {
          const isHit = pillar.status === "HIT";
          const isExposure = pillar.status === "EXPOSURE";
          return (
            <div
              key={pillar.id}
              className={`print-card rounded-xl border p-3.5 ${
                isHit
                  ? "border-rose-500/40 bg-[#1B1016]"
                  : isExposure
                    ? "border-amber-500/40 bg-[#1B170D]"
                    : "border-[#1E2736] bg-[#0F141D]"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-slate-200">
                  {pillar.label}
                </span>
                {isHit ? (
                  <ShieldOff className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                ) : isExposure ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span
                  className={`font-mono text-xs font-bold ${
                    isHit ? "text-rose-400" : isExposure ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {pillar.status}
                </span>
                {pillar.hitCount > 0 && (
                  <span className="font-mono text-[10px] text-slate-400">
                    {pillar.hitCount} signal{pillar.hitCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-400">
                {pillar.summary}
              </p>
            </div>
          );
        })}
      </section>

      {/* ===================================================================== */}
      {/* 3. MATCHED FINDINGS & COMPLIANCE EVIDENCE                             */}
      {/* ===================================================================== */}
      <section className="print-card rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Compliance Findings &amp; Attribution Evidence ({report.findings.length})
            </h2>
            <p className="text-xs text-slate-400">
              Direct sanctions designations, ransomware tracking, mixer registries, darknet hits, live API signals &amp; behavioral matches.
            </p>
          </div>
        </div>

        {report.findings.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-emerald-300">
                All Sanctions, Ransomware, Mixer &amp; Darknet Checks Clear
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Zero adverse records matched across OFAC SDN, UN, EU FSF, UK FCDO, NBCTF, Ransomwhere/Conti/LockBit, Tornado/Railgun/Sinbad mixers, darknet markets, ScamSniffer, MEW darklist, or GoPlus signals.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {report.findings.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-[#1E2736] bg-[#131924] p-4 transition-colors hover:border-[#2C3A50]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${severityPill(
                          f.severity
                        )}`}
                      >
                        {f.severity}
                      </span>
                      <span className="rounded border border-[#253145] bg-[#0B0F16] px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                        {matchTypeLabel(f.matchType)}
                      </span>
                      <span className="rounded border border-[#253145] bg-[#0B0F16] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                        {f.jurisdiction}
                      </span>
                      {f.reference && (
                        <span className="font-mono text-[10px] text-slate-400">
                          Ref: {f.reference}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-100">{f.title}</h3>
                    <p className="text-xs leading-relaxed text-slate-300">{f.detail}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {f.relatedAddress && (
                      <button
                        type="button"
                        onClick={() => onPivotAddress(f.relatedAddress!)}
                        className="no-print inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 font-mono text-[11px] text-sky-300 hover:bg-sky-500/20"
                      >
                        <span>Pivot Screen</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                    {f.sourceUrl && (
                      <a
                        href={f.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-print inline-flex items-center gap-1 rounded-md border border-[#253145] bg-[#0B0F16] px-2.5 py-1 text-[11px] text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
                      >
                        <span>Source</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2 font-mono text-[10px] text-slate-400">
                  <span>Source: {f.source}</span>
                  <span>Risk Weight: +{f.weight}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* 4. MULTI-CHAIN TELEMETRY & ON-CHAIN ORACLE MATRIX                     */}
      {/* ===================================================================== */}
      <section className="print-card rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Cross-Chain On-Chain Telemetry &amp; Sanctions Oracle Status
            </h2>
            <p className="text-xs text-slate-400">
              Live balances, activity counts, smart-contract detection &amp; Chainalysis US/EU/UN on-chain oracle calls across detected networks.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1E2736] font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <th className="py-2.5 pr-4">Network</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5 pr-4">Balance</th>
                <th className="py-2.5 pr-4">Tx Count</th>
                <th className="py-2.5 pr-4">Chainalysis Oracle</th>
                <th className="py-2.5 pr-4">GoPlus Live</th>
                <th className="py-2.5 text-right">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172030]">
              {report.chainSnapshots.map((snap) => (
                <tr key={snap.chain} className="hover:bg-[#131924]">
                  <td className="py-2.5 pr-4 font-medium text-slate-100">
                    <div className="flex items-center gap-2">
                      <span>{snap.chainName}</span>
                      {snap.isContract && (
                        <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] text-sky-300">
                          CONTRACT
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    {snap.telemetryStatus === "live" ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                          snap.active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-slate-700/30 text-slate-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            snap.active ? "bg-emerald-400" : "bg-slate-500"
                          }`}
                        />
                        {snap.active ? "Active" : "Idle"}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-slate-500">
                        Telemetry N/A
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-200">
                    {snap.balanceNative !== null
                      ? `${snap.balanceNative.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${snap.symbol}`
                      : "—"}
                  </td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-300">
                    {snap.txCount !== null ? snap.txCount.toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px]">
                    {snap.chainalysisOracleSanctioned === true ? (
                      <span className="font-bold text-rose-400">SANCTIONED</span>
                    ) : snap.chainalysisOracleSanctioned === false ? (
                      <span className="text-emerald-400">CLEAR</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px]">
                    {snap.goplusFlagged === true ? (
                      <span className="text-rose-400">
                        FLAGGED ({snap.goplusFlags?.length || 1})
                      </span>
                    ) : snap.goplusFlagged === false ? (
                      <span className="text-emerald-400">CLEAR</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <a
                      href={snap.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 5. LAUNDERING PATTERN HEURISTICS (8 FORENSIC DETECTORS)               */}
      {/* ===================================================================== */}
      <section className="print-card rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5">
        <div className="mb-3.5 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Automated Laundering Pattern &amp; Behavioral Heuristics
            </h2>
            <p className="text-xs text-slate-400">
              Real-time algorithmic evaluation of 1-hop counterparty taint, layering velocity, peel chains, structuring, CoinJoin/mixer fingerprints &amp; bridge hopping.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {report.heuristics.map((h) => (
            <div
              key={h.id}
              className={`rounded-xl border p-3.5 ${
                h.triggered
                  ? "border-amber-500/40 bg-[#1B160D]"
                  : "border-[#1E2736] bg-[#131924]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      h.triggered
                        ? h.severity === "high" || h.severity === "critical"
                          ? "bg-rose-500"
                          : "bg-amber-400"
                        : "bg-emerald-500/70"
                    }`}
                  />
                  <h3 className="text-xs font-semibold text-slate-100">{h.name}</h3>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    h.triggered
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-emerald-500/10 text-emerald-400"
                  }`}
                >
                  {h.triggered ? `TRIGGERED (${h.confidence}%)` : "PASS"}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                {h.evidence}
              </p>
              {h.metric && (
                <div className="mt-2 font-mono text-[10px] text-slate-500">
                  Metric: <span className="text-slate-300">{h.metric}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 6. 1-HOP COUNTERPARTY FLOW GRAPH & RECENT TRANSACTIONS                */}
      {/* ===================================================================== */}
      <section className="print-card rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 space-y-5">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              1-Hop Counterparty Flow Graph &amp; Recent Transfers
            </h2>
            <p className="text-xs text-slate-400">
              Visualizes inbound funding sources and outbound recipients cross-checked against all sanctions, mixer, ransomware &amp; darknet lists.
            </p>
          </div>
        </div>

        <FlowGraph
          targetAddress={report.address}
          targetRiskTier={report.riskTier}
          counterparties={report.counterparties}
          onPivotAddress={onPivotAddress}
        />

        {report.recentTransactions.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
                Sampled Transaction Ledger ({filteredTxs.length})
              </h3>
              <div className="no-print flex items-center gap-1 rounded-lg border border-[#1E2736] bg-[#090C11] p-0.5 text-[11px]">
                {(["all", "flagged", "in", "out"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTxFilter(f)}
                    className={`rounded px-2.5 py-1 font-medium capitalize ${
                      txFilter === f
                        ? "bg-[#1A2434] text-sky-300"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#1E2736]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#131924] font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Dir</th>
                    <th className="px-3 py-2.5">Timestamp (UTC)</th>
                    <th className="px-3 py-2.5">Counterparty</th>
                    <th className="px-3 py-2.5">Value</th>
                    <th className="px-3 py-2.5">Risk Tag</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172030]">
                  {filteredTxs.slice(0, 20).map((tx) => {
                    const isFlagged =
                      tx.counterpartyRisk &&
                      tx.counterpartyRisk !== "clean" &&
                      tx.counterpartyRisk !== "info";
                    return (
                      <tr key={`${tx.hash}-${tx.counterparty}`} className="hover:bg-[#131924]">
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              tx.direction === "in"
                                ? "bg-emerald-500/10 text-emerald-300"
                                : tx.direction === "out"
                                  ? "bg-sky-500/10 text-sky-300"
                                  : "bg-slate-700/40 text-slate-400"
                            }`}
                          >
                            {tx.direction === "in" ? (
                              <ArrowDownLeft className="h-3 w-3" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {tx.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-400">
                          {new Date(tx.timestamp * 1000).toISOString().replace("T", " ").slice(0, 16)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-[11px] text-slate-200">
                            {shortenAddress(tx.counterparty, 9, 6)}
                          </div>
                          {tx.counterpartyLabel && (
                            <div className="text-[10px] text-slate-400">
                              {tx.counterpartyLabel}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-slate-200">
                          {tx.valueNative} {tx.symbol}
                        </td>
                        <td className="px-3 py-2">
                          {isFlagged ? (
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${severityPill(
                                tx.counterpartyRisk as RiskSeverity
                              )}`}
                            >
                              {tx.counterpartyCategory || tx.counterpartyRisk}
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-slate-500">Clean</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            {!tx.counterparty.includes(" ") && (
                              <button
                                type="button"
                                onClick={() => onPivotAddress(tx.counterparty)}
                                className="no-print font-mono text-[10px] text-sky-400 hover:underline"
                              >
                                Pivot →
                              </button>
                            )}
                            <a
                              href={tx.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[10px] text-slate-400 hover:text-slate-200"
                            >
                              Tx ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* 7. SOURCE PROVENANCE & LIVE API AUDIT TRAIL                           */}
      {/* ===================================================================== */}
      <section className="print-card rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5">
        <div className="mb-3.5 flex items-center gap-2">
          <Radio className="h-4 w-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Intelligence Source Provenance &amp; Audit Trail
            </h2>
            <p className="text-xs text-slate-400">
              Full transparency into every free public API, on-chain oracle, and verified dataset queried for this report.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {report.sources.map((src) => (
            <div
              key={src.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-[#1E2736] bg-[#131924] p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-100">{src.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                      src.status === "live"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : src.status === "cached"
                          ? "bg-sky-500/15 text-sky-300"
                          : "bg-slate-700/40 text-slate-400"
                    }`}
                  >
                    {src.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{src.detail}</p>
              </div>
              <div className="shrink-0 text-right font-mono text-[10px] text-slate-500">
                <div>{src.latencyMs}ms</div>
                {src.url && (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-print mt-1 inline-flex items-center gap-0.5 text-sky-400 hover:underline"
                  >
                    <span>Ref</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-[#1A2333] pt-3 text-[11px] text-slate-500">
          Disclaimer: FBMIE aggregates open-source public sanctions lists, community threat intelligence, on-chain oracles, and behavioral heuristics for investigative triage and compliance decision support. Output is not formal legal advice.
        </p>
      </section>
    </div>
  );
}
