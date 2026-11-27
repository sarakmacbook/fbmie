import { NextRequest, NextResponse } from "next/server";
import { runWithProxyConfig, serverFetch } from "@/lib/http-client";
import { getIntelStats } from "@/lib/intel-index";
import { readProxyConfigFromRequest } from "@/lib/proxy-config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface PublicFeedDefinition {
  id: string;
  name: string;
  provider: string;
  category: "sanctions" | "ransomware" | "mixers_darknet" | "threat_api" | "blockchain_explorer";
  authRequired: false;
  chains: string[];
  description: string;
  endpoint: string;
  probeUrl?: string;
}

const FEED_CATALOG: PublicFeedDefinition[] = [
  {
    id: "ofac_sdn_0xb10c",
    name: "US Treasury OFAC SDN Crypto Extract",
    provider: "US Treasury / 0xB10C Daily GitHub Lists",
    category: "sanctions",
    authRequired: false,
    chains: ["BTC", "ETH", "TRX", "USDT", "USDC", "BSC", "ARB", "SOL", "LTC", "XMR", "ZEC", "DASH", "XRP"],
    description: "Daily automated extraction of every digital currency address listed on the US Treasury OFAC SDN XML.",
    endpoint: "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.json",
    probeUrl: "https://api.github.com/repos/0xB10C/ofac-sanctioned-digital-currency-addresses",
  },
  {
    id: "chainalysis_oracle",
    name: "Chainalysis On-Chain Sanctions Oracle (US / EU / UN)",
    provider: "Chainalysis Smart Contract via PublicNode RPC",
    category: "sanctions",
    authRequired: false,
    chains: ["ETH", "ARB", "OP", "POL", "BSC", "AVAX"],
    description: "Live eth_call against 0x40C57923924B5c5c5455c48D93317139ADDaC8fb aggregating US OFAC, EU, and UN designations.",
    endpoint: "https://ethereum-rpc.publicnode.com",
    probeUrl: "https://ethereum-rpc.publicnode.com",
  },
  {
    id: "opensanctions_global",
    name: "OpenSanctions (EU FSF, UN SC, UK FCDO, NBCTF, FBI Lazarus)",
    provider: "OpenSanctions Public Bulk Exports",
    category: "sanctions",
    authRequired: false,
    chains: ["BTC", "ETH", "TRX", "BSC", "POL"],
    description: "Multi-jurisdiction public sanctions & criminal crypto wallet datasets (EU FSF, UNSCR 1718, UK FCDO, Israel NBCTF, FBI Lazarus).",
    endpoint: "https://data.opensanctions.org/datasets/latest/us_fbi_lazarus_crypto/targets.simple.csv",
    probeUrl: "https://data.opensanctions.org/datasets/latest/us_fbi_lazarus_crypto/index.json",
  },
  {
    id: "ransomware_feeds",
    name: "Ransomwhere + Conti + LockBit + WannaCry Tracker",
    provider: "OpenSanctions Ransomwhere / cablej / LockBit Tracker",
    category: "ransomware",
    authRequired: false,
    chains: ["BTC", "ETH"],
    description: "Crowdsourced & leaked ransomware extortion wallets covering 130+ families (WannaCry, Conti, LockBit, DarkSide, SamSam, REvil, Locky).",
    endpoint: "https://data.opensanctions.org/datasets/latest/ransomwhere/targets.simple.csv",
    probeUrl: "https://api.github.com/repos/cablej/conti-payments",
  },
  {
    id: "goplus_address_security",
    name: "GoPlus Address Security API",
    provider: "GoPlus Labs Public API",
    category: "threat_api",
    authRequired: false,
    chains: ["ETH", "BSC", "POL", "ARB", "OP", "BASE", "AVAX", "TRX", "SOL"],
    description: "Real-time 16-flag threat API detecting sanctions, money laundering, mixers, darkweb transactions, blackmail/ransomware, cybercrime & phishing.",
    endpoint: "https://api.gopluslabs.io/api/v1/address_security/{address}?chain_id=1",
    probeUrl: "https://api.gopluslabs.io/api/v1/address_security/0xd8da6bf26964af9d7eed9e03e53415d37aa96045?chain_id=1",
  },
  {
    id: "mixers_darknet_labels",
    name: "Mixers, Darknet, MEW Darklist & ScamSniffer Feeds",
    provider: "Etherscan Labels / MyEtherWallet / ScamSniffer",
    category: "mixers_darknet",
    authRequired: false,
    chains: ["ETH", "BTC", "TRX"],
    description: "Tornado Cash pools, Railgun, Sinbad, Blender, Hydra, Garantex, Suex, Chatex, MEW darklist & 2,500+ ScamSniffer drainers.",
    endpoint: "https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json",
    probeUrl: "https://api.github.com/repos/scamsniffer/scam-database",
  },
  {
    id: "mempool_blockscout_tron_sol",
    name: "Free On-Chain Explorers (Mempool, Blockscout, TronScan, Solana, XRPScan)",
    provider: "Zero-Key Public Blockchain APIs",
    category: "blockchain_explorer",
    authRequired: false,
    chains: ["BTC", "LTC", "ETH", "BASE", "ARB", "OP", "POL", "TRX", "SOL", "XRP"],
    description: "Live balance, transaction graph, 1-hop counterparty taint & laundering heuristic telemetry without any API key.",
    endpoint: "https://mempool.space/api/blocks/tip/height",
    probeUrl: "https://mempool.space/api/blocks/tip/height",
  },
];

async function probeUrl(url: string): Promise<{ reachable: boolean; latencyMs: number; status: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await serverFetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "FBMIE-Feed-Monitor/1.0" },
      cache: "no-store",
    });
    return { reachable: res.ok, latencyMs: Date.now() - start, status: res.status };
  } catch {
    return { reachable: false, latencyMs: Date.now() - start, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const doProbe = searchParams.get("probe") === "true" || searchParams.get("probe") === "1";
  const stats = getIntelStats();
  const proxyCfg = readProxyConfigFromRequest(req);

  const feeds = await runWithProxyConfig(proxyCfg, () =>
    Promise.all(
      FEED_CATALOG.map(async (f) => {
        if (!doProbe || !f.probeUrl) {
          return { ...f, liveStatus: "ready" as const, latencyMs: null as number | null };
        }
        const p = await probeUrl(f.probeUrl);
        return {
          ...f,
          liveStatus: p.reachable ? ("online" as const) : ("degraded" as const),
          latencyMs: p.latencyMs,
          httpStatus: p.status,
        };
      })
    )
  );

  return NextResponse.json({
    stats,
    feeds,
    checkedAt: new Date().toISOString(),
  });
}
