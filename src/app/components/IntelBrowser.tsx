"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Database, Search } from "lucide-react";
import { shortenAddress } from "@/lib/chains";
import { IntelRecord } from "@/lib/types";

interface IntelBrowserProps {
  onScreenAddress: (address: string) => void;
}

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  { id: "ofac_sanctions", label: "OFAC SDN" },
  { id: "un_eu_sanctions", label: "UN / EU / UK / NBCTF" },
  { id: "ransomware", label: "Ransomware" },
  { id: "mixer", label: "Mixers & Privacy" },
  { id: "darknet", label: "Darknet & Illicit" },
  { id: "exploit", label: "Exploits & Heists" },
  { id: "scam", label: "Scam / Drainers" },
  { id: "bridge", label: "Bridges" },
];

const CHAINS = [
  { id: "all", label: "All Chains" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "evm", label: "Ethereum / EVM" },
  { id: "tron", label: "TRON" },
  { id: "solana", label: "Solana" },
  { id: "litecoin", label: "Litecoin" },
  { id: "monero", label: "Monero" },
  { id: "xrp", label: "XRP" },
];

export function IntelBrowser({ onScreenAddress }: IntelBrowserProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [chain, setChain] = useState("all");
  const [items, setItems] = useState<IntelRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          category,
          chain,
          limit: "60",
        });
        const res = await fetch(`/api/index?${params.toString()}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setItems(json.items || []);
          setTotal(json.total || 0);
          setSyncedAt(json.stats?.syncedAt || null);
        }
      } catch {
        // aborted
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, category, chain]);

  return (
    <section className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              Verified Multi-Chain Threat Intelligence Registry
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Explore real OFAC SDN, EU FSF, UNSCR 1718, UK FCDO, NBCTF, Conti/LockBit/WannaCry ransomware, Tornado Cash/Railgun mixers, Hydra/Garantex darknet, MEW darklist &amp; ScamSniffer entries.
          </p>
        </div>
        {syncedAt && (
          <span className="rounded border border-[#253145] bg-[#131924] px-2.5 py-1 font-mono text-[10px] text-slate-400">
            Index synced: {new Date(syncedAt).toISOString().slice(0, 10)}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address, entity name (Garantex, Lazarus, WannaCry, Tornado, Conti…), ref or jurisdiction"
            className="w-full rounded-xl border border-[#253145] bg-[#090C11] py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500/70 focus:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-[#253145] bg-[#090C11] px-3 py-2 text-xs text-slate-200 focus:border-sky-500/70 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="rounded-xl border border-[#253145] bg-[#090C11] px-3 py-2 text-xs text-slate-200 focus:border-sky-500/70 focus:outline-none"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
        <span>
          Showing <strong className="text-slate-200">{items.length}</strong> of{" "}
          <strong className="text-slate-200">{total.toLocaleString()}</strong> matching records
        </span>
        {loading && <span className="text-sky-400">Filtering…</span>}
      </div>

      <div className="max-h-[540px] overflow-auto rounded-xl border border-[#1E2736]">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-[#131924] font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2.5">Address</th>
              <th className="px-3 py-2.5">Chain</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Entity / Label</th>
              <th className="px-3 py-2.5">Source / Jur.</th>
              <th className="px-3 py-2.5 text-right">Screen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#172030]">
            {items.map((rec, idx) => (
              <tr key={`${rec.address}-${rec.category}-${idx}`} className="hover:bg-[#131924]">
                <td className="px-3 py-2 font-mono text-[11px] text-slate-100">
                  {shortenAddress(rec.address, 10, 6)}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] uppercase text-slate-400">
                  {rec.chain}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                      rec.severity === "critical"
                        ? "border-rose-500/35 bg-rose-500/15 text-rose-300"
                        : rec.severity === "high"
                          ? "border-orange-500/35 bg-orange-500/15 text-orange-300"
                          : "border-slate-600/40 bg-slate-700/20 text-slate-300"
                    }`}
                  >
                    {rec.category}
                  </span>
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-[11px] text-slate-200">
                  {rec.label}
                </td>
                <td className="px-3 py-2 text-[11px] text-slate-400">
                  <span>{rec.source}</span>{" "}
                  <span className="font-mono text-[10px] text-slate-500">
                    ({rec.jurisdiction})
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onScreenAddress(rec.address)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-400 hover:underline"
                  >
                    <span>Screen</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
