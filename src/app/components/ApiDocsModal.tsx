"use client";

import { useState } from "react";
import { Check, Code2, Copy, X } from "lucide-react";

interface ApiDocsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ApiDocsModal({ open, onClose }: ApiDocsModalProps) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!open) return null;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-vercel-app.vercel.app";

  const endpoints = [
    {
      id: "screen",
      method: "GET",
      path: "/api/screen?address=<WALLET>&chain=auto&deepScan=true",
      desc: "Screen a single multi-chain wallet against OFAC, UN, EU, UK, NBCTF sanctions, ransomware, mixers, darknet & live laundering patterns.",
      curl: `curl -s "${origin}/api/screen?address=0x098B716B8Aaf21512996dC57EB0615e2383E2f96"`,
    },
    {
      id: "batch",
      method: "POST",
      path: "/api/batch",
      desc: "Batch screen up to 25 mixed-chain wallet addresses concurrently.",
      curl: `curl -s -X POST "${origin}/api/batch" \\\n  -H "Content-Type: application/json" \\\n  -d '{"addresses":["0x098B716B8Aaf21512996dC57EB0615e2383E2f96","bc1qwtz3zv95x2flu4w26kgfepf529z50r2sqc5zml"]}'`,
    },
    {
      id: "scrape",
      method: "POST",
      path: "/api/scrape",
      desc: "Scrape any public free HTTPS API, JSON/CSV/TXT watchlist, or HTML page, extract wallet addresses across chains, and cross-screen them.",
      curl: `curl -s -X POST "${origin}/api/scrape" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.json"}'`,
    },
    {
      id: "feeds",
      method: "GET",
      path: "/api/feeds?probe=true",
      desc: "Inspect all integrated free zero-key feeds, dataset record counts & live reachability.",
      curl: `curl -s "${origin}/api/feeds?probe=true"`,
    },
    {
      id: "ipcheck",
      method: "GET",
      path: "/api/ip-check",
      desc: "Returns your current client IP, deployment server direct egress IP, and proxied egress IP (if HTTP/HTTPS proxy is configured).",
      curl: `curl -s "${origin}/api/ip-check"`,
    },
  ];

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#243043] bg-[#0F141D] p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1E2736] pb-3.5">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-sky-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Public Zero-Auth REST API
              </h2>
              <p className="text-xs text-slate-400">
                No account, no API key, CORS-enabled. Ready for Vercel serverless deployment.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#182130] hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {endpoints.map((ep) => (
            <div
              key={ep.id}
              className="rounded-xl border border-[#1E2736] bg-[#131924] p-3.5 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                  {ep.method}
                </span>
                <code className="font-mono text-xs text-slate-100">{ep.path}</code>
              </div>
              <p className="text-xs text-slate-400">{ep.desc}</p>
              <div className="relative rounded-lg border border-[#1E2736] bg-[#090C11] p-2.5">
                <pre className="overflow-x-auto pr-12 font-mono text-[11px] text-slate-300">
                  {ep.curl}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(ep.id, ep.curl)}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-[#253145] bg-[#131924] px-2 py-1 font-mono text-[10px] text-slate-300 hover:text-sky-300"
                >
                  {copied === ep.id ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copied === ep.id ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
