"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  Globe,
  Layers,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { shortenAddress } from "@/lib/chains";
import { ScrapeResult } from "@/lib/types";

const FREE_SCRAPE_PRESETS = [
  {
    label: "OFAC SDN · Bitcoin (GitHub JSON)",
    url: "https://api.github.com/repos/0xB10C/ofac-sanctioned-digital-currency-addresses/contents/sanctioned_addresses_XBT.json?ref=lists",
    rawUrl:
      "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_XBT.json",
    tag: "US OFAC",
  },
  {
    label: "OFAC SDN · Ethereum (GitHub JSON)",
    rawUrl:
      "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.json",
    tag: "US OFAC",
  },
  {
    label: "OFAC SDN · TRON (GitHub JSON)",
    rawUrl:
      "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_TRX.json",
    tag: "US OFAC",
  },
  {
    label: "Conti Ransomware Payments (GitHub CSV)",
    rawUrl:
      "https://raw.githubusercontent.com/cablej/conti-payments/main/expanded_conti_addresses.csv",
    tag: "Ransomware",
  },
  {
    label: "LockBit Funded Wallets (GitHub CSV)",
    rawUrl:
      "https://raw.githubusercontent.com/elliott-diy/LockBit-Wallet-Tracker/main/funded_wallets_may2025.csv",
    tag: "Ransomware",
  },
  {
    label: "MyEtherWallet Darklist (GitHub JSON)",
    rawUrl:
      "https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json",
    tag: "Scam/Phish",
  },
  {
    label: "OpenSanctions · FBI Lazarus Crypto (CSV)",
    rawUrl:
      "https://data.opensanctions.org/datasets/latest/us_fbi_lazarus_crypto/targets.simple.csv",
    tag: "UN/FBI",
  },
  {
    label: "Traql · OFAC/UK/EU Sanctions Page (HTML)",
    rawUrl: "https://traql.io/sanctioned-crypto-addresses",
    tag: "EU/UK/OFAC",
  },
];

interface FeedItem {
  id: string;
  name: string;
  provider: string;
  category: string;
  chains: string[];
  description: string;
  endpoint: string;
  liveStatus: "ready" | "online" | "degraded";
  latencyMs: number | null;
}

interface FeedScraperPanelProps {
  onScreenAddress: (address: string) => void;
  onSendToBatch: (addresses: string[]) => void;
}

