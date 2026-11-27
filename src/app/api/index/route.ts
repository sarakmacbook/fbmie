import { NextRequest, NextResponse } from "next/server";
import { getIntelStats, searchIntelIndex } from "@/lib/intel-index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "all";
  const chain = searchParams.get("chain") || "all";
  const limit = Number(searchParams.get("limit") || "50");
  const offset = Number(searchParams.get("offset") || "0");

  const result = searchIntelIndex({ query, category, chain, limit, offset });
  const stats = getIntelStats();

  return NextResponse.json({
    ...result,
    stats,
  });
}
