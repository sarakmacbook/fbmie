"use client";

import { useMemo } from "react";
import {
  Activity,
  Clock,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { detectAddress } from "@/lib/chains";
import { ChainId } from "@/lib/types";

export interface CasePreset {
  label: string;
  tag: string;
  address: string;
  chain?: ChainId | "auto";
  badgeTone: "red" | "orange" | "amber" | "emerald";
}

export const FORENSIC_PRESETS: CasePreset[] = [
  {
    label: "Lazarus / Ronin Exploiter",
    tag: "OFAC · UNSCR 1718 · ETH",
    address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    badgeTone: "red",
  },
  {
    label: "Garantex Exchange (EU FSF)",
    tag: "EU Sanctions · Darknet · BTC",
    address: "bc1qwtz3zv95x2flu4w26kgfepf529z50r2sqc5zml",
    badgeTone: "red",
  },
  {
    label: "Garantex TRON USDT",
    tag: "EU FSF · TRON",
    address: "TA1hsikRfsgGiW9nEBpT4tEXEySTNYLr2d",
    badgeTone: "red",
  },
  {
    label: "WannaCry 2.0 Ransomware",
    tag: "Ransomware · BTC",
    address: "13AM4VW2dhxYgXeQepoHkHSQuy6NgaEb94",
    badgeTone: "orange",
  },
  {
    label: "Tornado Cash Router",
    tag: "Mixer · Privacy · ETH",
    address: "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b",
    badgeTone: "amber",
  },
  {
    label: "vitalik.eth (Reference)",
    tag: "Clean Public Address · ETH",
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    badgeTone: "emerald",
  },
];

const CHAIN_OPTIONS: Array<{ value: ChainId | "auto"; label: string }> = [
  { value: "auto", label: "Auto-Detect Chain" },
  { value: "ethereum", label: "Ethereum (ETH)" },
  { value: "bitcoin", label: "Bitcoin (BTC)" },
  { value: "tron", label: "TRON (TRX / USDT)" },
  { value: "solana", label: "Solana (SOL)" },
  { value: "base", label: "Base (EVM)" },
  { value: "arbitrum", label: "Arbitrum One" },
  { value: "optimism", label: "OP Mainnet" },
  { value: "polygon", label: "Polygon PoS" },
  { value: "bsc", label: "BNB Smart Chain" },
  { value: "avalanche", label: "Avalanche C-Chain" },
  { value: "litecoin", label: "Litecoin (LTC)" },
  { value: "xrp", label: "XRP Ledger" },
  { value: "monero", label: "Monero (XMR)" },
];

interface SearchConsoleProps {
  address: string;
  onAddressChange: (v: string) => void;
  chain: ChainId | "auto";
  onChainChange: (c: ChainId | "auto") => void;
  deepScan: boolean;
  onDeepScanChange: (v: boolean) => void;
  loading: boolean;
  onSubmit: (overrideAddress?: string, overrideChain?: ChainId | "auto") => void;
  recentHistory: Array<{ address: string; riskTier: string; riskScore: number; chain: string }>;
}

export function SearchConsole({
  address,
  onAddressChange,
  chain,
  onChainChange,
  deepScan,
  onDeepScanChange,
  loading,
  onSubmit,
  recentHistory,
}: SearchConsoleProps) {
  const preview = useMemo(() => {
    if (!address.trim()) return null;
    return detectAddress(address, chain);
  }, [address, chain]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || loading) return;
    onSubmit();
  };

  return (
    <section className="no-print rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 shadow-xl sm:p-6">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
            Cross-Chain Wallet Sanctions &amp; AML Screening
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
            Screen any wallet across Bitcoin, Ethereum, EVM L2s, TRON, Solana, XRP, Litecoin &amp; privacy chains against{" "}
            <span className="text-slate-200">OFAC SDN, UN, EU FSF, UK FCDO, NBCTF</span>, ransomware lists, mixers, darknet services &amp; live laundering patterns.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span className="rounded border border-[#253145] bg-[#141B27] px-2 py-0.5 text-sky-300">
            No API Key Needed
          </span>
          <span className="rounded border border-[#253145] bg-[#141B27] px-2 py-0.5 text-slate-300">
            No Sign-Up
          </span>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-3">
        <div className="flex flex-col gap-2.5 lg:flex-row">
          {/* Address Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Paste wallet address (0x..., bc1q..., 1..., 3..., T..., Solana, r..., ltc1..., 4...)"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-[#253145] bg-[#090C11] py-3 pl-10 pr-24 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
            {address && (
              <button
                type="button"
                onClick={() => onAddressChange("")}
                aria-label="Clear address"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-[#182130] hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Chain Selector */}
          <select
            value={chain}
            onChange={(e) => onChainChange(e.target.value as ChainId | "auto")}
            aria-label="Select blockchain network"
            className="rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-3 text-xs font-medium text-slate-200 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20 lg:w-48"
          >
            {CHAIN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition-all hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 lg:w-52"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Screening…</span>
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                <span>Screen Wallet</span>
              </>
            )}
          </button>
        </div>

        {/* Detection Preview + Deep Scan Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex items-center gap-2">
            {preview ? (
              preview.valid ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Detected: {preview.format}
                  {preview.detectedChains.length > 1
                    ? ` (${preview.detectedChains.length} EVM chains)`
                    : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] text-rose-300">
                  Unrecognized format — verify address characters
                </span>
              )
            ) : (
              <span className="text-[11px] text-slate-500">
                Supports EVM (ETH/Base/Arb/OP/Pol/BSC/Avax), Bitcoin, TRON, Solana, Litecoin, XRP, Monero, Zcash, Dash &amp; TON
              </span>
            )}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-slate-300 select-none">
            <input
              type="checkbox"
              checked={deepScan}
              onChange={(e) => onDeepScanChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-[#090C11] accent-sky-500"
            />
            <span>Deep On-Chain Flow, 1-Hop Counterparty &amp; Laundering Scan</span>
          </label>
        </div>
      </form>

      {/* Forensic Presets */}
      <div className="mt-4 border-t border-[#1A2333] pt-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          <Sparkles className="h-3 w-3 text-sky-400" />
          <span>Verified Real-World Test Cases (1-Click Screen)</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FORENSIC_PRESETS.map((preset) => {
            const dotClass =
              preset.badgeTone === "red"
                ? "bg-rose-500"
                : preset.badgeTone === "orange"
                  ? "bg-orange-500"
                  : preset.badgeTone === "amber"
                    ? "bg-amber-400"
                    : "bg-emerald-400";
            return (
              <button
                key={preset.address}
                type="button"
                disabled={loading}
                onClick={() => {
                  onAddressChange(preset.address);
                  onChainChange("auto");
                  onSubmit(preset.address, "auto");
                }}
                className="group flex items-center justify-between gap-2 rounded-lg border border-[#1E2736] bg-[#131924] px-3 py-2 text-left transition-colors hover:border-sky-500/40 hover:bg-[#172030] disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
                    <span className="truncate text-xs font-medium text-slate-200 group-hover:text-sky-200">
                      {preset.label}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                    {preset.address}
                  </div>
                </div>
                <span className="shrink-0 rounded border border-[#253145] bg-[#0B0F16] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  {preset.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Local History (Browser-only, No Account) */}
      {recentHistory.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#1A2333] pt-3">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="h-3 w-3" />
            Recent:
          </span>
          {recentHistory.slice(0, 6).map((item) => (
            <button
              key={`${item.address}-${item.chain}`}
              type="button"
              onClick={() => {
                onAddressChange(item.address);
                onSubmit(item.address, "auto");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1E2736] bg-[#121822] px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:border-sky-500/40 hover:text-sky-200"
            >
              <span>
                {item.address.slice(0, 6)}…{item.address.slice(-4)}
              </span>
              <span
                className={
                  item.riskScore >= 85
                    ? "text-rose-400"
                    : item.riskScore >= 65
                      ? "text-orange-400"
                      : item.riskScore >= 40
                        ? "text-amber-400"
                        : "text-emerald-400"
                }
              >
                {item.riskScore}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
