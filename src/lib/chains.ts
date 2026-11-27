import { ChainId } from "./types";

export interface ChainMeta {
  id: ChainId;
  name: string;
  symbol: string;
  family: "evm" | "utxo" | "tron" | "solana" | "xrp" | "privacy" | "ton" | "other";
  evmChainId?: number;
  goplusChainId?: string;
  explorerAddressUrl: (addr: string) => string;
  explorerTxUrl: (hash: string) => string;
  blockscoutBaseUrl?: string;
  publicRpcUrl?: string;
  chainalysisOracleAddress?: string;
}

export const CHAINALYSIS_ORACLE_EVM = "0x40C57923924B5c5c5455c48D93317139ADDaC8fb";

export const EVM_SCAN_CHAINS: ChainId[] = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "bsc",
  "avalanche",
];

export const CHAIN_META: Record<ChainId, ChainMeta> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    family: "evm",
    evmChainId: 1,
    goplusChainId: "1",
    explorerAddressUrl: (a) => `https://etherscan.io/address/${a}`,
    explorerTxUrl: (h) => `https://etherscan.io/tx/${h}`,
    blockscoutBaseUrl: "https://eth.blockscout.com/api/v2",
    publicRpcUrl: "https://ethereum-rpc.publicnode.com",
    chainalysisOracleAddress: CHAINALYSIS_ORACLE_EVM,
  },
  base: {
    id: "base",
    name: "Base",
    symbol: "ETH",
    family: "evm",
    evmChainId: 8453,
    goplusChainId: "8453",
    explorerAddressUrl: (a) => `https://basescan.org/address/${a}`,
    explorerTxUrl: (h) => `https://basescan.org/tx/${h}`,
    blockscoutBaseUrl: "https://base.blockscout.com/api/v2",
    publicRpcUrl: "https://base-rpc.publicnode.com",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum One",
    symbol: "ETH",
    family: "evm",
    evmChainId: 42161,
    goplusChainId: "42161",
    explorerAddressUrl: (a) => `https://arbiscan.io/address/${a}`,
    explorerTxUrl: (h) => `https://arbiscan.io/tx/${h}`,
    blockscoutBaseUrl: "https://arbitrum.blockscout.com/api/v2",
    publicRpcUrl: "https://arbitrum-one-rpc.publicnode.com",
    chainalysisOracleAddress: CHAINALYSIS_ORACLE_EVM,
  },
  optimism: {
    id: "optimism",
    name: "OP Mainnet",
    symbol: "ETH",
    family: "evm",
    evmChainId: 10,
    goplusChainId: "10",
    explorerAddressUrl: (a) => `https://optimistic.etherscan.io/address/${a}`,
    explorerTxUrl: (h) => `https://optimistic.etherscan.io/tx/${h}`,
    blockscoutBaseUrl: "https://optimism.blockscout.com/api/v2",
    publicRpcUrl: "https://optimism-rpc.publicnode.com",
    chainalysisOracleAddress: CHAINALYSIS_ORACLE_EVM,
  },
  polygon: {
    id: "polygon",
    name: "Polygon PoS",
    symbol: "POL",
    family: "evm",
    evmChainId: 137,
    goplusChainId: "137",
    explorerAddressUrl: (a) => `https://polygonscan.com/address/${a}`,
    explorerTxUrl: (h) => `https://polygonscan.com/tx/${h}`,
    blockscoutBaseUrl: "https://polygon.blockscout.com/api/v2",
    publicRpcUrl: "https://polygon-bor-rpc.publicnode.com",
    chainalysisOracleAddress: CHAINALYSIS_ORACLE_EVM,
  },
  bsc: {
    id: "bsc",
    name: "BNB Smart Chain",
    symbol: "BNB",
    family: "evm",
    evmChainId: 56,
    goplusChainId: "56",
    explorerAddressUrl: (a) => `https://bscscan.com/address/${a}`,
    explorerTxUrl: (h) => `https://bscscan.com/tx/${h}`,
    publicRpcUrl: "https://bsc-rpc.publicnode.com",
    chainalysisOracleAddress: CHAINALYSIS_ORACLE_EVM,
  },
  avalanche: {
    id: "avalanche",
    name: "Avalanche C-Chain",
    symbol: "AVAX",
    family: "evm",
    evmChainId: 43114,
    goplusChainId: "43114",
    explorerAddressUrl: (a) => `https://snowtrace.io/address/${a}`,
    explorerTxUrl: (h) => `https://snowtrace.io/tx/${h}`,
    publicRpcUrl: "https://avalanche-c-chain-rpc.publicnode.com",
    chainalysisOracleAddress: CHAINALYSIS_ORACLE_EVM,
  },
  bitcoin: {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    family: "utxo",
    explorerAddressUrl: (a) => `https://mempool.space/address/${a}`,
    explorerTxUrl: (h) => `https://mempool.space/tx/${h}`,
  },
  tron: {
    id: "tron",
    name: "TRON",
    symbol: "TRX",
    family: "tron",
    goplusChainId: "tron",
    explorerAddressUrl: (a) => `https://tronscan.org/#/address/${a}`,
    explorerTxUrl: (h) => `https://tronscan.org/#/transaction/${h}`,
  },
  solana: {
    id: "solana",
    name: "Solana",
    symbol: "SOL",
    family: "solana",
    goplusChainId: "solana",
    explorerAddressUrl: (a) => `https://solscan.io/account/${a}`,
    explorerTxUrl: (h) => `https://solscan.io/tx/${h}`,
  },
  litecoin: {
    id: "litecoin",
    name: "Litecoin",
    symbol: "LTC",
    family: "utxo",
    explorerAddressUrl: (a) => `https://litecoinspace.org/address/${a}`,
    explorerTxUrl: (h) => `https://litecoinspace.org/tx/${h}`,
  },
  xrp: {
    id: "xrp",
    name: "XRP Ledger",
    symbol: "XRP",
    family: "xrp",
    explorerAddressUrl: (a) => `https://xrpscan.com/account/${a}`,
    explorerTxUrl: (h) => `https://xrpscan.com/tx/${h}`,
  },
  bitcoincash: {
    id: "bitcoincash",
    name: "Bitcoin Cash",
    symbol: "BCH",
    family: "utxo",
    explorerAddressUrl: (a) => `https://blockchair.com/bitcoin-cash/address/${a}`,
    explorerTxUrl: (h) => `https://blockchair.com/bitcoin-cash/transaction/${h}`,
  },
  dash: {
    id: "dash",
    name: "Dash",
    symbol: "DASH",
    family: "utxo",
    explorerAddressUrl: (a) => `https://blockchair.com/dash/address/${a}`,
    explorerTxUrl: (h) => `https://blockchair.com/dash/transaction/${h}`,
  },
  zcash: {
    id: "zcash",
    name: "Zcash",
    symbol: "ZEC",
    family: "privacy",
    explorerAddressUrl: (a) => `https://blockchair.com/zcash/address/${a}`,
    explorerTxUrl: (h) => `https://blockchair.com/zcash/transaction/${h}`,
  },
  monero: {
    id: "monero",
    name: "Monero",
    symbol: "XMR",
    family: "privacy",
    explorerAddressUrl: () => `https://xmrchain.net/`,
    explorerTxUrl: (h) => `https://xmrchain.net/tx/${h}`,
  },
  dogecoin: {
    id: "dogecoin",
    name: "Dogecoin",
    symbol: "DOGE",
    family: "utxo",
    explorerAddressUrl: (a) => `https://blockchair.com/dogecoin/address/${a}`,
    explorerTxUrl: (h) => `https://blockchair.com/dogecoin/transaction/${h}`,
  },
  ton: {
    id: "ton",
    name: "TON",
    symbol: "TON",
    family: "ton",
    explorerAddressUrl: (a) => `https://tonviewer.com/${a}`,
    explorerTxUrl: (h) => `https://tonviewer.com/transaction/${h}`,
  },
  etc: {
    id: "etc",
    name: "Ethereum Classic",
    symbol: "ETC",
    family: "evm",
    explorerAddressUrl: (a) => `https://etc.blockscout.com/address/${a}`,
    explorerTxUrl: (h) => `https://etc.blockscout.com/tx/${h}`,
  },
  bsv: {
    id: "bsv",
    name: "Bitcoin SV",
    symbol: "BSV",
    family: "utxo",
    explorerAddressUrl: (a) => `https://whatsonchain.com/address/${a}`,
    explorerTxUrl: (h) => `https://whatsonchain.com/tx/${h}`,
  },
  btg: {
    id: "btg",
    name: "Bitcoin Gold",
    symbol: "BTG",
    family: "utxo",
    explorerAddressUrl: (a) => `https://explorer.bitcoingold.org/insight/address/${a}`,
    explorerTxUrl: (h) => `https://explorer.bitcoingold.org/insight/tx/${h}`,
  },
  verge: {
    id: "verge",
    name: "Verge",
    symbol: "XVG",
    family: "utxo",
    explorerAddressUrl: (a) => `https://verge-blockchain.info/address/${a}`,
    explorerTxUrl: (h) => `https://verge-blockchain.info/tx/${h}`,
  },
  unknown: {
    id: "unknown",
    name: "Unknown Chain",
    symbol: "N/A",
    family: "other",
    explorerAddressUrl: () => `#`,
    explorerTxUrl: () => `#`,
  },
};

