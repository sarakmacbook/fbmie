import { NextRequest, NextResponse } from "next/server";
import { probeOutboundIp, resolveClientIp } from "@/lib/ip-check";
import {
  DEFAULT_PROXY_CONFIG,
  ProxyConfig,
  readProxyConfigFromRequest,
  toPublicProxyConfig,
  validateProxyConfig,
} from "@/lib/proxy-config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/ip-check
 * - ?mode=client : lightweight header + client IP check for top bar badge
 * - default      : full check returning your client IP, server direct egress IP,
 *                  and proxied egress IP (if a proxy is saved).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "full";
  const savedProxy = readProxyConfigFromRequest(req);

  if (mode === "client") {
    const client = await resolveClientIp(req, true);
    return NextResponse.json({
      client,
      proxyConfig: toPublicProxyConfig(savedProxy),
      isVercel: process.env.VERCEL === "1",
      checkedAt: new Date().toISOString(),
    });
  }

  const hasProxy = savedProxy.mode !== "direct" && Boolean(savedProxy.host);

  const [client, direct, proxied] = await Promise.all([
    resolveClientIp(req, true),
    probeOutboundIp(DEFAULT_PROXY_CONFIG),
    hasProxy ? probeOutboundIp(savedProxy) : Promise.resolve(null),
  ]);

  const masked = Boolean(
    proxied?.ok && proxied.ip && direct.ip && proxied.ip !== direct.ip
  );

  return NextResponse.json({
    client,
    direct,
    proxied,
    proxyConfig: toPublicProxyConfig(savedProxy),
    masked,
    isVercel: process.env.VERCEL === "1",
    checkedAt: new Date().toISOString(),
  });
}

/**
 * POST /api/ip-check
 * Runs the dual IP-echo connection test directly and through either the
 * saved proxy or an optional unsaved proxy configuration supplied in body.
 */
export async function POST(req: NextRequest) {
  const savedProxy = readProxyConfigFromRequest(req);
  let targetProxy: ProxyConfig = savedProxy;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      useDraft?: boolean;
      config?: Partial<ProxyConfig>;
    };

    if (body?.useDraft && body.config) {
      const mergedPassword =
        body.config.password && body.config.password.length > 0
          ? body.config.password
          : body.config.host === savedProxy.host
            ? savedProxy.password || ""
            : "";

      const check = validateProxyConfig({
        mode: body.config.mode,
        host: body.config.host,
        port: body.config.port,
        username: body.config.username,
        password: mergedPassword,
      });
      if (!check.valid || !check.config) {
        return NextResponse.json({ error: check.error || "Invalid proxy config" }, { status: 400 });
      }
      targetProxy = check.config;
    }
  } catch {
    // fallback to saved proxy
  }

  const hasProxy = targetProxy.mode !== "direct" && Boolean(targetProxy.host);

  const [client, direct, proxied] = await Promise.all([
    resolveClientIp(req, true),
    probeOutboundIp(DEFAULT_PROXY_CONFIG),
    hasProxy ? probeOutboundIp(targetProxy) : Promise.resolve(null),
  ]);

  const masked = Boolean(
    proxied?.ok && proxied.ip && direct.ip && proxied.ip !== direct.ip
  );

  return NextResponse.json({
    client,
    direct,
    proxied,
    proxyConfig: toPublicProxyConfig(targetProxy),
    masked,
    isVercel: process.env.VERCEL === "1",
    checkedAt: new Date().toISOString(),
  });
}
