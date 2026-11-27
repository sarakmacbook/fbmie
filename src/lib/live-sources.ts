import { CHAIN_META, CHAINALYSIS_ORACLE_EVM, normalizeForLookup } from "./chains";
import { ChainActivitySnapshot, ChainId, NormalizedTx, SourceAuditEntry } from "./types";

const DEFAULT_TIMEOUT_MS = 4500;

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: T | null; latencyMs: number; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "FBMIE-Compliance-Screener/1.0",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, data: null, latencyMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; text: string | null; latencyMs: number; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "FBMIE-Compliance-Screener/1.0" },
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, text: null, latencyMs, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    return { ok: true, status: res.status, text, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, text: null, latencyMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// =========================================================================
// 1. LIVE 0xB10C OFAC SDN GITHUB FEED (15-min warm cache)
// =========================================================================
interface CachedSet {
  fetchedAt: number;
  set: Set<string>;
}
const ofacLiveCache = new Map<string, CachedSet>();
const OFAC_CACHE_TTL_MS = 15 * 60 * 1000;

const CHAIN_TO_OFAC_TICKERS: Partial<Record<ChainId, string[]>> = {
  bitcoin: ["XBT", "USDT"],
  ethereum: ["ETH", "USDT", "USDC"],
  bsc: ["BSC", "ETH", "USDT"],
  arbitrum: ["ARB", "ETH", "USDC"],
  polygon: ["ETH", "USDT", "USDC"],
  optimism: ["ETH", "USDC"],
  base: ["ETH", "USDC"],
  avalanche: ["ETH", "USDC"],
  tron: ["TRX", "USDT"],
  solana: ["SOL", "USDC"],
  litecoin: ["LTC"],
  xrp: ["XRP"],
  monero: ["XMR"],
  zcash: ["ZEC"],
  dash: ["DASH"],
  bitcoincash: ["BCH"],
  etc: ["ETC"],
  bsv: ["BSV"],
  btg: ["BTG"],
  verge: ["XVG"],
};

export async function checkLiveOfacGithub(
  address: string,
  chain: ChainId
): Promise<{ matched: boolean; ticker?: string; audit: SourceAuditEntry }> {
  const tickers = CHAIN_TO_OFAC_TICKERS[chain] ?? ["ETH", "XBT"];
  const primaryTicker = tickers[0];
  const norm = normalizeForLookup(address);
  const now = Date.now();
  const cached = ofacLiveCache.get(primaryTicker);

  if (cached && now - cached.fetchedAt < OFAC_CACHE_TTL_MS) {
    const matched = cached.set.has(norm);
    return {
      matched,
      ticker: matched ? primaryTicker : undefined,
      audit: {
        id: "ofac_github_live",
        name: `US OFAC SDN Live Feed (${primaryTicker})`,
        category: "sanctions",
        status: "cached",
        latencyMs: 0,
        matchesFound: matched ? 1 : 0,
        detail: `Checked ${cached.set.size} live OFAC ${primaryTicker} addresses from warm cache`,
        url: `https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_${primaryTicker}.json`,
      },
    };
  }

  const url = `https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_${primaryTicker}.json`;
  const res = await fetchJsonWithTimeout<string[]>(url, {}, 4000);
  if (res.ok && Array.isArray(res.data)) {
    const set = new Set(res.data.map((a) => normalizeForLookup(a)));
    ofacLiveCache.set(primaryTicker, { fetchedAt: now, set });
    const matched = set.has(norm);
    return {
      matched,
      ticker: matched ? primaryTicker : undefined,
      audit: {
        id: "ofac_github_live",
        name: `US OFAC SDN Live Feed (${primaryTicker})`,
        category: "sanctions",
        status: "live",
        latencyMs: res.latencyMs,
        matchesFound: matched ? 1 : 0,
        detail: `Synced ${set.size} daily OFAC ${primaryTicker} designations from US Treasury SDN extract`,
        url,
      },
    };
  }

  return {
    matched: false,
    audit: {
      id: "ofac_github_live",
      name: `US OFAC SDN Live Feed (${primaryTicker})`,
      category: "sanctions",
      status: "unavailable",
      latencyMs: res.latencyMs,
      matchesFound: 0,
      detail: `Live fetch unavailable (${res.error || "network"}); covered by bundled OFAC snapshot`,
      url,
    },
  };
}

// =========================================================================
// 2. LIVE OPENSANCTIONS PUBLIC DATASETS (RANSOMWHERE + NBCTF + FBI LAZARUS)
// =========================================================================
interface OpenSanctionsCacheEntry {
  fetchedAt: number;
  entries: Map<string, { label: string; dataset: string }>;
}
const openSanctionsCache = new Map<string, OpenSanctionsCacheEntry>();
const OPENSANCTIONS_TTL_MS = 30 * 60 * 1000;

async function queryOpenSanctionsDataset(
  dataset: "ransomwhere" | "il_mod_crypto" | "us_fbi_lazarus_crypto",
  displayName: string,
  address: string
): Promise<{ hit: { label: string; dataset: string } | null; audit: SourceAuditEntry }> {
  const norm = normalizeForLookup(address);
  const url = `https://data.opensanctions.org/datasets/latest/${dataset}/targets.simple.csv`;
  const cached = openSanctionsCache.get(dataset);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < OPENSANCTIONS_TTL_MS) {
    const hit = cached.entries.get(norm) ?? null;
    return {
      hit,
      audit: {
        id: `opensanctions_${dataset}`,
        name: displayName,
        category: dataset === "ransomwhere" ? "threat_intel" : "sanctions",
        status: "cached",
        latencyMs: 0,
        matchesFound: hit ? 1 : 0,
        detail: `Checked ${cached.entries.size.toLocaleString()} live OpenSanctions entries (cached)`,
        url: `https://www.opensanctions.org/datasets/${dataset}/`,
      },
    };
  }

  // Only attempt full download on datasets up to ~3.5MB with fast timeout
  const res = await fetchTextWithTimeout(url, 4500);
  if (res.ok && res.text) {
    const map = new Map<string, { label: string; dataset: string }>();
    const lines = res.text.split(/\r?\n/);
    // Simple CSV: id,schema,name,aliases,birth_date,countries,addresses,identifiers,sanctions,phones,emails,program_ids,dataset,first_seen,last_seen,last_change
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.includes("CryptoWallet")) continue;
      // Extract quoted or unquoted fields conservatively
      const parts = line.split(",");
      const addrCandidate = (parts[2] || "").replace(/^"|"$/g, "").trim();
      const aliases = (parts[3] || "").replace(/^"|"$/g, "").trim();
      if (addrCandidate.length >= 24) {
        map.set(normalizeForLookup(addrCandidate), {
          label: aliases || displayName,
          dataset,
        });
      }
    }
    openSanctionsCache.set(dataset, { fetchedAt: now, entries: map });
    const hit = map.get(norm) ?? null;
    return {
      hit,
      audit: {
        id: `opensanctions_${dataset}`,
        name: displayName,
        category: dataset === "ransomwhere" ? "threat_intel" : "sanctions",
        status: "live",
        latencyMs: res.latencyMs,
        matchesFound: hit ? 1 : 0,
        detail: `Ingested ${map.size.toLocaleString()} live wallet records from OpenSanctions`,
        url: `https://www.opensanctions.org/datasets/${dataset}/`,
      },
    };
  }

  return {
    hit: null,
    audit: {
      id: `opensanctions_${dataset}`,
      name: displayName,
      category: dataset === "ransomwhere" ? "threat_intel" : "sanctions",
      status: "unavailable",
      latencyMs: res.latencyMs,
      matchesFound: 0,
      detail: `Live OpenSanctions CSV unreachable (${res.error || "timeout"}); covered by bundled registry`,
      url: `https://www.opensanctions.org/datasets/${dataset}/`,
    },
  };
}

