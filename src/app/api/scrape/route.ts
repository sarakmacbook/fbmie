import { NextRequest, NextResponse } from "next/server";
import { scrapePublicEndpoint } from "@/lib/scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    if (!body?.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "Provide a valid public HTTPS 'url' to scrape." },
        { status: 400 }
      );
    }

    const result = await scrapePublicEndpoint(body.url);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scrape endpoint";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
