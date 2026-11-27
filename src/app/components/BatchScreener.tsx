"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Download,
  FileJson,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import { shortenAddress } from "@/lib/chains";
import { BatchItemSummary } from "@/lib/types";

const SAMPLE_BATCH = [
  "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
  "bc1qwtz3zv95x2flu4w26kgfepf529z50r2sqc5zml",
  "TA1hsikRfsgGiW9nEBpT4tEXEySTNYLr2d",
  "13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94",
  "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b",
  "0x2f389ce8bd8ff92de3402ffce4691d17fc4f6535",
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
].join("\n");

interface BatchScreenerProps {
  initialText?: string;
  onInspectAddress: (address: string) => void;
}

interface BatchResponse {
  summary: {
    total: number;
    valid: number;
    severe: number;
    high: number;
    elevated: number;
    moderate: number;
    low: number;
    durationMs: number;
  };
  results: BatchItemSummary[];
}

export function BatchScreener({ initialText = "", onInspectAddress }: BatchScreenerProps) {
  const [rawInput, setRawInput] = useState(initialText);
  const [deepScan, setDeepScan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BatchResponse | null>(null);

  const parsedAddresses = Array.from(
    new Set(
      rawInput
        .split(/[\n,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 20)
    )
  ).slice(0, 25);

  const runBatch = async (addressesOverride?: string[]) => {
    const list = addressesOverride ?? parsedAddresses;
    if (list.length === 0) {
      setError("Paste at least one wallet address (separated by newlines or commas).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: list, deepScan }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Batch screening failed");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch request failed");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      "address",
      "chain",
      "risk_score",
      "risk_tier",
      "ofac",
      "un_eu_uk",
      "ransomware",
      "mixer",
      "darknet",
      "laundering",
      "top_finding",
    ];
    const rows = data.results.map((r) =>
      [
        r.address,
        r.primaryChain,
        r.riskScore,
        r.riskTier,
        r.ofacHit,
        r.unEuHit,
        r.ransomwareHit,
        r.mixerHit,
        r.darknetHit,
        r.launderingDetected,
        r.topFinding,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fbmie-batch-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fbmie-batch-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Multi-Chain Batch Wallet Screening
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Paste up to 25 mixed-chain addresses (BTC, ETH/EVM, TRON, SOL, LTC, XRP, XMR) separated by lines or commas. No account required.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRawInput(SAMPLE_BATCH)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#253145] bg-[#131924] px-3 py-1.5 text-xs text-sky-300 hover:border-sky-500/40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Load Mixed Multi-Chain Sample (8)</span>
          </button>
        </div>

        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={"0x098B716B8Aaf21512996dC57EB0615e2383E2f96\nbc1qwtz3zv95x2flu4w26kgfepf529z50r2sqc5zml\nTA1hsikRfsgGiW9nEBpT4tEXEySTNYLr2d"}
          className="w-full rounded-xl border border-[#253145] bg-[#090C11] p-3.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="font-mono text-slate-400">
              Detected:{" "}
              <strong className="text-slate-100">{parsedAddresses.length}</strong> / 25 max
            </span>
            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-300 select-none">
              <input
                type="checkbox"
                checked={deepScan}
                onChange={(e) => setDeepScan(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-[#090C11] accent-sky-500"
              />
              <span>Include live transaction flow scan (slower)</span>
            </label>
          </div>

          <button
            type="button"
            disabled={loading || parsedAddresses.length === 0}
            onClick={() => runBatch()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Screening {parsedAddresses.length} Wallets…</span>
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" />
                <span>Run Batch Screen ({parsedAddresses.length})</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
      </section>

      {data && (
        <section className="space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-[#1E2736] bg-[#0F141D] p-3.5">
              <div className="text-[11px] text-slate-400">Total Screened</div>
              <div className="mt-1 font-mono text-xl font-bold text-slate-100 tabular-nums">
                {data.summary.total}
              </div>
              <div className="font-mono text-[10px] text-slate-500">
                in {data.summary.durationMs}ms
              </div>
            </div>
            <div className="rounded-xl border border-rose-500/35 bg-[#1B1016] p-3.5">
              <div className="text-[11px] text-rose-300">SEVERE / BLOCK</div>
              <div className="mt-1 font-mono text-xl font-bold text-rose-400 tabular-nums">
                {data.summary.severe}
              </div>
            </div>
            <div className="rounded-xl border border-orange-500/35 bg-[#1C1410] p-3.5">
              <div className="text-[11px] text-orange-300">HIGH RISK</div>
              <div className="mt-1 font-mono text-xl font-bold text-orange-400 tabular-nums">
                {data.summary.high}
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/35 bg-[#1B170D] p-3.5">
              <div className="text-[11px] text-amber-300">ELEVATED / MOD</div>
              <div className="mt-1 font-mono text-xl font-bold text-amber-400 tabular-nums">
                {data.summary.elevated + data.summary.moderate}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-[#0C1915] p-3.5">
              <div className="text-[11px] text-emerald-300">LOW / CLEAR</div>
              <div className="mt-1 font-mono text-xl font-bold text-emerald-400 tabular-nums">
                {data.summary.low}
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                Batch Compliance Matrix
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#253145] bg-[#131924] px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/40"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#253145] bg-[#131924] px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/40"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#1E2736]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#131924] font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Address</th>
                    <th className="px-3 py-2.5">Chain</th>
                    <th className="px-3 py-2.5">Score</th>
                    <th className="px-3 py-2.5">Flags</th>
                    <th className="px-3 py-2.5">Top Finding</th>
                    <th className="px-3 py-2.5 text-right">Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172030]">
                  {data.results.map((r) => (
                    <tr key={r.address} className="hover:bg-[#131924]">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-100">
                        {shortenAddress(r.address, 10, 6)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] uppercase text-slate-400">
                        {r.primaryChain}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                            r.riskTier === "SEVERE"
                              ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                              : r.riskTier === "HIGH"
                                ? "border-orange-500/40 bg-orange-500/15 text-orange-300"
                                : r.riskTier === "ELEVATED"
                                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                                  : "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {r.riskScore} · {r.riskTier}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 font-mono text-[9px]">
                          {r.ofacHit && (
                            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
                              OFAC
                            </span>
                          )}
                          {r.unEuHit && (
                            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
                              UN/EU/UK
                            </span>
                          )}
                          {r.ransomwareHit && (
                            <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-orange-300">
                              RANSOM
                            </span>
                          )}
                          {r.mixerHit && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                              MIXER
                            </span>
                          )}
                          {r.darknetHit && (
                            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
                              DARKNET
                            </span>
                          )}
                          {r.launderingDetected && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                              LAUNDERING
                            </span>
                          )}
                          {!r.ofacHit &&
                            !r.unEuHit &&
                            !r.ransomwareHit &&
                            !r.mixerHit &&
                            !r.darknetHit &&
                            !r.launderingDetected && (
                              <span className="text-emerald-400">CLEAR</span>
                            )}
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2.5 text-[11px] text-slate-300">
                        {r.topFinding}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.valid && (
                          <button
                            type="button"
                            onClick={() => onInspectAddress(r.address)}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-400 hover:underline"
                          >
                            <span>Inspect</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