export function FeedScraperPanel({
  onScreenAddress,
  onSendToBatch,
}: FeedScraperPanelProps) {
  const [url, setUrl] = useState(FREE_SCRAPE_PRESETS[1].rawUrl);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);

  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [probing, setProbing] = useState(false);

  const loadFeeds = async (probe = false) => {
    setProbing(probe);
    try {
      const res = await fetch(`/api/feeds${probe ? "?probe=true" : ""}`);
      if (res.ok) {
        const json = await res.json();
        setFeeds(json.feeds || []);
      }
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    loadFeeds(false);
  }, []);

  const runScrape = async (targetUrl?: string) => {
    const endpoint = (targetUrl ?? url).trim();
    if (!endpoint) return;
    setScraping(true);
    setScrapeError(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: endpoint }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Scrape failed");
      }
      setScrapeResult(json);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Unable to scrape endpoint");
    } finally {
      setScraping(false);
    }
  };

  const downloadExtracted = () => {
    if (!scrapeResult) return;
    const blob = new Blob([JSON.stringify(scrapeResult, null, 2)], {
      type: "application/json",
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `fbmie-scraped-wallets-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div className="space-y-6">
      {/* =================================================================== */}
      {/* UNIVERSAL FREE API / PUBLIC SITE SCRAPER                            */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 sm:p-6">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-sky-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              Universal Free API &amp; Threat Feed Wallet Scraper
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Point FBMIE at any public HTTPS free API, raw GitHub JSON/CSV/TXT watchlist, OpenSanctions export, or HTML threat-intel report. It securely fetches the payload, extracts multi-chain wallet addresses, detects networks, and cross-screens every address against sanctions, ransomware, mixers &amp; darknet lists.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runScrape();
          }}
          className="flex flex-col gap-2.5 sm:flex-row"
        >
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://raw.githubusercontent.com/... or any free public JSON/CSV/HTML API URL"
            className="flex-1 rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <button
            type="submit"
            disabled={scraping || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {scraping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Scraping…</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                <span>Scrape &amp; Cross-Screen</span>
              </>
            )}
          </button>
        </form>

        {/* Presets */}
        <div className="mt-3.5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            1-Click Free Public Endpoints to Scrape
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FREE_SCRAPE_PRESETS.map((p) => (
              <button
                key={p.rawUrl}
                type="button"
                disabled={scraping}
                onClick={() => {
                  setUrl(p.rawUrl);
                  runScrape(p.rawUrl);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E2736] bg-[#131924] px-2.5 py-1.5 text-[11px] text-slate-200 transition-colors hover:border-sky-500/40 hover:text-sky-200 disabled:opacity-50"
              >
                <span>{p.label}</span>
                <span className="rounded bg-[#090C11] px-1.5 py-0.5 font-mono text-[9px] text-sky-300">
                  {p.tag}
                </span>
              </button>
            ))}
          </div>
        </div>

        {scrapeError && (
          <div className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {scrapeError}
          </div>
        )}

        {/* Scrape Results */}
        {scrapeResult && (
          <div className="mt-5 space-y-4 border-t border-[#1E2736] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                  HTTP {scrapeResult.httpStatus}
                </span>
                <span className="text-slate-300">
                  Extracted: <strong>{scrapeResult.totalExtracted}</strong> wallets
                </span>
                <span className="text-rose-300">
                  Matched Intel: <strong>{scrapeResult.flaggedCount}</strong>
                </span>
                <span className="text-slate-500">
                  {(scrapeResult.bytesRead / 1024).toFixed(1)} KB · {scrapeResult.durationMs}ms
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {scrapeResult.extracted.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onSendToBatch(
                        scrapeResult.extracted.slice(0, 25).map((e) => e.address)
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>
                      Send Top {Math.min(25, scrapeResult.extracted.length)} to Batch Screen
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={downloadExtracted}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#253145] bg-[#131924] px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/40"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>

            {scrapeResult.extracted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#243043] bg-[#090C11] p-5 text-center text-xs text-slate-400">
                No valid multi-chain cryptocurrency wallet addresses were found in this response body.
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-xl border border-[#1E2736]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#131924] font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Extracted Wallet</th>
                      <th className="px-3 py-2.5">Chain</th>
                      <th className="px-3 py-2.5">Cross-Screen Intel</th>
                      <th className="px-3 py-2.5">Source Context</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#172030]">
                    {scrapeResult.extracted.slice(0, 100).map((item) => (
                      <tr key={item.address} className="hover:bg-[#131924]">
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-100">
                          {shortenAddress(item.address, 11, 6)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] uppercase text-slate-400">
                          {item.chain}
                        </td>
                        <td className="px-3 py-2">
                          {item.intelHits.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.intelHits.slice(0, 2).map((h, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 rounded border border-rose-500/35 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-300"
                                >
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                  {h.category} ({h.jurisdiction})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-mono text-[10px] text-slate-500">
                              Unlisted locally
                            </span>
                          )}
                        </td>
                        <td className="max-w-xs truncate px-3 py-2 font-mono text-[10px] text-slate-500">
                          {item.context || "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => onScreenAddress(item.address)}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-400 hover:underline"
                          >
                            <span>Deep Screen</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* BUILT-IN FREE ZERO-KEY FEEDS STATUS                                 */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Integrated Zero-Key Public Intelligence Feeds
            </h2>
            <p className="text-xs text-slate-400">
              All feeds operate without user accounts or paid API keys, backed by a bundled verified fallback snapshot.
            </p>
          </div>
          <button
            type="button"
            disabled={probing}
            onClick={() => loadFeeds(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#253145] bg-[#131924] px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500/40 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${probing ? "animate-spin" : ""}`} />
            <span>{probing ? "Probing Live APIs…" : "Probe Live Reachability"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="rounded-xl border border-[#1E2736] bg-[#131924] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">{feed.name}</h3>
                  <p className="text-[11px] text-slate-400">{feed.provider}</p>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span
                    className={`rounded px-1.5 py-0.5 uppercase ${
                      feed.liveStatus === "online"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : feed.liveStatus === "degraded"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-sky-500/15 text-sky-300"
                    }`}
                  >
                    {feed.liveStatus}
                  </span>
                  {feed.latencyMs !== null && (
                    <span className="text-slate-500">{feed.latencyMs}ms</span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                {feed.description}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5">
                <div className="flex flex-wrap gap-1">
                  {feed.chains.slice(0, 7).map((c) => (
                    <span
                      key={c}
                      className="rounded bg-[#090C11] px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
                    >
                      {c}
                    </span>
                  ))}
                  {feed.chains.length > 7 && (
                    <span className="font-mono text-[9px] text-slate-500">
                      +{feed.chains.length - 7}
                    </span>
                  )}
                </div>
                <a
                  href={feed.endpoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-sky-400 hover:underline"
                >
                  <span>Endpoint</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
