import { NextRequest } from "next/server";
import { serverFetch } from "./http-client";
import { DEFAULT_PROXY_CONFIG, ProxyConfig } from "./proxy-config";

export interface IpGeoInfo {
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

export interface ClientIpInfo {
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

function cleanIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  // Strip IPv6-mapped IPv4 prefix
  return first.replace(/^::ffff:/i, "");
}

function isPrivateOrLocalIp(ip: string | null): boolean {
  if (!ip) return true;
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  ) {
    return true;
  }
  const m = ip.match(/^172\.(\d+)\./);
  if (m) {
    const oct = Number(m[1]);
    if (oct >= 16 && oct <= 31) return true;
  }
  return false;
}

function safeDecode(val: string | null): string | undefined {
  if (!val) return undefined;
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

interface IpWhoResponse {
  success?: boolean;
  ip?: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  connection?: {
    asn?: number;
    org?: string;
    isp?: string;
  };
  timezone?: { id?: string };
  message?: string;
}

async function fetchJsonTimeout<T>(
  url: string,
  proxyCfg: ProxyConfig,
  timeoutMs = 5500
): Promise<{ ok: boolean; status: number; data: T | null; latencyMs: number; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await serverFetch(
      url,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "FBMIE-IP-Check/1.0",
        },
        cache: "no-store",
      },
      proxyCfg
    );
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Connection timed out"
          : err.message
        : "Connection failed";
    return { ok: false, status: 0, data: null, latencyMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextTimeout(
  url: string,
  proxyCfg: ProxyConfig,
  timeoutMs = 5000
): Promise<{ ok: boolean; text: string | null; latencyMs: number; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await serverFetch(
      url,
      {
        signal: controller.signal,
        headers: { "User-Agent": "curl/8.5.0" },
        cache: "no-store",
      },
      proxyCfg
    );
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, text: null, latencyMs, error: `HTTP ${res.status}` };
    }
    const text = (await res.text()).trim();
    return { ok: true, text, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Connection timed out"
          : err.message
        : "Connection failed";
    return { ok: false, text: null, latencyMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the visitor's own client IP from incoming request headers (Vercel
 * Edge / Cloudflare / reverse-proxy headers) and optionally enriches with Geo/ISP.
 */
export async function resolveClientIp(req: NextRequest, enrich = true): Promise<ClientIpInfo> {
  const cfIp = cleanIp(req.headers.get("cf-connecting-ip"));
  const vercelFwd = cleanIp(req.headers.get("x-vercel-forwarded-for"));
  const xff = cleanIp(req.headers.get("x-forwarded-for"));
  const realIp = cleanIp(req.headers.get("x-real-ip"));

  const ip = cfIp || vercelFwd || xff || realIp || null;
  const headerSource = cfIp
    ? "cf-connecting-ip"
    : vercelFwd
      ? "x-vercel-forwarded-for"
      : xff
        ? "x-forwarded-for"
        : realIp
          ? "x-real-ip"
          : "local-loopback";

  const isLocal = isPrivateOrLocalIp(ip);

  const info: ClientIpInfo = {
    ip: ip || "127.0.0.1",
    isLocal,
    countryCode: req.headers.get("x-vercel-ip-country") || undefined,
    region: safeDecode(req.headers.get("x-vercel-ip-country-region")),
    city: safeDecode(req.headers.get("x-vercel-ip-city")),
    asn: req.headers.get("x-vercel-ip-as-number")
      ? `AS${req.headers.get("x-vercel-ip-as-number")}`
      : undefined,
    headerSource,
    enriched: false,
  };

  if (enrich && ip && !isLocal) {
    const res = await fetchJsonTimeout<IpWhoResponse>(
      `https://ipwho.is/${encodeURIComponent(ip)}`,
      DEFAULT_PROXY_CONFIG,
      3500
    );
    if (res.ok && res.data && res.data.success !== false) {
      info.country = res.data.country || info.country;
      info.countryCode = res.data.country_code || info.countryCode;
      info.region = res.data.region || info.region;
      info.city = res.data.city || info.city;
      info.isp = res.data.connection?.isp || undefined;
      info.org = res.data.connection?.org || undefined;
      info.asn = res.data.connection?.asn ? `AS${res.data.connection.asn}` : info.asn;
      info.timezone = res.data.timezone?.id || undefined;
      info.enriched = true;
    }
  }

  return info;
}

/**
 * Queries an IP-echo service directly or through a given ProxyConfig.
 * Uses ipwho.is first (returns IP + Geo + ISP/ASN in a single zero-key request),
 * with automatic fallback to api.ipify.org and icanhazip.com.
 */
export async function probeOutboundIp(proxyCfg: ProxyConfig): Promise<IpGeoInfo> {
  // Primary: ipwho.is (IP + country + city + ISP + ASN)
  const who = await fetchJsonTimeout<IpWhoResponse>("https://ipwho.is/", proxyCfg, 6500);
  if (who.ok && who.data && who.data.success !== false && who.data.ip) {
    return {
      ok: true,
      ip: who.data.ip,
      country: who.data.country,
      countryCode: who.data.country_code,
      region: who.data.region,
      city: who.data.city,
      isp: who.data.connection?.isp,
      org: who.data.connection?.org,
      asn: who.data.connection?.asn ? `AS${who.data.connection.asn}` : undefined,
      timezone: who.data.timezone?.id,
      source: "ipwho.is",
      latencyMs: who.latencyMs,
    };
  }

  // Fallback 1: api.ipify.org
  const ipify = await fetchJsonTimeout<{ ip?: string }>(
    "https://api.ipify.org?format=json",
    proxyCfg,
    5500
  );
  if (ipify.ok && ipify.data?.ip) {
    return {
      ok: true,
      ip: ipify.data.ip,
      source: "api.ipify.org",
      latencyMs: ipify.latencyMs,
    };
  }

  // Fallback 2: icanhazip.com
  const haz = await fetchTextTimeout("https://icanhazip.com/", proxyCfg, 5000);
  if (haz.ok && haz.text && /^[0-9a-fA-F.:]{6,45}$/.test(haz.text)) {
    return {
      ok: true,
      ip: haz.text,
      source: "icanhazip.com",
      latencyMs: haz.latencyMs,
    };
  }

  return {
    ok: false,
    ip: null,
    source: "ipwho.is / api.ipify.org",
    latencyMs: who.latencyMs || ipify.latencyMs || haz.latencyMs,
    error: who.error || ipify.error || haz.error || "IP-echo probe failed",
  };
}
