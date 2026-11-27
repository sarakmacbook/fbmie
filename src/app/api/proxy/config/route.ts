import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PROXY_CONFIG,
  PROXY_COOKIE_NAME,
  readProxyConfigFromRequest,
  serializeProxyConfig,
  toPublicProxyConfig,
  validateProxyConfig,
  ProxyConfig,
} from "@/lib/proxy-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cfg = readProxyConfigFromRequest(req);
  return NextResponse.json({
    config: toPublicProxyConfig(cfg),
    isVercel: process.env.VERCEL === "1",
  });
}

export async function POST(req: NextRequest) {
  try {
    const existing = readProxyConfigFromRequest(req);
    const body = (await req.json()) as Partial<ProxyConfig> & { clearPassword?: boolean };

    // Keep previously saved password if user leaves password empty when editing other fields
    const mergedPassword =
      body.clearPassword
        ? ""
        : body.password && body.password.length > 0
          ? body.password
          : body.mode !== "direct" && body.host === existing.host
            ? existing.password || ""
            : "";

    const check = validateProxyConfig({
      mode: body.mode,
      host: body.host,
      port: body.port,
      username: body.username,
      password: mergedPassword,
    });

    if (!check.valid || !check.config) {
      return NextResponse.json({ error: check.error || "Invalid proxy settings" }, { status: 400 });
    }

    const res = NextResponse.json({
      saved: true,
      config: toPublicProxyConfig(check.config),
    });

    if (check.config.mode === "direct") {
      res.cookies.set(PROXY_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    } else {
      res.cookies.set(PROXY_COOKIE_NAME, serializeProxyConfig(check.config), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save proxy settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({
    saved: true,
    config: toPublicProxyConfig(DEFAULT_PROXY_CONFIG),
  });
  res.cookies.set(PROXY_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
