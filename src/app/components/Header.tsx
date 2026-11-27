"use client";

import {
  Code2,
  Database,
  Globe,
  Layers,
  Network,
  ShieldAlert,
} from "lucide-react";

export type ActiveTab = "screen" | "batch" | "scraper" | "index" | "proxy";

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  totalRecords: number | null;
  clientIp: string | null;
  proxyActive: boolean;
  onOpenApiDocs: () => void;
}

export function Header({
  activeTab,
  onTabChange,
  totalRecords,
  clientIp,
  proxyActive,
  onOpenApiDocs,
}: HeaderProps) {
  const tabs: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
    { id: "screen", label: "Screen Address", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    { id: "batch", label: "Batch Screen", icon: <Layers className="h-3.5 w-3.5" /> },
    { id: "scraper", label: "Live Feeds & Scraper", icon: <Globe className="h-3.5 w-3.5" /> },
    { id: "index", label: "Intel Registry", icon: <Database className="h-3.5 w-3.5" /> },
    { id: "proxy", label: "Proxy & IP", icon: <Network className="h-3.5 w-3.5" /> },
  ];

  return (
    <header className="no-print sticky top-0 z-30 border-b border-[#1E2736] bg-[#090C11]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onTabChange("screen")}
          className="flex items-center gap-3 text-left focus:outline-none"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold tracking-wider text-slate-100">
                FBMIE
              </span>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                Zero Account
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Forensic Blockchain Multi-chain Intelligence Engine
            </p>
          </div>
        </button>

        {/* Navigation Tabs */}
        <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-[#1E2736] bg-[#0F141D] p-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#1A2434] text-sky-300 shadow-sm ring-1 ring-sky-500/30"
                    : "text-slate-400 hover:bg-[#151C28] hover:text-slate-200"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Live Current IP Pill + Status + REST API */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onTabChange("proxy")}
            title="View your current IP check & configure server proxy"
            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
              proxyActive
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                : "border-[#1E2736] bg-[#0F141D] text-slate-300 hover:border-sky-500/40 hover:text-sky-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                proxyActive ? "bg-emerald-400 animate-pulse" : "bg-sky-400"
              }`}
            />
            <span className="tabular-nums">
              {clientIp ? `IP ${clientIp}` : "IP Check"}
            </span>
            {proxyActive && (
              <span className="rounded bg-emerald-500/20 px-1 text-[9px] uppercase text-emerald-300">
                Proxy
              </span>
            )}
          </button>

          <div className="hidden items-center gap-1.5 rounded-md border border-[#1E2736] bg-[#0F141D] px-2.5 py-1.5 text-[11px] text-slate-400 xl:flex">
            <span className="font-mono text-slate-300 tabular-nums">
              {totalRecords ? `${totalRecords.toLocaleString()}` : "5,300+"}
            </span>
            <span>indexed</span>
          </div>

          <button
            type="button"
            onClick={onOpenApiDocs}
            className="flex items-center gap-1.5 rounded-md border border-[#1E2736] bg-[#0F141D] px-2.5 py-1.5 font-mono text-xs text-slate-300 transition-colors hover:border-sky-500/40 hover:text-sky-300"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">REST API</span>
          </button>
        </div>
      </div>
    </header>
  );
}