export async function checkOpenSanctionsLive(address: string, chain: ChainId) {
  const tasks: Array<ReturnType<typeof queryOpenSanctionsDataset>> = [
    queryOpenSanctionsDataset("us_fbi_lazarus_crypto", "OpenSanctions · FBI Lazarus Crypto", address),
    queryOpenSanctionsDataset("il_mod_crypto", "OpenSanctions · NBCTF Sanctions", address),
  ];
  if (chain === "bitcoin") {
    tasks.push(queryOpenSanctionsDataset("ransomwhere", "OpenSanctions · Ransomwhere (11k+ BTC)", address));
  }
  return Promise.all(tasks);
}

// =========================================================================
// 3. CHAINALYSIS ON-CHAIN SANCTIONS ORACLE (US OFAC + EU + UN) — ZERO KEY!
// =========================================================================
// Function selector for isSanctioned(address): keccak256("isSanctioned(address)")[:4] = 0xdf592f7d
export async function checkChainalysisOracle(
  address: string,
  chain: ChainId
): Promise<{ sanctioned: boolean | null; latencyMs: number; error?: string }> {
  const meta = CHAIN_META[chain];
  if (!meta.publicRpcUrl || !meta.chainalysisOracleAddress || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { sanctioned: null, latencyMs: 0, error: "Not deployed on chain" };
  }

  const paddedAddr = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = `0xdf592f7d${paddedAddr}`;

  const res = await fetchJsonWithTimeout<{ result?: string; error?: { message: string } }>(
    meta.publicRpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: CHAINALYSIS_ORACLE_EVM, data }, "latest"],
      }),
    },
    3800
  );

  if (!res.ok || !res.data || typeof res.data.result !== "string") {
    return { sanctioned: null, latencyMs: res.latencyMs, error: res.error || res.data?.error?.message };
  }

  const hex = res.data.result.replace(/^0x/, "");
  if (!hex) return { sanctioned: null, latencyMs: res.latencyMs, error: "Empty call response" };
  const isSanctioned = BigInt(`0x${hex}`) === 1n;
  return { sanctioned: isSanctioned, latencyMs: res.latencyMs };
}

