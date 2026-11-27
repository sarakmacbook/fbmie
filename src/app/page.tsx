"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Database,
  Globe,
  Loader2,
  Lock,
  Radio,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { ChainId, ScreeningReport } from "@/lib/types";
import { ApiDocsModal } from "./components/ApiDocsModal";
import { BatchScreener } from "./components/BatchScreener";
import { FeedScraperPanel } from "./components/FeedScraperPanel";
import { ActiveTab, Header } from "./components/Header";
import { IntelBrowser } from "./components/IntelBrowser";
import { ProxyIpPanel } from "./components/ProxyIpPanel";
import { ScreeningReportView } from "./components/ScreeningReportView";
import { SearchConsole } from "./components/SearchConsole";

const HISTORY_KEY = "fbmie_recent_screens_v1";

interface HistoryEntry {
  address: string;
  riskTier: string;
  riskScore: number;
  chain: string;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("screen");
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<ChainId | "auto">("auto");
  const [deepScan, setDeepScan] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScreeningReport | null>(null);
  const [totalRecords, setTotalRecords] = useState<number | null>(null);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [proxyActive, setProxyActive] = useState(false);
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [batchSeedText, setBatchSeedText] = useState("");
  const [apiModalOpen, setApiModalOpen] = useState(false);

  // Load initial stats, current IP check & browser history
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setRecentHistory(parsed.slice(0, 8));
      }
    } catch {
      // ignore storage issues
    }

    fetch("/api/feeds")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.stats?.totalRecords) setTotalRecords(d.stats.totalRecords);
      })
      .catch(() => {});

    fetch("/api/ip-check?mode=client", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.client?.ip) setClientIp(d.client.ip);
        if (d?.proxyConfig) {
          setProxyActive(
            d.proxyConfig.mode !== "direct" && Boolean(d.proxyConfig.host)
          );
        }
      })
      .catch(() => {});
  }, []);

  const pushHistory = useCallback((rep: ScreeningReport) => {
    setRecentHistory((prev) => {
      const next = [
        {
          address: rep.address,
          riskTier: rep.riskTier,
          riskScore: rep.riskScore,
          chain: rep.primaryChain,
        },
        ...prev.filter((p) => p.address.toLowerCase() !== rep.address.toLowerCase()),
      ].slice(0, 8);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const runScreen = useCallback(
    async (overrideAddress?: string, overrideChain?: ChainId | "auto") => {
      const targetAddr = (overrideAddress ?? address).trim();
      const targetChain = overrideChain ?? chain;
      if (!targetAddr) return;

      setActiveTab("screen");
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          address: targetAddr,
          chain: targetChain,
          deepScan: String(deepScan),
        });
        const res = await fetch(`/api/screen?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Unable to screen address");
        }
        setReport(json as ScreeningReport);
        pushHistory(json as ScreeningReport);

        // Update browser URL cleanly so reports are shareable
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("address", targetAddr);
          window.history.replaceState({}, "", url.toString());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Screening failed");
        setReport(null);
      } finally {
        setLoading(false);
      }
    },
    [address, chain, deepScan, pushHistory]
  );

  // Auto-run if ?address=... is present in URL on initial load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qAddr = params.get("address");
    if (qAddr && qAddr.trim()) {
      setAddress(qAddr.trim());
      runScreen(qAddr.trim(), "auto");
    }
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePivotAddress = (nextAddr: string) => {
    setAddress(nextAddr);
    setChain("auto");
    runScreen(nextAddr, "auto");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSendToBatch = (addresses: string[]) => {
    setBatchSeedText(addresses.join("\n"));
    setActiveTab("batch");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalRecords={totalRecords}
        clientIp={clientIp}
        proxyActive={proxyActive}
        onOpenApiDocs={() => setApiModalOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        {activeTab === "screen" && (
          <>
            <SearchConsole
              address={address}
              onAddressChange={setAddress}
              chain={chain}
              onChainChange={setChain}
              deepScan={deepScan}
              onDeepScanChange={setDeepScan}
              loading={loading}
              onSubmit={runScreen}
              recentHistory={recentHistory}
            />

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div>
                  <p className="font-semibold text-rose-300">Validation / Screening Error</p>
                  <p className="mt-0.5 text-rose-200/90">{error}</p>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1E2736] bg-[#0F141D] px-6 py-14 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
                <p className="mt-3 text-sm font-medium text-slate-200">
                  Running Multi-Chain Sanctions, Threat Intel &amp; Laundering Analysis…
                </p>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  Querying OFAC SDN · EU/UN/UK/NBCTF · Chainalysis On-Chain Oracle · GoPlus · Ransomware · Mixers · Live Explorers
                </p>
              </div>
            )}

            {!loading && report && (
              <ScreeningReportView
                report={report}
                onPivotAddress={handlePivotAddress}
              />
            )}

            {!loading && !report && !error && (
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: <ShieldAlert className="h-4 w-4 text-rose-400" />,
                    title: "OFAC, UN, EU, UK & NBCTF Sanctions",
                    desc: "Cross-checks 18 blockchains against daily US Treasury OFAC SDN extracts, EU Financial Sanctions (FSF), UNSCR 1718 DPRK Lazarus designations, UK FCDO, Israel NBCTF & live Chainalysis On-Chain Sanctions Oracle calls.",
                  },
                  {
                    icon: <Lock className="h-4 w-4 text-orange-400" />,
                    title: "Ransomware & Extortion Lists",
                    desc: "Integrates Ransomwhere (11,000+ wallets via OpenSanctions), Conti leaked payment/affiliate datasets, LockBit active wallets, WannaCry, DarkSide, SamSam & GoPlus blackmail flags.",
                  },
                  {
                    icon: <Radio className="h-4 w-4 text-amber-400" />,
                    title: "Mixers, Privacy & Darknet Markets",
                    desc: "Screens Tornado Cash multi-chain pools, Railgun, Sinbad, Blender, Hydra Market, Garantex, Suex OTC, Chatex, Silk Road, Xinbi, MEW darklist & 2,500+ ScamSniffer drainers.",
                  },
                  {
                    icon: <Activity className="h-4 w-4 text-sky-400" />,
                    title: "8 Laundering Pattern Detectors",
                    desc: "Pulls live transactions from Mempool.space, Blockscout v2, TronScan, Solana RPC & XRPScan to score 1-hop taint, rapid pass-through sweeps, peel chains, structuring, CoinJoin/mixer denominations & bridge hopping.",
                  },
                  {
                    icon: <Globe className="h-4 w-4 text-emerald-400" />,
                    title: "Live Free API & Web Scraper",
                    desc: "Scrape any public HTTPS free API, raw GitHub JSON/CSV/TXT dataset, or HTML threat report to extract multi-chain wallets and cross-screen them instantly with built-in SSRF protection.",
                  },
                  {
                    icon: <Shield className="h-4 w-4 text-sky-300" />,
                    title: "Zero Account · Exportable Dossiers",
                    desc: "No sign-up, no API keys, no user tracking. Share permalinks, batch screen 25 wallets at once, export JSON/CSV/PDF dossiers, or call the public REST API directly.",
                  },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="rounded-xl border border-[#1E2736] bg-[#0F141D] p-4 transition-colors hover:border-[#2B394F]"
                  >
                    <div className="flex items-center gap-2">
                      {card.icon}
                      <h2 className="text-xs font-semibold text-slate-100">
                        {card.title}
                      </h2>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {card.desc}
                    </p>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {activeTab === "batch" && (
          <BatchScreener
            key={batchSeedText}
            initialText={batchSeedText}
            onInspectAddress={handlePivotAddress}
          />
        )}

        {activeTab === "scraper" && (
          <FeedScraperPanel
            onScreenAddress={handlePivotAddress}
            onSendToBatch={handleSendToBatch}
          />
        )}

        {activeTab === "index" && (
          <IntelBrowser onScreenAddress={handlePivotAddress} />
        )}

        {activeTab === "proxy" && (
          <ProxyIpPanel
            onStatusUpdated={(st) => {
              if (st.clientIp) setClientIp(st.clientIp);
              setProxyActive(st.proxyActive);
            }}
          />
        )}
      </main>

      <footer className="no-print border-t border-[#1A2333] bg-[#090C11] py-5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-slate-500" />
            <span>
              FBMIE · Powered by open-source public feeds (OFAC SDN, OpenSanctions, Chainalysis On-Chain Oracle, GoPlus, Mempool.space, Blockscout, TronScan, Solana RPC, MEW &amp; ScamSniffer)
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            Zero-Account Serverless Architecture · Vercel Ready
          </span>
        </div>
      </footer>

      <ApiDocsModal open={apiModalOpen} onClose={() => setApiModalOpen(false)} />
    </div>
  );
}
