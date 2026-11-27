import { NextRequest, NextResponse } from "next/server";
import { detectAddress } from "@/lib/chains";
import { runWithProxyConfig } from "@/lib/http-client";
import { readProxyConfigFromRequest } from "@/lib/proxy-config";
import { screenWalletAddress } from "@/lib/screening-engine";
import { BatchItemSummary } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BATCH = 25;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      addresses?: string[];
      deepScan?: boolean;
    };

    if (!Array.isArray(body?.addresses) || body.addresses.length === 0) {
      return NextResponse.json(
        { error: "Provide an 'addresses' array with 1 to 25 wallet addresses." },
        { status: 400 }
      );
    }

    const cleaned = Array.from(
      new Set(
        body.addresses
          .map((a) => String(a || "").trim())
          .filter(Boolean)
      )
    ).slice(0, MAX_BATCH);

    const deepScan = body.deepScan ?? false;
    const proxyCfg = readProxyConfigFromRequest(req);
    const started = Date.now();

    // Process with bounded concurrency of 5 so free APIs stay snappy & respectful
    const results: BatchItemSummary[] = [];
    const chunkSize = 5;

    await runWithProxyConfig(proxyCfg, async () => {
      for (let i = 0; i < cleaned.length; i += chunkSize) {
        const slice = cleaned.slice(i, i + chunkSize);
        const batchSlice = await Promise.all(
          slice.map(async (addr): Promise<BatchItemSummary> => {
            const det = detectAddress(addr);
            if (!det.valid) {
              return {
                address: addr,
                primaryChain: "unknown",
                valid: false,
                error: det.error || "Invalid address format",
                riskScore: 0,
                riskTier: "LOW",
                ofacHit: false,
                unEuHit: false,
                ransomwareHit: false,
                mixerHit: false,
                darknetHit: false,
                launderingDetected: false,
                topFinding: "Invalid address format",
                findingsCount: 0,
              };
            }
            try {
              const report = await screenWalletAddress(addr, { deepScan });
              const pillarMap = new Map(report.pillars.map((p) => [p.id, p]));
              const topRisk = report.findings.find(
                (f) => f.category !== "benign" && f.category !== "exchange" && f.category !== "bridge"
              );
              return {
                address: report.address,
                primaryChain: report.primaryChain,
                valid: true,
                riskScore: report.riskScore,
                riskTier: report.riskTier,
                ofacHit: pillarMap.get("ofac")?.status !== "CLEAR",
                unEuHit: pillarMap.get("un_eu")?.status !== "CLEAR",
                ransomwareHit: pillarMap.get("ransomware")?.status !== "CLEAR",
                mixerHit: pillarMap.get("mixers")?.status !== "CLEAR",
                darknetHit: pillarMap.get("darknet")?.status !== "CLEAR",
                launderingDetected: pillarMap.get("laundering")?.status !== "CLEAR",
                topFinding:
                  topRisk?.title ||
                  report.findings[0]?.title ||
                  "No watchlist or compliance flags detected",
                findingsCount: report.findings.filter((f) => f.weight > 0).length,
                report,
              };
            } catch (err) {
              return {
                address: addr,
                primaryChain: det.primaryChain,
                valid: false,
                error: err instanceof Error ? err.message : "Screen failed",
                riskScore: 0,
                riskTier: "LOW",
                ofacHit: false,
                unEuHit: false,
                ransomwareHit: false,
                mixerHit: false,
                darknetHit: false,
                launderingDetected: false,
                topFinding: "Screening error",
                findingsCount: 0,
              };
            }
          })
        );
        results.push(...batchSlice);
      }
    });

    const summary = {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      severe: results.filter((r) => r.riskTier === "SEVERE").length,
      high: results.filter((r) => r.riskTier === "HIGH").length,
      elevated: results.filter((r) => r.riskTier === "ELEVATED").length,
      moderate: results.filter((r) => r.riskTier === "MODERATE").length,
      low: results.filter((r) => r.valid && r.riskTier === "LOW").length,
      durationMs: Date.now() - started,
    };

    return NextResponse.json({ summary, results }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch screening failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
