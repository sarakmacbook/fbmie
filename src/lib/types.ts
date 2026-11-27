export type ChainId =
  | "ethereum"
  | "bitcoin"
  | "tron"
  | "solana"
  | "bsc"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base"
  | "avalanche"
  | "litecoin"
  | "xrp"
  | "bitcoincash"
  | "dash"
  | "zcash"
  | "monero"
  | "dogecoin"
  | "ton"
  | "etc"
  | "bsv"
  | "btg"
  | "verge"
  | "unknown";

export type ThreatCategory =
  | "ofac_sanctions"
  | "eu_sanctions"
  | "un_sanctions"
  | "uk_sanctions"
  | "nbctf_sanctions"
  | "ransomware"
  | "mixer"
  | "darknet"
  | "exploit"
  | "laundering"
  | "scam"
  | "bridge"
  | "exchange"
  | "benign";

export type RiskSeverity = "critical" | "high" | "medium" | "low" | "info";

export type RiskTier = "SEVERE" | "HIGH" | "ELEVATED" | "MODERATE" | "LOW";

export interface IntelRecord {
  address: string;
  chain: ChainId | "evm" | "multi";
  category: ThreatCategory;
  severity: RiskSeverity;
  label: string;
  description?: string;
  source: string;
  jurisdiction: string; // US, EU, UN, UK, IL, GLOBAL
  reference?: string;
  sourceUrl?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface CompactSyncedRecord {
  a: string;
  c: string;
  cat: string;
  sev: string;
  lbl: string;
  src: string;
  jur: string;
  ref?: string;
  url?: string;
}

export interface ScreeningFinding {
  id: string;
  category: ThreatCategory;
  severity: RiskSeverity;
  matchType: "direct" | "oracle" | "api_signal" | "counterparty_1hop" | "heuristic";
  title: string;
  detail: string;
  jurisdiction: string;
  source: string;
  reference?: string;
  sourceUrl?: string;
  chain?: ChainId;
  relatedAddress?: string;
  weight: number;
}

export interface CompliancePillarStatus {
  id: "ofac" | "un_eu" | "ransomware" | "mixers" | "darknet" | "laundering";
  label: string;
  status: "HIT" | "EXPOSURE" | "CLEAR";
  hitCount: number;
  summary: string;
}

export interface NormalizedTx {
  hash: string;
  chain: ChainId;
  timestamp: number; // unix seconds
  direction: "in" | "out" | "self";
  counterparty: string;
  counterpartyLabel?: string;
  counterpartyRisk?: RiskSeverity | "clean";
  counterpartyCategory?: ThreatCategory;
  valueNative: number;
  symbol: string;
  tokenSymbol?: string;
  tokenAmount?: number;
  inputCount?: number;
  outputCount?: number;
  equalOutputs?: boolean;
  explorerUrl: string;
}

export interface ChainActivitySnapshot {
  chain: ChainId;
  chainName: string;
  symbol: string;
  active: boolean;
  balanceNative: number | null;
  totalReceivedNative: number | null;
  totalSentNative: number | null;
  txCount: number | null;
  firstSeen?: number | null;
  lastSeen?: number | null;
  isContract?: boolean;
  chainalysisOracleSanctioned?: boolean | null;
  goplusFlagged?: boolean | null;
  goplusFlags?: string[];
  explorerUrl: string;
  telemetryStatus: "live" | "partial" | "unavailable";
}

export interface LaunderingHeuristicResult {
  id:
    | "counterparty_taint"
    | "rapid_passthrough"
    | "peel_chain"
    | "structuring_fanout"
    | "mixer_denomination"
    | "burner_velocity"
    | "bridge_hopping"
    | "dust_poisoning";
  name: string;
  triggered: boolean;
  severity: RiskSeverity;
  confidence: number; // 0-100
  evidence: string;
  metric?: string;
}

export interface SourceAuditEntry {
  id: string;
  name: string;
  category: "sanctions" | "threat_intel" | "oracle" | "explorer" | "local_index";
  status: "live" | "cached" | "unavailable" | "skipped";
  latencyMs: number;
  matchesFound: number;
  detail: string;
  url?: string;
}

export interface CounterpartyNode {
  address: string;
  chain: ChainId;
  label?: string;
  category?: ThreatCategory;
  risk: RiskSeverity | "clean";
  direction: "inbound" | "outbound" | "both";
  txCount: number;
  totalValueNative: number;
  symbol: string;
}

export interface ScreeningReport {
  reportId: string;
  screenedAt: string;
  address: string;
  normalizedAddress: string;
  detectedChains: ChainId[];
  primaryChain: ChainId;
  addressFormat: string;
  riskScore: number; // 0-100
  riskTier: RiskTier;
  recommendation: string;
  executiveSummary: string;
  pillars: CompliancePillarStatus[];
  findings: ScreeningFinding[];
  chainSnapshots: ChainActivitySnapshot[];
  heuristics: LaunderingHeuristicResult[];
  recentTransactions: NormalizedTx[];
  counterparties: CounterpartyNode[];
  sources: SourceAuditEntry[];
  deepScanEnabled: boolean;
  durationMs: number;
}

export interface BatchItemSummary {
  address: string;
  primaryChain: ChainId;
  valid: boolean;
  error?: string;
  riskScore: number;
  riskTier: RiskTier;
  ofacHit: boolean;
  unEuHit: boolean;
  ransomwareHit: boolean;
  mixerHit: boolean;
  darknetHit: boolean;
  launderingDetected: boolean;
  topFinding: string;
  findingsCount: number;
  report?: ScreeningReport;
}

export interface ScrapeResult {
  url: string;
  fetchedAt: string;
  httpStatus: number;
  contentType: string;
  bytesRead: number;
  durationMs: number;
  totalExtracted: number;
  byChain: Record<string, number>;
  flaggedCount: number;
  extracted: Array<{
    address: string;
    chain: ChainId;
    format: string;
    context?: string;
    intelHits: Array<{
      category: ThreatCategory;
      severity: RiskSeverity;
      label: string;
      source: string;
      jurisdiction: string;
    }>;
  }>;
}
