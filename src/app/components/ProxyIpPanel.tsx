"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  MapPin,
  Network,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { ProxyMode, PublicProxyConfig } from "@/lib/proxy-config";

interface ClientIpData {
  ip: string | null;
  isLocal: boolean;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
  asn?: string;
  timezone?: string;
  headerSource: string;
  enriched: boolean;
}

interface OutboundIpData {
  ok: boolean;
  ip: string | null;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
  asn?: string;
  timezone?: string;
  source: string;
  latencyMs: number;
  error?: string;
}

interface IpCheckResponse {
  client: ClientIpData;
  direct: OutboundIpData;
  proxied: OutboundIpData | null;
  proxyConfig: PublicProxyConfig;
  masked: boolean;
  isVercel: boolean;
  checkedAt: string;
}

interface ProxyIpPanelProps {
  onStatusUpdated?: (status: { clientIp: string | null; proxyActive: boolean; proxyHost?: string }) => void;
}

function formatLocation(parts: Array<string | undefined>): string {
  const valid = parts.filter(Boolean);
  return valid.length > 0 ? valid.join(", ") : "Location unavailable";
}

export function ProxyIpPanel({ onStatusUpdated }: ProxyIpPanelProps) {
  const [ipData, setIpData] = useState<IpCheckResponse | null>(null);
  const [loadingCheck, setLoadingCheck] = useState(true);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<IpCheckResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Proxy form state
  const [mode, setMode] = useState<ProxyMode>("direct");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8080");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const syncFormFromConfig = (cfg: PublicProxyConfig) => {
    setMode(cfg.mode);
    setHost(cfg.host || "");
    setPort(String(cfg.port || 8080));
    setUsername(cfg.username || "");
    setPassword("");
    setHasSavedPassword(Boolean(cfg.hasPassword));
  };

  const fetchFullIpCheck = useCallback(async () => {
    setLoadingCheck(true);
    setTestError(null);
    try {
      const res = await fetch("/api/ip-check", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as IpCheckResponse;
        setIpData(json);
        syncFormFromConfig(json.proxyConfig);
        onStatusUpdated?.({
          clientIp: json.client?.ip ?? null,
          proxyActive: json.proxyConfig.mode !== "direct" && Boolean(json.proxyConfig.host),
          proxyHost: json.proxyConfig.host
            ? `${json.proxyConfig.host}:${json.proxyConfig.port}`
            : undefined,
        });
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Failed to run IP check");
    } finally {
      setLoadingCheck(false);
    }
  }, [onStatusUpdated]);

  useEffect(() => {
    fetchFullIpCheck();
  }, [fetchFullIpCheck]);

  const copyIp = async (ip: string | null, key: string) => {
    if (!ip) return;
    try {
      await navigator.clipboard.writeText(ip);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore
    }
  };

  const handleSaveProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/proxy/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          host: host.trim(),
          port: Number(port) || 8080,
          username: username.trim(),
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save proxy settings");
      }
      syncFormFromConfig(json.config as PublicProxyConfig);
      setSaveMessage({
        type: "ok",
        text:
          json.config.mode === "direct"
            ? "Saved: using direct server connection (no proxy)."
            : `Saved: routing outbound requests via ${json.config.mode.toUpperCase()} proxy ${json.config.host}:${json.config.port}.`,
      });
      onStatusUpdated?.({
        clientIp: ipData?.client?.ip ?? null,
        proxyActive: json.config.mode !== "direct" && Boolean(json.config.host),
        proxyHost: json.config.host ? `${json.config.host}:${json.config.port}` : undefined,
      });
      // Immediately refresh full IP check so cards reflect updated proxy
      await fetchFullIpCheck();
    } catch (err) {
      setSaveMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Unable to save proxy",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestError(null);
    try {
      const hasDraftProxy = mode !== "direct" && host.trim().length > 0;
      const res = await fetch("/api/ip-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasDraftProxy
            ? {
                useDraft: true,
                config: {
                  mode,
                  host: host.trim(),
                  port: Number(port) || 8080,
                  username: username.trim(),
                  password,
                },
              }
            : { useDraft: false }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Connection test failed");
      }
      setTestResult(json as IpCheckResponse);
      setIpData(json as IpCheckResponse);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTestingConn(false);
    }
  };

  const isProxySaved =
    ipData?.proxyConfig &&
    ipData.proxyConfig.mode !== "direct" &&
    Boolean(ipData.proxyConfig.host);

  const activeResult = testResult ?? ipData;

  return (
    <div className="space-y-6">
      {/* =================================================================== */}
      {/* 1. CURRENT IP CHECK (CLIENT + DIRECT SERVER + PROXIED EGRESS)       */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-sky-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Current IP Check
              </h2>
              {activeResult?.masked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  SERVER EGRESS MASKED
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Live check showing your current browser IP, this deployment&apos;s direct egress IP, and the outbound IP seen by upstream APIs through your proxy.
            </p>
          </div>

          <button
            type="button"
            disabled={loadingCheck}
            onClick={fetchFullIpCheck}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#253145] bg-[#131924] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-sky-500/40 hover:text-sky-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingCheck ? "animate-spin" : ""}`} />
            <span>{loadingCheck ? "Checking IP…" : "Refresh IP Check"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Card A: Visitor / Browser Current IP */}
          <div className="rounded-xl border border-sky-500/30 bg-[#101925] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                <Globe className="h-3.5 w-3.5" />
                Your Current IP (Client)
              </span>
              {activeResult?.client?.ip && (
                <button
                  type="button"
                  onClick={() => copyIp(activeResult.client.ip, "client")}
                  className="inline-flex items-center gap-1 rounded border border-[#253145] bg-[#0B0F16] px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:text-sky-300"
                >
                  {copiedKey === "client" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedKey === "client" ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>

            {loadingCheck && !activeResult ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                <span>Resolving your IP…</span>
              </div>
            ) : (
              <div className="mt-2.5 space-y-2">
                <div className="font-mono text-xl font-bold tracking-tight text-slate-50 tabular-nums">
                  {activeResult?.client?.ip || "Unavailable"}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">
                    {activeResult?.client?.isLocal
                      ? "Localhost / Loopback (deploy on Vercel for public client IP)"
                      : formatLocation([
                          activeResult?.client?.city,
                          activeResult?.client?.region,
                          activeResult?.client?.country || activeResult?.client?.countryCode,
                        ])}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/10 pt-2 font-mono text-[10px] text-slate-400">
                  <span className="truncate">
                    {activeResult?.client?.isp || activeResult?.client?.org || "ISP via request headers"}
                  </span>
                  {activeResult?.client?.asn && (
                    <span className="rounded bg-[#090C11] px-1.5 py-0.5 text-sky-300">
                      {activeResult.client.asn}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Card B: Server Direct Egress IP */}
          <div className="rounded-xl border border-[#1E2736] bg-[#131924] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                <Server className="h-3.5 w-3.5 text-slate-400" />
                Server Direct Egress IP
              </span>
              {activeResult?.direct?.ip && (
                <button
                  type="button"
                  onClick={() => copyIp(activeResult.direct.ip, "direct")}
                  className="inline-flex items-center gap-1 rounded border border-[#253145] bg-[#0B0F16] px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:text-sky-300"
                >
                  {copiedKey === "direct" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedKey === "direct" ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>

            {loadingCheck && !activeResult ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                <span>Echoing direct server IP…</span>
              </div>
            ) : activeResult?.direct?.ok ? (
              <div className="mt-2.5 space-y-2">
                <div className="font-mono text-xl font-bold tracking-tight text-slate-100 tabular-nums">
                  {activeResult.direct.ip}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">
                    {formatLocation([
                      activeResult.direct.city,
                      activeResult.direct.region,
                      activeResult.direct.country || activeResult.direct.countryCode,
                    ])}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/10 pt-2 font-mono text-[10px] text-slate-400">
                  <span className="truncate">
                    {activeResult.direct.isp || activeResult.direct.org || activeResult.direct.source}
                  </span>
                  <span className="text-slate-500">{activeResult.direct.latencyMs}ms</span>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                <div className="font-mono text-sm font-semibold text-amber-300">
                  Echo unreachable
                </div>
                <p className="text-[11px] text-slate-400">
                  {activeResult?.direct?.error || "Outbound IP-echo blocked in current sandbox environment."}
                </p>
              </div>
            )}
          </div>

          {/* Card C: Proxied Egress IP */}
          <div
            className={`rounded-xl border p-4 ${
              activeResult?.proxied?.ok
                ? "border-emerald-500/35 bg-[#0D1B16]"
                : activeResult?.proxied && !activeResult.proxied.ok
                  ? "border-rose-500/35 bg-[#1C1016]"
                  : "border-[#1E2736] bg-[#131924]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                Proxied Outbound IP
              </span>
              {activeResult?.proxied?.ip && (
                <button
                  type="button"
                  onClick={() => copyIp(activeResult.proxied?.ip ?? null, "proxied")}
                  className="inline-flex items-center gap-1 rounded border border-[#253145] bg-[#0B0F16] px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:text-sky-300"
                >
                  {copiedKey === "proxied" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedKey === "proxied" ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>

            {!activeResult?.proxied ? (
              <div className="mt-2.5 space-y-1.5">
                <div className="font-mono text-sm font-semibold text-slate-300">
                  Direct connection
                </div>
                <p className="text-[11px] text-slate-500">
                  No HTTP/HTTPS proxy saved. Configure a proxy below to mask this deployment&apos;s server egress IP.
                </p>
              </div>
            ) : activeResult.proxied.ok ? (
              <div className="mt-2.5 space-y-2">
                <div className="font-mono text-xl font-bold tracking-tight text-emerald-300 tabular-nums">
                  {activeResult.proxied.ip}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-200">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">
                    {formatLocation([
                      activeResult.proxied.city,
                      activeResult.proxied.region,
                      activeResult.proxied.country || activeResult.proxied.countryCode,
                    ])}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/10 pt-2 font-mono text-[10px] text-slate-400">
                  <span className="truncate">
                    {activeResult.proxied.isp || activeResult.proxied.source}
                  </span>
                  <span className="text-emerald-400">{activeResult.proxied.latencyMs}ms</span>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                <div className="font-mono text-sm font-semibold text-rose-300">
                  Proxy failed
                </div>
                <p className="text-[11px] text-rose-200/80">
                  {activeResult.proxied.error || "Could not connect through configured proxy."}
                </p>
              </div>
            )}
          </div>
        </div>

        {activeResult?.checkedAt && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-slate-500">
            <span>Last checked: {new Date(activeResult.checkedAt).toUTCString()}</span>
            <span>Client header source: {activeResult.client.headerSource}</span>
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 2. PROXY & VPN SETTINGS + TEST CONNECTION                           */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-[#1E2736] bg-[#0F141D] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-sky-400" />
              <h2 className="text-lg font-semibold text-slate-100">Proxy &amp; VPN</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
              Send the app&apos;s own outbound requests through an HTTP/HTTPS proxy — sanctions feeds, GoPlus threat APIs, blockchain explorers, RPCs, and custom scrapers — so providers see the proxy&apos;s address instead of this deployment&apos;s. Your browser traffic is not affected; this is the server side only.
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs font-medium ${
              isProxySaved
                ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                : "border-[#253145] bg-[#131924] text-slate-300"
            }`}
          >
            {isProxySaved
              ? `Proxy active · ${ipData.proxyConfig.host}:${ipData.proxyConfig.port}`
              : "Direct connection"}
          </span>
        </div>

        <form onSubmit={handleSaveProxy} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Connection Mode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Connection
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ProxyMode)}
                className="w-full rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-2.5 text-sm text-slate-100 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="direct">Direct — no proxy</option>
                <option value="http">HTTP Proxy (http://)</option>
                <option value="https">HTTPS Proxy (https://)</option>
              </select>
            </div>

            {/* Host */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                disabled={mode === "direct"}
                placeholder="127.0.0.1"
                spellCheck={false}
                className="w-full rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
            </div>

            {/* Port */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Port</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={mode === "direct"}
                placeholder="8080"
                className="w-full rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Username <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={mode === "direct"}
                placeholder="Proxy username"
                autoComplete="off"
                className="w-full rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={mode === "direct"}
                placeholder={
                  hasSavedPassword
                    ? "Saved in HttpOnly cookie (leave blank to keep)"
                    : "Proxy password"
                }
                autoComplete="new-password"
                className="w-full rounded-xl border border-[#253145] bg-[#090C11] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50"
              />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Something must be listening at that host and port from{" "}
            <strong className="text-slate-200">this app&apos;s server</strong>. On Vercel that means a public proxy address, not{" "}
            <code className="rounded bg-[#182130] px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
              127.0.0.1
            </code>
            . For a VMess/VLESS server, run v2ray/Xray with an HTTP inbound and put its address here — the app cannot speak the VMess tunnel itself. Settings are saved in an HttpOnly browser cookie (no account or database required).
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save proxy</span>
              )}
            </button>

            {saveMessage && (
              <span
                className={`inline-flex items-center gap-1.5 text-xs ${
                  saveMessage.type === "ok" ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {saveMessage.type === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                <span>{saveMessage.text}</span>
              </span>
            )}
          </div>
        </form>

        {/* ================================================================= */}
        {/* TEST THE CONNECTION                                               */}
        {/* ================================================================= */}
        <div className="mt-6 border-t border-[#1E2736] pt-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Test the connection
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Asks an IP-echo service twice — directly and through the saved proxy — and shows both addresses.
              </p>
            </div>
            <button
              type="button"
              disabled={testingConn}
              onClick={handleTestConnection}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#2B394F] bg-[#141C29] px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:border-sky-500/50 hover:bg-[#192436] disabled:opacity-50"
            >
              {testingConn ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                  <span>Testing IP Echo…</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-sky-400" />
                  <span>Test connection</span>
                </>
              )}
            </button>
          </div>

          {testError && (
            <div className="mt-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {testError}
            </div>
          )}

          {testResult && (
            <div className="mt-4 space-y-3 rounded-xl border border-[#1E2736] bg-[#0B0F16] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Dual IP-Echo Verification Result
                </span>
                {testResult.proxied ? (
                  testResult.masked ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      PASS — Proxy masked egress IP
                    </span>
                  ) : testResult.proxied.ok ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      Connected — Same IP returned as direct
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-300">
                      <AlertTriangle className="h-3 w-3" />
                      FAIL — Proxy unreachable
                    </span>
                  )
                ) : (
                  <span className="rounded bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] text-sky-300">
                    Direct mode verified (no proxy set)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[#1E2736] bg-[#121822] p-3">
                  <div className="font-mono text-[10px] uppercase text-slate-400">
                    1. Direct Server Request
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-100">
                    {testResult.direct.ok ? testResult.direct.ip : `Error: ${testResult.direct.error}`}
                  </div>
                  {testResult.direct.ok && (
                    <div className="mt-1 text-[11px] text-slate-400">
                      {formatLocation([
                        testResult.direct.city,
                        testResult.direct.country,
                      ])}{" "}
                      · {testResult.direct.isp || testResult.direct.source} ·{" "}
                      <span className="font-mono">{testResult.direct.latencyMs}ms</span>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[#1E2736] bg-[#121822] p-3">
                  <div className="font-mono text-[10px] uppercase text-slate-400">
                    2. Through Proxy{" "}
                    {testResult.proxyConfig.mode !== "direct"
                      ? `(${testResult.proxyConfig.mode}://${testResult.proxyConfig.host}:${testResult.proxyConfig.port})`
                      : "(not enabled)"}
                  </div>
                  {testResult.proxied ? (
                    <>
                      <div
                        className={`mt-1 font-mono text-base font-bold ${
                          testResult.proxied.ok ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {testResult.proxied.ok
                          ? testResult.proxied.ip
                          : `Error: ${testResult.proxied.error}`}
                      </div>
                      {testResult.proxied.ok && (
                        <div className="mt-1 text-[11px] text-slate-400">
                          {formatLocation([
                            testResult.proxied.city,
                            testResult.proxied.country,
                          ])}{" "}
                          · {testResult.proxied.isp || testResult.proxied.source} ·{" "}
                          <span className="font-mono">{testResult.proxied.latencyMs}ms</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-1 text-xs text-slate-500">
                      Select HTTP or HTTPS Proxy above and enter Host &amp; Port to compare both addresses.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
