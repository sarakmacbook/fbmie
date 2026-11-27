import { detectAddress, normalizeForLookup } from "./chains";
import { serverFetch } from "./http-client";
import { lookupLocalIntel } from "./intel-index";
import { ChainId, ScrapeResult } from "./types";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB cap
const SCRAPE_TIMEOUT_MS = 10000;

/**
 * Strict SSRF guard: only allows public HTTPS URLs (no localhost, loopback,
 * RFC1918 private IPs, link-local / cloud metadata IPs, or raw IP literals).
 */
export function validatePublicScrapeUrl(rawUrl: string): { valid: boolean; url?: URL; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: "Invalid URL syntax. Provide a valid https:// URL." };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTPS public endpoints are allowed." };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: "Authenticated URLs with embedded credentials are not allowed." };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1"
  ) {
    return { valid: false, error: "Local, internal, and cloud metadata hosts are blocked." };
  }

  // Block raw IPv4 / IPv6 literals (prevents 127.x, 10.x, 169.254.x, 172.16-31.x, 192.168.x, decimal/hex IP tricks)
  if (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    /^\d+$/.test(host) ||
    /^0x[0-9a-f]+$/i.test(host) ||
    host.includes(":")
  ) {
    return { valid: false, error: "Direct IP literals are blocked. Use a public domain name." };
  }

  if (!host.includes(".")) {
    return { valid: false, error: "Host must be a valid public domain name." };
  }

  return { valid: true, url: parsed };
}

// Multi-chain address extraction regexes (carefully tuned to avoid false-positive hex hashes & English words)
const ADDRESS_PATTERNS: Array<{ chain: ChainId; regex: RegExp }> = [
  // EVM 0x (exactly 40 hex chars, not part of a 64-char tx hash!)
  { chain: "ethereum", regex: /(?<![0-9a-fA-F])0x[a-fA-F0-9]{40}(?![0-9a-fA-F])/g },
  // Bitcoin Bech32 / Taproot
  { chain: "bitcoin", regex: /\bbc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}\b/gi },
  // Litecoin Bech32
  { chain: "litecoin", regex: /\bltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}\b/gi },
  // TRON T... (34 chars Base58)
  { chain: "tron", regex: /(?<![A-Za-z0-9])T[1-9A-HJ-NP-Za-km-z]{33}(?![A-Za-z0-9])/g },
  // Bitcoin Legacy / P2SH (require mix of digits & letters to avoid English words)
  { chain: "bitcoin", regex: /(?<![A-Za-z0-9])[13][1-9A-HJ-NP-Za-km-z]{25,34}(?![A-Za-z0-9])/g },
  // XRP r...
  { chain: "xrp", regex: /(?<![A-Za-z0-9])r[1-9A-HJ-NP-Za-km-z]{24,34}(?![A-Za-z0-9])/g },
  // Monero 4... / 8...
  { chain: "monero", regex: /(?<![A-Za-z0-9])[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}(?![A-Za-z0-9])/g },
  // Zcash t1 / t3 / zs1
  { chain: "zcash", regex: /(?<![A-Za-z0-9])(?:t1|t3)[1-9A-HJ-NP-Za-km-z]{33}(?![A-Za-z0-9])/g },
  // Dash X...
  { chain: "dash", regex: /(?<![A-Za-z0-9])X[1-9A-HJ-NP-Za-km-z]{33}(?![A-Za-z0-9])/g },
];

function looksLikeRealBase58Address(candidate: string): boolean {
  // Real Base58 addresses have mixed case and digits; reject all-alpha words or pure numbers
  const hasDigit = /\d/.test(candidate);
  const hasUpper = /[A-Z]/.test(candidate);
  const hasLower = /[a-z]/.test(candidate);
  return hasDigit && (hasUpper || hasLower);
}

export async function scrapePublicEndpoint(rawUrl: string): Promise<ScrapeResult> {
  const validation = validatePublicScrapeUrl(rawUrl);
  if (!validation.valid || !validation.url) {
    throw new Error(validation.error || "Invalid URL");
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  let httpStatus = 0;
  let contentType = "text/plain";
  let text = "";

  try {
    const res = await serverFetch(validation.url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "FBMIE-Intel-Scraper/1.0 (+https://github.com/sarakmacbook/fbmie)",
        Accept: "application/json, text/csv, text/plain, text/html, */*;q=0.8",
      },
      cache: "no-store",
    });

    // Re-validate final URL after redirects against SSRF
    if (res.url) {
      const postRedirectCheck = validatePublicScrapeUrl(res.url);
      if (!postRedirectCheck.valid) {
        throw new Error(`Redirect target blocked: ${postRedirectCheck.error}`);
      }
    }

    httpStatus = res.status;
    contentType = res.headers.get("content-type") || "text/plain";
    if (!res.ok) {
      throw new Error(`Upstream endpoint returned HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      text = await res.text();
    } else {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) {
            chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - MAX_BYTES))));
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
      const merged = new Uint8Array(Math.min(total, MAX_BYTES));
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    }
  } finally {
    clearTimeout(timer);
  }

  // Strip HTML tags cleanly if response is HTML while preserving line breaks
  const cleanText = contentType.includes("html")
    ? text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    : text;

  const seen = new Map<string, { address: string; chain: ChainId; format: string; context?: string }>();

  for (const { chain, regex } of ADDRESS_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleanText)) !== null) {
      const rawAddr = match[0];
      if (chain !== "ethereum" && !rawAddr.toLowerCase().startsWith("bc1") && !rawAddr.toLowerCase().startsWith("ltc1")) {
        if (!looksLikeRealBase58Address(rawAddr)) continue;
      }
      const norm = normalizeForLookup(rawAddr);
      if (seen.has(norm)) continue;

      const det = detectAddress(rawAddr, chain);
      if (!det.valid) continue;

      // Capture compact line/snippet context around the address
      const start = Math.max(0, match.index - 45);
      const end = Math.min(cleanText.length, match.index + rawAddr.length + 45);
      const snippet = cleanText
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();

      seen.set(norm, {
        address: rawAddr,
        chain: det.primaryChain,
        format: det.format,
        context: snippet.length > 10 ? snippet : undefined,
      });

      if (seen.size >= 500) break; // Cap response size cleanly
    }
    if (seen.size >= 500) break;
  }

  const byChain: Record<string, number> = {};
  let flaggedCount = 0;

  const extracted = Array.from(seen.values()).map((item) => {
    byChain[item.chain] = (byChain[item.chain] || 0) + 1;
    const hits = lookupLocalIntel(item.address)
      .filter((h) => h.category !== "benign" && h.category !== "exchange" && h.category !== "bridge")
      .map((h) => ({
        category: h.category,
        severity: h.severity,
        label: h.label,
        source: h.source,
        jurisdiction: h.jurisdiction,
      }));
    if (hits.length > 0) flaggedCount++;
    return {
      ...item,
      intelHits: hits,
    };
  });

  // Sort flagged addresses to the top so high-risk matches are immediately visible
  extracted.sort((a, b) => b.intelHits.length - a.intelHits.length);

  return {
    url: validation.url.toString(),
    fetchedAt: new Date().toISOString(),
    httpStatus,
    contentType,
    bytesRead: Buffer.byteLength(text, "utf8"),
    durationMs: Date.now() - started,
    totalExtracted: extracted.length,
    byChain,
    flaggedCount,
    extracted,
  };
}
