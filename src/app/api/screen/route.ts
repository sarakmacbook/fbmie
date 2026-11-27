import { NextRequest, NextResponse } from "next/server";
import { runWithProxyConfig } from "@/lib/http-client";
import { readProxyConfigFromRequest } from "@/lib/proxy-config";
import { screenWalletAddress } from "@/lib/screening-engine";
import { ChainId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || searchParams.get("q") || "";
  const chain = (searchParams.get("chain") || "auto") as ChainId | "auto";
  const deepScanParam = searchParams.get("deepScan");
  const deepScan = deepScanParam === null ? true : deepScanParam !== "false" && deepScanParam !== "0";

  if (!address.trim()) {
    return NextResponse.json(
      { error: "Missing required query parameter: address" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const proxyCfg = readProxyConfigFromRequest(req);
    const report = await runWithProxyConfig(proxyCfg, () =>
      screenWalletAddress(address, { chain, deepScan })
    );
    return NextResponse.json(report, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to screen wallet address";
    return NextResponse.json({ error: message }, { status: 400, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      address?: string;
      chain?: ChainId | "auto";
      deepScan?: boolean;
    };

    if (!body?.address || typeof body.address !== "string") {
      return NextResponse.json(
        { error: "Request body must include a valid 'address' string." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const proxyCfg = readProxyConfigFromRequest(req);
    const report = await runWithProxyConfig(proxyCfg, () =>
      screenWalletAddress(body.address!, {
        chain: body.chain ?? "auto",
        deepScan: body.deepScan ?? true,
      })
    );
    return NextResponse.json(report, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screening failed";
    return NextResponse.json({ error: message }, { status: 400, headers: CORS_HEADERS });
  }
}
