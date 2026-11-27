import { CURATED_INTEL } from "@/data/curated-intel";
import syncedIntelRaw from "@/data/synced-intel.json";
import { normalizeForLookup } from "./chains";
import { ChainId, CompactSyncedRecord, IntelRecord, RiskSeverity, ThreatCategory } from "./types";

interface SyncedIntelPayload {
  syncedAt: string;
  totalRecords: number;
  sourceCounts: Record<string, number>;
  records: CompactSyncedRecord[];
}

const syncedIntel = syncedIntelRaw as SyncedIntelPayload;

let cachedLookupMap: Map<string, IntelRecord[]> | null = null;
let cachedAllRecords: IntelRecord[] | null = null;

function expandRecord(r: CompactSyncedRecord): IntelRecord {
  return {
    address: r.a,
    chain: (r.c as ChainId) || "ethereum",
    category: r.cat as ThreatCategory,
    severity: r.sev as RiskSeverity,
    label: r.lbl,
    source: r.src,
    jurisdiction: r.jur,
    reference: r.ref,
    sourceUrl: r.url,
    updatedAt: syncedIntel.syncedAt,
  };
}

function ensureIndex() {
  if (cachedLookupMap && cachedAllRecords) return;
  const map = new Map<string, IntelRecord[]>();
  const all: IntelRecord[] = [];

  const add = (rec: IntelRecord) => {
    const key = normalizeForLookup(rec.address);
    const existing = map.get(key);
    if (existing) {
      // Avoid exact duplicate category + source
      const dup = existing.some(
        (e) => e.category === rec.category && e.source === rec.source && e.label === rec.label
      );
      if (!dup) {
        existing.push(rec);
        all.push(rec);
      }
    } else {
      map.set(key, [rec]);
      all.push(rec);
    }
  };

  // Curated authoritative records take priority (richer human descriptions & EU/UN/UK/NBCTF refs)
  for (const rec of CURATED_INTEL) {
    add({ ...rec, updatedAt: rec.updatedAt || syncedIntel.syncedAt });
  }

  // Synced real GitHub datasets (OFAC 18 chains, Conti, LockBit, Etherscan Labels, MEW, ScamSniffer)
  for (const compact of syncedIntel.records) {
    add(expandRecord(compact));
  }

  cachedLookupMap = map;
  cachedAllRecords = all;
}

export function lookupLocalIntel(address: string): IntelRecord[] {
  ensureIndex();
  const key = normalizeForLookup(address);
  return cachedLookupMap?.get(key) ?? [];
}

export function isKnownBridge(address: string): IntelRecord | null {
  const hits = lookupLocalIntel(address);
  return hits.find((h) => h.category === "bridge") ?? null;
}

export function isKnownBenignOrExchange(address: string): IntelRecord | null {
  const hits = lookupLocalIntel(address);
  return hits.find((h) => h.category === "benign" || h.category === "exchange") ?? null;
}

export function getHighestRiskHit(address: string): IntelRecord | null {
  const hits = lookupLocalIntel(address).filter(
    (h) => h.category !== "benign" && h.category !== "exchange" && h.category !== "bridge"
  );
  if (hits.length === 0) return null;
  const order: Record<RiskSeverity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };
  return hits.sort((a, b) => order[b.severity] - order[a.severity])[0];
}

export interface IntelStats {
  syncedAt: string;
  totalRecords: number;
  uniqueAddresses: number;
  byCategory: Record<string, number>;
  byChain: Record<string, number>;
  sourceCounts: Record<string, number>;
}

export function getIntelStats(): IntelStats {
  ensureIndex();
  const all = cachedAllRecords ?? [];
  const byCategory: Record<string, number> = {};
  const byChain: Record<string, number> = {};

  for (const r of all) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    byChain[r.chain] = (byChain[r.chain] || 0) + 1;
  }

  return {
    syncedAt: syncedIntel.syncedAt,
    totalRecords: all.length,
    uniqueAddresses: cachedLookupMap?.size ?? 0,
    byCategory,
    byChain,
    sourceCounts: {
      ...syncedIntel.sourceCounts,
      curated_eu_un_uk_nbctf_fbi: CURATED_INTEL.length,
    },
  };
}

export function searchIntelIndex(params: {
  query?: string;
  category?: string;
  chain?: string;
  limit?: number;
  offset?: number;
}): { total: number; items: IntelRecord[] } {
  ensureIndex();
  const all = cachedAllRecords ?? [];
  const q = (params.query || "").trim().toLowerCase();
  const cat = (params.category || "").trim().toLowerCase();
  const chain = (params.chain || "").trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const filtered = all.filter((r) => {
    if (cat && cat !== "all") {
      if (cat === "un_eu_sanctions") {
        if (!["eu_sanctions", "un_sanctions", "uk_sanctions", "nbctf_sanctions"].includes(r.category)) {
          return false;
        }
      } else if (r.category !== cat) {
        return false;
      }
    }
    if (chain && chain !== "all") {
      if (chain === "evm") {
        if (!["evm", "ethereum", "bsc", "arbitrum", "polygon", "optimism", "base", "avalanche"].includes(r.chain)) {
          return false;
        }
      } else if (r.chain !== chain) {
        return false;
      }
    }
    if (q) {
      const hay = `${r.address} ${r.label} ${r.source} ${r.jurisdiction} ${r.reference || ""} ${r.description || ""} ${(r.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return {
    total: filtered.length,
    items: filtered.slice(offset, offset + limit),
  };
}