// =========================================================================
// 4. GOPLUS ADDRESS SECURITY API (FREE, ZERO KEY — EVM + TRON + SOLANA)
// =========================================================================
export interface GoPlusSecurityResult {
  available: boolean;
  latencyMs: number;
  chainId: string;
  flags: Record<string, string>;
  activeFlags: string[];
  dataSource: string;
  error?: string;
}

const GOPLUS_FLAG_KEYS = [
  "sanctioned",
  "money_laundering",
  "mixer",
  "darkweb_transactions",
  "cybercrime",
  "blackmail_activities",
  "stealing_attack",
  "phishing_activities",
  "financial_crime",
  "honeypot_related_address",
  "malicious_mining_activities",
  "blacklist_doubt",
  "fake_kyc",
  "fake_token",
  "fake_standard_interface",
  "gas_abuse",
] as const;

export async function checkGoPlusSecurity(
  address: string,
  chain: ChainId
): Promise<GoPlusSecurityResult> {
  const goplusChain = CHAIN_META[chain]?.goplusChainId;
  if (!goplusChain) {
    return {
      available: false,
      latencyMs: 0,
      chainId: "",
      flags: {},
      activeFlags: [],
      dataSource: "",
      error: "Chain not supported by GoPlus",
    };
  }

  const url = `https://api.gopluslabs.io/api/v1/address_security/${encodeURIComponent(address)}?chain_id=${encodeURIComponent(goplusChain)}`;
  const res = await fetchJsonWithTimeout<{ code?: number; message?: string; result?: Record<string, string> }>(
    url,
    {},
    4200
  );

  if (!res.ok || !res.data || res.data.code !== 1 || !res.data.result) {
    return {
      available: false,
      latencyMs: res.latencyMs,
      chainId: goplusChain,
      flags: {},
      activeFlags: [],
      dataSource: "",
      error: res.error || res.data?.message || "Unavailable",
    };
  }

  const result = res.data.result;
  const activeFlags: string[] = [];
  for (const key of GOPLUS_FLAG_KEYS) {
    if (result[key] === "1") {
      activeFlags.push(key);
    }
  }
  const malContracts = Number(result.number_of_malicious_contracts_created || "0");
  if (malContracts > 0) {
    activeFlags.push(`malicious_contracts_created:${malContracts}`);
  }

  return {
    available: true,
    latencyMs: res.latencyMs,
    chainId: goplusChain,
    flags: result,
    activeFlags,
    dataSource: result.data_source || "GoPlus Labs",
  };
}