export interface AddressDetection {
  valid: boolean;
  normalized: string;
  primaryChain: ChainId;
  detectedChains: ChainId[];
  format: string;
  error?: string;
}

export function detectAddress(rawInput: string, chainOverride?: ChainId | "auto"): AddressDetection {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: "",
      primaryChain: "unknown",
      detectedChains: [],
      format: "Empty",
      error: "Please enter a blockchain wallet address.",
    };
  }

  // 1. EVM 0x address
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    const primary: ChainId =
      chainOverride && chainOverride !== "auto" && EVM_SCAN_CHAINS.includes(chainOverride)
        ? chainOverride
        : "ethereum";
    const chains: ChainId[] =
      chainOverride && chainOverride !== "auto" && EVM_SCAN_CHAINS.includes(chainOverride)
        ? [chainOverride, ...EVM_SCAN_CHAINS.filter((c) => c !== chainOverride)]
        : EVM_SCAN_CHAINS;
    return {
      valid: true,
      normalized: trimmed.toLowerCase(),
      primaryChain: primary,
      detectedChains: chains,
      format: "EVM Hex (ERC-20 / Multi-Chain)",
    };
  }

  // 2. Bitcoin Bech32 / Taproot
  if (/^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}$/i.test(trimmed)) {
    const isTaproot = /^bc1p/i.test(trimmed);
    return {
      valid: true,
      normalized: trimmed.toLowerCase(),
      primaryChain: "bitcoin",
      detectedChains: ["bitcoin"],
      format: isTaproot ? "Bitcoin Taproot (Bech32m)" : "Bitcoin Native SegWit (Bech32)",
    };
  }

  // 3. Bitcoin Legacy (P2PKH 1...) or Script (P2SH 3...)
  if (/^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(trimmed)) {
    const isP2SH = trimmed.startsWith("3");
    const primary: ChainId =
      chainOverride && chainOverride !== "auto" && ["bitcoin", "bitcoincash", "bsv"].includes(chainOverride)
        ? chainOverride
        : "bitcoin";
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: primary,
      detectedChains: [primary],
      format: isP2SH ? "Bitcoin Script Hash (P2SH)" : "Bitcoin Legacy (P2PKH)",
    };
  }

  // 4. Bitcoin Cash CashAddr
  if (/^(bitcoincash:)?[qp][a-z0-9]{41}$/i.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed.toLowerCase(),
      primaryChain: "bitcoincash",
      detectedChains: ["bitcoincash"],
      format: "Bitcoin Cash (CashAddr)",
    };
  }

  // 5. TRON Base58 (T... 34 chars)
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "tron",
      detectedChains: ["tron"],
      format: "TRON Base58Check (TRX / TRC-20)",
    };
  }

  // 6. Litecoin Bech32 or Legacy/P2SH (L/M)
  if (/^ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}$/i.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed.toLowerCase(),
      primaryChain: "litecoin",
      detectedChains: ["litecoin"],
      format: "Litecoin Native SegWit (Bech32)",
    };
  }
  if (/^[LM][1-9A-HJ-NP-Za-km-z]{26,33}$/.test(trimmed) && chainOverride !== "solana") {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "litecoin",
      detectedChains: ["litecoin"],
      format: "Litecoin Legacy / P2SH",
    };
  }

  // 7. XRP Classic Address (r...)
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(trimmed) && chainOverride !== "solana") {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "xrp",
      detectedChains: ["xrp"],
      format: "XRP Ledger Classic",
    };
  }

  // 8. Monero Standard / Subaddress (4... or 8..., 95 or 106 chars)
  if (/^[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93,104}$/.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "monero",
      detectedChains: ["monero"],
      format: "Monero Privacy Address (CryptoNote)",
    };
  }

  // 9. Zcash Transparent (t1/t3) or Shielded (zs1)
  if (/^(t1|t3)[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed) || /^zs1[a-z0-9]{75}$/i.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "zcash",
      detectedChains: ["zcash"],
      format: trimmed.startsWith("zs1") ? "Zcash Sapling Shielded" : "Zcash Transparent",
    };
  }

  // 10. Dash (X...)
  if (/^X[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed) && chainOverride !== "solana") {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "dash",
      detectedChains: ["dash"],
      format: "Dash Mainnet (P2PKH)",
    };
  }

  // 11. Dogecoin (D...)
  if (/^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(trimmed) && chainOverride !== "solana") {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "dogecoin",
      detectedChains: ["dogecoin"],
      format: "Dogecoin Base58Check",
    };
  }

  // 12. TON User-friendly (EQ / UQ / kQ / 0Q 48 chars base64url)
  if (/^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "ton",
      detectedChains: ["ton"],
      format: "TON Open Network (Base64URL)",
    };
  }

  // 13. Solana Ed25519 Base58 (32-44 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return {
      valid: true,
      normalized: trimmed,
      primaryChain: "solana",
      detectedChains: ["solana"],
      format: "Solana Ed25519 Public Key (Base58)",
    };
  }

  return {
    valid: false,
    normalized: trimmed,
    primaryChain: "unknown",
    detectedChains: [],
    format: "Unrecognized Format",
    error:
      "Unsupported wallet address format. Supported: EVM (0x...), Bitcoin (1/3/bc1...), TRON (T...), Solana, Litecoin, XRP, Monero, Zcash, Dash, Dogecoin, Bitcoin Cash, and TON.",
  };
}

export function normalizeForLookup(address: string): string {
  const trimmed = address.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed) || /^(bc1|ltc1|bitcoincash:)/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function shortenAddress(addr: string, start = 8, end = 6): string {
  if (!addr || addr.length <= start + end + 3) return addr;
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}