// =========================================================================
// 5. BITCOIN / LITECOIN TELEMETRY (MEMPOOL.SPACE / BLOCKSTREAM / LITECOINSPACE)
// =========================================================================
interface EsploraAddressResp {
  address: string;
  chain_stats?: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats?: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

interface EsploraTx {
  txid: string;
  status?: { confirmed?: boolean; block_time?: number };
  vin?: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
}

export async function fetchUtxoTelemetry(
  address: string,
  chain: "bitcoin" | "litecoin",
  deepScan: boolean
): Promise<{
  snapshot: ChainActivitySnapshot;
  transactions: NormalizedTx[];
  audit: SourceAuditEntry;
}> {
  const meta = CHAIN_META[chain];
  const baseUrls =
    chain === "bitcoin"
      ? ["https://mempool.space/api", "https://blockstream.info/api"]
      : ["https://litecoinspace.org/api"];

  let usedBase = baseUrls[0];
  let addrRes = await fetchJsonWithTimeout<EsploraAddressResp>(`${usedBase}/address/${address}`, {}, 4500);
  if (!addrRes.ok && baseUrls.length > 1) {
    usedBase = baseUrls[1];
    addrRes = await fetchJsonWithTimeout<EsploraAddressResp>(`${usedBase}/address/${address}`, {}, 4500);
  }

  if (!addrRes.ok || !addrRes.data) {
    return {
      snapshot: {
        chain,
        chainName: meta.name,
        symbol: meta.symbol,
        active: false,
        balanceNative: null,
        totalReceivedNative: null,
        totalSentNative: null,
        txCount: null,
        explorerUrl: meta.explorerAddressUrl(address),
        telemetryStatus: "unavailable",
      },
      transactions: [],
      audit: {
        id: `explorer_${chain}`,
        name: chain === "bitcoin" ? "Mempool.space / Blockstream BTC API" : "Litecoinspace LTC API",
        category: "explorer",
        status: "unavailable",
        latencyMs: addrRes.latencyMs,
        matchesFound: 0,
        detail: `Explorer unreachable (${addrRes.error || "network"})`,
        url: `${usedBase}/address/${address}`,
      },
    };
  }

  const cs = addrRes.data.chain_stats;
  const ms = addrRes.data.mempool_stats;
  const fundedSats = (cs?.funded_txo_sum ?? 0) + (ms?.funded_txo_sum ?? 0);
  const spentSats = (cs?.spent_txo_sum ?? 0) + (ms?.spent_txo_sum ?? 0);
  const txCount = (cs?.tx_count ?? 0) + (ms?.tx_count ?? 0);
  const balanceBtc = (fundedSats - spentSats) / 1e8;

  const transactions: NormalizedTx[] = [];
  let firstSeen: number | null = null;
  let lastSeen: number | null = null;
  let totalLatency = addrRes.latencyMs;

  if (deepScan && txCount > 0) {
    const txsRes = await fetchJsonWithTimeout<EsploraTx[]>(`${usedBase}/address/${address}/txs`, {}, 4500);
    totalLatency += txsRes.latencyMs;
    if (txsRes.ok && Array.isArray(txsRes.data)) {
      const targetNorm = normalizeForLookup(address);
      for (const tx of txsRes.data.slice(0, 25)) {
        const ts = tx.status?.block_time ?? Math.floor(Date.now() / 1000);
        if (!firstSeen || ts < firstSeen) firstSeen = ts;
        if (!lastSeen || ts > lastSeen) lastSeen = ts;

        const vinAddrs = (tx.vin || [])
          .map((v) => v.prevout?.scriptpubkey_address)
          .filter((a): a is string => Boolean(a));
        const vouts = tx.vout || [];

        const isSender = vinAddrs.some((a) => normalizeForLookup(a) === targetNorm);
        const receivedSats = vouts
          .filter((o) => o.scriptpubkey_address && normalizeForLookup(o.scriptpubkey_address) === targetNorm)
          .reduce((acc, o) => acc + (o.value || 0), 0);
        const sentSatsTx = (tx.vin || [])
          .filter((v) => v.prevout?.scriptpubkey_address && normalizeForLookup(v.prevout.scriptpubkey_address) === targetNorm)
          .reduce((acc, v) => acc + (v.prevout?.value || 0), 0);

        // Detect CoinJoin-style equal-value outputs (>= 3 outputs sharing identical value)
        const valCounts = new Map<number, number>();
        for (const o of vouts) {
          if (o.value && o.value > 5000) {
            valCounts.set(o.value, (valCounts.get(o.value) || 0) + 1);
          }
        }
        const equalOutputs = Array.from(valCounts.values()).some((c) => c >= 3);

        let direction: "in" | "out" | "self" = "in";
        let counterparty = "Unknown / Multi-Input";
        let valueSats = receivedSats;

        if (isSender) {
          const externalOuts = vouts.filter(
            (o) => o.scriptpubkey_address && normalizeForLookup(o.scriptpubkey_address) !== targetNorm
          );
          if (externalOuts.length === 0) {
            direction = "self";
            counterparty = address;
            valueSats = receivedSats;
          } else {
            direction = "out";
            // Pick largest external recipient
            const topOut = externalOuts.sort((a, b) => (b.value || 0) - (a.value || 0))[0];
            counterparty = topOut.scriptpubkey_address || "OP_RETURN";
            valueSats = Math.max(sentSatsTx - receivedSats, topOut.value || 0);
          }
        } else {
          const externalIn = vinAddrs.find((a) => normalizeForLookup(a) !== targetNorm);
          counterparty = externalIn || "Coinbase / SegWit";
        }

        transactions.push({
          hash: tx.txid,
          chain,
          timestamp: ts,
          direction,
          counterparty,
          valueNative: Number((valueSats / 1e8).toFixed(8)),
          symbol: meta.symbol,
          inputCount: tx.vin?.length ?? 0,
          outputCount: vouts.length,
          equalOutputs,
          explorerUrl: meta.explorerTxUrl(tx.txid),
        });
      }
    }
  }

  return {
    snapshot: {
      chain,
      chainName: meta.name,
      symbol: meta.symbol,
      active: txCount > 0 || balanceBtc > 0,
      balanceNative: Number(balanceBtc.toFixed(8)),
      totalReceivedNative: Number((fundedSats / 1e8).toFixed(8)),
      totalSentNative: Number((spentSats / 1e8).toFixed(8)),
      txCount,
      firstSeen,
      lastSeen,
      explorerUrl: meta.explorerAddressUrl(address),
      telemetryStatus: "live",
    },
    transactions,
    audit: {
      id: `explorer_${chain}`,
      name: usedBase.includes("mempool")
        ? "Mempool.space Bitcoin API"
        : usedBase.includes("blockstream")
          ? "Blockstream Esplora API"
          : "Litecoinspace API",
      category: "explorer",
      status: "live",
      latencyMs: totalLatency,
      matchesFound: transactions.length,
      detail: `${txCount.toLocaleString()} lifetime txs · ${transactions.length} recent txs analyzed`,
      url: `${usedBase}/address/${address}`,
    },
  };
}

// =========================================================================
// 6. EVM MULTI-CHAIN TELEMETRY (PUBLICNODE RPC + BLOCKSCOUT V2)
// =========================================================================
interface BlockscoutAddressResp {
  coin_balance?: string | null;
  is_contract?: boolean;
  name?: string | null;
}

interface BlockscoutTxItem {
  hash: string;
  timestamp?: string;
  from?: { hash?: string; name?: string | null };
  to?: { hash?: string; name?: string | null } | null;
  value?: string;
}

export async function fetchEvmChainTelemetry(
  address: string,
  chain: ChainId,
  fetchTxs: boolean
): Promise<{
  snapshot: ChainActivitySnapshot;
  transactions: NormalizedTx[];
  oracleAudit?: SourceAuditEntry;
  explorerAudit?: SourceAuditEntry;
}> {
  const meta = CHAIN_META[chain];
  const rpcUrl = meta.publicRpcUrl;

  // Run RPC balance/nonce/code + Chainalysis Oracle in parallel
  const [rpcBatch, oracleRes] = await Promise.all([
    rpcUrl
      ? fetchJsonWithTimeout<Array<{ id: number; result?: string }>>(
          rpcUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] },
              { jsonrpc: "2.0", id: 2, method: "eth_getTransactionCount", params: [address, "latest"] },
              { jsonrpc: "2.0", id: 3, method: "eth_getCode", params: [address, "latest"] },
            ]),
          },
          3800
        )
      : Promise.resolve({ ok: false, status: 0, data: null, latencyMs: 0, error: "No RPC" }),
    meta.chainalysisOracleAddress
      ? checkChainalysisOracle(address, chain)
      : Promise.resolve<{ sanctioned: boolean | null; latencyMs: number; error?: string }>({
          sanctioned: null,
          latencyMs: 0,
        }),
  ]);

  let balanceNative: number | null = null;
  let txCount: number | null = null;
  let isContract = false;
  let telemetryStatus: "live" | "partial" | "unavailable" = "unavailable";

  if (rpcBatch.ok && Array.isArray(rpcBatch.data)) {
    const balHex = rpcBatch.data.find((r) => r.id === 1)?.result;
    const nonceHex = rpcBatch.data.find((r) => r.id === 2)?.result;
    const codeHex = rpcBatch.data.find((r) => r.id === 3)?.result;
    if (balHex && balHex.startsWith("0x")) {
      balanceNative = Number(BigInt(balHex)) / 1e18;
      telemetryStatus = "live";
    }
    if (nonceHex && nonceHex.startsWith("0x")) {
      txCount = Number(BigInt(nonceHex));
    }
    if (codeHex && codeHex !== "0x" && codeHex.length > 2) {
      isContract = true;
    }
  }

  const transactions: NormalizedTx[] = [];
  let firstSeen: number | null = null;
  let lastSeen: number | null = null;
  let totalReceived = 0;
  let totalSent = 0;
  let explorerAudit: SourceAuditEntry | undefined;

  if (fetchTxs && meta.blockscoutBaseUrl) {
    const txsUrl = `${meta.blockscoutBaseUrl}/addresses/${address}/transactions`;
    const [addrBs, txsBs] = await Promise.all([
      balanceNative === null
        ? fetchJsonWithTimeout<BlockscoutAddressResp>(`${meta.blockscoutBaseUrl}/addresses/${address}`, {}, 4000)
        : Promise.resolve({ ok: false, status: 0, data: null, latencyMs: 0 }),
      fetchJsonWithTimeout<{ items?: BlockscoutTxItem[] }>(txsUrl, {}, 4500),
    ]);

    if (addrBs.ok && addrBs.data?.coin_balance) {
      balanceNative = Number(BigInt(addrBs.data.coin_balance)) / 1e18;
      isContract = Boolean(addrBs.data.is_contract);
      telemetryStatus = "live";
    }

    if (txsBs.ok && Array.isArray(txsBs.data?.items)) {
      const targetNorm = address.toLowerCase();
      for (const item of txsBs.data.items.slice(0, 30)) {
        const ts = item.timestamp ? Math.floor(new Date(item.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);
        if (!firstSeen || ts < firstSeen) firstSeen = ts;
        if (!lastSeen || ts > lastSeen) lastSeen = ts;
        const from = (item.from?.hash || "").toLowerCase();
        const to = (item.to?.hash || "").toLowerCase();
        const val = item.value ? Number(BigInt(item.value)) / 1e18 : 0;

        let direction: "in" | "out" | "self" = "in";
        let counterparty = from || "Contract Creation";
        let counterpartyLabel = item.from?.name || undefined;

        if (from === targetNorm && to === targetNorm) {
          direction = "self";
          counterparty = address;
        } else if (from === targetNorm) {
          direction = "out";
          counterparty = to || "Contract Deployment";
          counterpartyLabel = item.to?.name || undefined;
          totalSent += val;
        } else {
          direction = "in";
          counterparty = from || "Unknown";
          totalReceived += val;
        }

        transactions.push({
          hash: item.hash,
          chain,
          timestamp: ts,
          direction,
          counterparty,
          counterpartyLabel,
          valueNative: Number(val.toFixed(6)),
          symbol: meta.symbol,
          explorerUrl: meta.explorerTxUrl(item.hash),
        });
      }
      if (txCount === null || txCount < transactions.length) {
        txCount = Math.max(txCount ?? 0, transactions.length);
      }
      telemetryStatus = "live";
      explorerAudit = {
        id: `blockscout_${chain}`,
        name: `Blockscout v2 (${meta.name})`,
        category: "explorer",
        status: "live",
        latencyMs: txsBs.latencyMs,
        matchesFound: transactions.length,
        detail: `Fetched ${transactions.length} recent ${meta.name} transactions for flow & laundering scan`,
        url: txsUrl,
      };
    } else {
      explorerAudit = {
        id: `blockscout_${chain}`,
        name: `Blockscout v2 (${meta.name})`,
        category: "explorer",
        status: "unavailable",
        latencyMs: txsBs.latencyMs,
        matchesFound: 0,
        detail: `Transaction history unavailable (${txsBs.error || "network"})`,
        url: txsUrl,
      };
    }
  }

  const oracleAudit: SourceAuditEntry | undefined = meta.chainalysisOracleAddress
    ? {
        id: `chainalysis_oracle_${chain}`,
        name: `Chainalysis On-Chain Sanctions Oracle (${meta.name})`,
        category: "oracle",
        status: oracleRes.sanctioned !== null ? "live" : "unavailable",
        latencyMs: oracleRes.latencyMs,
        matchesFound: oracleRes.sanctioned ? 1 : 0,
        detail:
          oracleRes.sanctioned === true
            ? `SANCTIONED (US/EU/UN Oracle returned true on ${meta.name})`
            : oracleRes.sanctioned === false
              ? `Clear on Chainalysis US/EU/UN on-chain oracle (${CHAINALYSIS_ORACLE_EVM.slice(0, 10)}…)`
              : `RPC unreachable (${oracleRes.error || "network"})`,
        url: meta.explorerAddressUrl(CHAINALYSIS_ORACLE_EVM),
      }
    : undefined;

  return {
    snapshot: {
      chain,
      chainName: meta.name,
      symbol: meta.symbol,
      active: Boolean((balanceNative && balanceNative > 0) || (txCount && txCount > 0) || transactions.length > 0 || isContract),
      balanceNative: balanceNative !== null ? Number(balanceNative.toFixed(6)) : null,
      totalReceivedNative: totalReceived > 0 ? Number(totalReceived.toFixed(6)) : null,
      totalSentNative: totalSent > 0 ? Number(totalSent.toFixed(6)) : null,
      txCount,
      firstSeen,
      lastSeen,
      isContract,
      chainalysisOracleSanctioned: oracleRes.sanctioned,
      explorerUrl: meta.explorerAddressUrl(address),
      telemetryStatus,
    },
    transactions,
    oracleAudit,
    explorerAudit,
  };
}

// =========================================================================
// 7. TRON LIVE TELEMETRY (TRONSCAN PUBLIC API — TRX + USDT TRC-20)
// =========================================================================
interface TronAccountResp {
  balance?: number;
  totalTransactionCount?: number;
  date_created?: number;
  latest_operation_time?: number;
  accountType?: number;
}

interface TronTrc20Resp {
  token_transfers?: Array<{
    transaction_id: string;
    block_ts: number;
    from_address: string;
    to_address: string;
    quant: string;
    tokenInfo?: { tokenAbbr?: string; tokenDecimal?: number };
  }>;
}

export async function fetchTronTelemetry(
  address: string,
  deepScan: boolean
): Promise<{ snapshot: ChainActivitySnapshot; transactions: NormalizedTx[]; audit: SourceAuditEntry }> {
  const meta = CHAIN_META.tron;
  const acctUrl = `https://apilist.tronscanapi.com/api/accountv2?address=${encodeURIComponent(address)}`;
  const trc20Url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?relatedAddress=${encodeURIComponent(address)}&limit=25`;

  const [acctRes, trc20Res] = await Promise.all([
    fetchJsonWithTimeout<TronAccountResp>(acctUrl, {}, 4500),
    deepScan
      ? fetchJsonWithTimeout<TronTrc20Resp>(trc20Url, {}, 4500)
      : Promise.resolve({ ok: false, status: 0, data: null, latencyMs: 0 }),
  ]);

  if (!acctRes.ok || !acctRes.data) {
    return {
      snapshot: {
        chain: "tron",
        chainName: meta.name,
        symbol: meta.symbol,
        active: false,
        balanceNative: null,
        totalReceivedNative: null,
        totalSentNative: null,
        txCount: null,
        explorerUrl: meta.explorerAddressUrl(address),
        telemetryStatus: "unavailable",
      },
      transactions: [],
      audit: {
        id: "tronscan_api",
        name: "TronScan Public API (TRX & USDT-TRC20)",
        category: "explorer",
        status: "unavailable",
        latencyMs: acctRes.latencyMs,
        matchesFound: 0,
        detail: `TronScan unreachable (${acctRes.error || "network"})`,
        url: acctUrl,
      },
    };
  }

  const balanceTrx = (acctRes.data.balance ?? 0) / 1e6;
  const txCount = acctRes.data.totalTransactionCount ?? 0;
  const firstSeen = acctRes.data.date_created ? Math.floor(acctRes.data.date_created / 1000) : null;
  const lastSeen = acctRes.data.latest_operation_time ? Math.floor(acctRes.data.latest_operation_time / 1000) : null;

  const transactions: NormalizedTx[] = [];
  if (trc20Res.ok && Array.isArray(trc20Res.data?.token_transfers)) {
    for (const t of trc20Res.data.token_transfers.slice(0, 25)) {
      const decimals = t.tokenInfo?.tokenDecimal ?? 6;
      const amount = Number(t.quant || "0") / Math.pow(10, decimals);
      const isOut = t.from_address === address;
      transactions.push({
        hash: t.transaction_id,
        chain: "tron",
        timestamp: Math.floor((t.block_ts || Date.now()) / 1000),
        direction: t.from_address === t.to_address ? "self" : isOut ? "out" : "in",
        counterparty: isOut ? t.to_address : t.from_address,
        valueNative: Number(amount.toFixed(4)),
        symbol: t.tokenInfo?.tokenAbbr || "TRC20",
        tokenSymbol: t.tokenInfo?.tokenAbbr || "USDT",
        tokenAmount: Number(amount.toFixed(4)),
        explorerUrl: meta.explorerTxUrl(t.transaction_id),
      });
    }
  }

  return {
    snapshot: {
      chain: "tron",
      chainName: meta.name,
      symbol: meta.symbol,
      active: txCount > 0 || balanceTrx > 0 || transactions.length > 0,
      balanceNative: Number(balanceTrx.toFixed(4)),
      totalReceivedNative: null,
      totalSentNative: null,
      txCount,
      firstSeen,
      lastSeen,
      isContract: acctRes.data.accountType === 2,
      explorerUrl: meta.explorerAddressUrl(address),
      telemetryStatus: "live",
    },
    transactions,
    audit: {
      id: "tronscan_api",
      name: "TronScan Public API (TRX & USDT-TRC20)",
      category: "explorer",
      status: "live",
      latencyMs: acctRes.latencyMs + trc20Res.latencyMs,
      matchesFound: transactions.length,
      detail: `${txCount.toLocaleString()} TRX txs · ${transactions.length} TRC-20 transfers analyzed`,
      url: meta.explorerAddressUrl(address),
    },
  };
}

// =========================================================================
// 8. SOLANA PUBLIC RPC TELEMETRY
// =========================================================================
export async function fetchSolanaTelemetry(
  address: string,
  deepScan: boolean
): Promise<{ snapshot: ChainActivitySnapshot; transactions: NormalizedTx[]; audit: SourceAuditEntry }> {
  const meta = CHAIN_META.solana;
  const rpcUrl = "https://api.mainnet-beta.solana.com";

  const [balRes, sigRes] = await Promise.all([
    fetchJsonWithTimeout<{ result?: { value?: number } }>(
      rpcUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
      },
      4500
    ),
    deepScan
      ? fetchJsonWithTimeout<{ result?: Array<{ signature: string; blockTime?: number | null }> }>(
          rpcUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "getSignaturesForAddress",
              params: [address, { limit: 25 }],
            }),
          },
          4500
        )
      : Promise.resolve({ ok: false, status: 0, data: null, latencyMs: 0 }),
  ]);

  if (!balRes.ok || balRes.data?.result?.value === undefined) {
    return {
      snapshot: {
        chain: "solana",
        chainName: meta.name,
        symbol: meta.symbol,
        active: false,
        balanceNative: null,
        totalReceivedNative: null,
        totalSentNative: null,
        txCount: null,
        explorerUrl: meta.explorerAddressUrl(address),
        telemetryStatus: "unavailable",
      },
      transactions: [],
      audit: {
        id: "solana_rpc",
        name: "Solana Mainnet Public RPC",
        category: "explorer",
        status: "unavailable",
        latencyMs: balRes.latencyMs,
        matchesFound: 0,
        detail: `Solana RPC unreachable (${balRes.error || "network"})`,
        url: rpcUrl,
      },
    };
  }

  const solBalance = balRes.data.result.value / 1e9;
  const sigs = sigRes.ok && Array.isArray(sigRes.data?.result) ? sigRes.data.result : [];
  let firstSeen: number | null = null;
  let lastSeen: number | null = null;
  const transactions: NormalizedTx[] = sigs.map((s) => {
    const ts = s.blockTime || Math.floor(Date.now() / 1000);
    if (!firstSeen || ts < firstSeen) firstSeen = ts;
    if (!lastSeen || ts > lastSeen) lastSeen = ts;
    return {
      hash: s.signature,
      chain: "solana",
      timestamp: ts,
      direction: "in",
      counterparty: "Solana Program / Account",
      valueNative: 0,
      symbol: "SOL",
      explorerUrl: meta.explorerTxUrl(s.signature),
    };
  });

  return {
    snapshot: {
      chain: "solana",
      chainName: meta.name,
      symbol: meta.symbol,
      active: solBalance > 0 || sigs.length > 0,
      balanceNative: Number(solBalance.toFixed(6)),
      totalReceivedNative: null,
      totalSentNative: null,
      txCount: sigs.length,
      firstSeen,
      lastSeen,
      explorerUrl: meta.explorerAddressUrl(address),
      telemetryStatus: "live",
    },
    transactions,
    audit: {
      id: "solana_rpc",
      name: "Solana Mainnet Public RPC",
      category: "explorer",
      status: "live",
      latencyMs: balRes.latencyMs + sigRes.latencyMs,
      matchesFound: sigs.length,
      detail: `Balance ${solBalance.toFixed(4)} SOL · ${sigs.length} recent signatures fetched`,
      url: meta.explorerAddressUrl(address),
    },
  };
}

// =========================================================================
// 9. XRP LEDGER TELEMETRY (XRPSCAN FREE PUBLIC API)
// =========================================================================
export async function fetchXrpTelemetry(
  address: string
): Promise<{ snapshot: ChainActivitySnapshot; transactions: NormalizedTx[]; audit: SourceAuditEntry }> {
  const meta = CHAIN_META.xrp;
  const url = `https://api.xrpscan.com/api/v1/account/${encodeURIComponent(address)}`;
  const res = await fetchJsonWithTimeout<{ xrpBalance?: string; inception?: string; sequence?: number }>(url, {}, 4500);

  if (!res.ok || !res.data) {
    return {
      snapshot: {
        chain: "xrp",
        chainName: meta.name,
        symbol: meta.symbol,
        active: false,
        balanceNative: null,
        totalReceivedNative: null,
        totalSentNative: null,
        txCount: null,
        explorerUrl: meta.explorerAddressUrl(address),
        telemetryStatus: "unavailable",
      },
      transactions: [],
      audit: {
        id: "xrpscan_api",
        name: "XRPScan Public API",
        category: "explorer",
        status: "unavailable",
        latencyMs: res.latencyMs,
        matchesFound: 0,
        detail: `XRPScan unreachable (${res.error || "network"})`,
        url,
      },
    };
  }

  const bal = Number(res.data.xrpBalance || "0");
  const firstSeen = res.data.inception ? Math.floor(new Date(res.data.inception).getTime() / 1000) : null;
  return {
    snapshot: {
      chain: "xrp",
      chainName: meta.name,
      symbol: meta.symbol,
      active: bal > 0 || Boolean(res.data.sequence),
      balanceNative: Number(bal.toFixed(4)),
      totalReceivedNative: null,
      totalSentNative: null,
      txCount: res.data.sequence ?? null,
      firstSeen,
      lastSeen: null,
      explorerUrl: meta.explorerAddressUrl(address),
      telemetryStatus: "live",
    },
    transactions: [],
    audit: {
      id: "xrpscan_api",
      name: "XRPScan Public API",
      category: "explorer",
      status: "live",
      latencyMs: res.latencyMs,
      matchesFound: 0,
      detail: `XRP Balance ${bal.toFixed(2)} XRP`,
      url: meta.explorerAddressUrl(address),
    },
  };
}
