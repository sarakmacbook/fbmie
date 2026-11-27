# FBMIE — Forensic Blockchain Multi-Chain Intelligence Engine

Zero-account, zero-API-key cross-chain cryptocurrency wallet sanctions, ransomware, mixer, darknet, and laundering pattern screener built with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**, designed for one-click deployment on **Vercel**.

## Capabilities

- **Cross-Chain Auto-Detection**: Screens EVM (`Ethereum`, `Base`, `Arbitrum`, `OP Mainnet`, `Polygon`, `BNB Smart Chain`, `Avalanche`), `Bitcoin`, `TRON (TRX / USDT-TRC20)`, `Solana`, `Litecoin`, `XRP Ledger`, `Bitcoin Cash`, `Dash`, `Zcash`, `Monero`, `Dogecoin`, and `TON`.
- **Multi-Regime Sanctions Screening**:
  - **US OFAC SDN** (18 digital currency assets synced from `0xB10C/ofac-sanctioned-digital-currency-addresses` + live daily GitHub raw refresh)
  - **Chainalysis On-Chain Sanctions Oracle** (`isSanctioned(address)` live `eth_call` across Ethereum, Arbitrum, Optimism, Polygon, BSC, and Avalanche — aggregates US OFAC, EU, and UN lists with zero API key)
  - **EU Consolidated Financial Sanctions (FSF)**, **UNSCR 1718 / DPRK Lazarus**, **UK FCDO Sanctions List**, **Israel NBCTF**, and **US FBI Lazarus Group** via bundled verified records + live OpenSanctions public bulk datasets
- **Ransomware, Mixers, Darknet & Exploit Intelligence**:
  - OpenSanctions **Ransomwhere** (11,000+ wallets), **Conti** (`cablej/conti-payments`), **LockBit** (`elliott-diy/LockBit-Wallet-Tracker`), WannaCry, DarkSide, SamSam, Locky
  - Mixers & privacy pools: Tornado Cash, Railgun, Sinbad.io, Blender.io
  - Darknet & sanctioned illicit services: Hydra Market, Garantex, Suex OTC, Chatex, Silk Road, Xinbi
  - Community drainers & phishing: **MyEtherWallet Darklist**, **ScamSniffer Blacklist**, **Etherscan Labels**, and live **GoPlus Address Security API** (16 real-time threat flags)
- **Live On-Chain Telemetry & 8 Laundering Pattern Heuristics**:
  - Queries zero-key public explorers (`Mempool.space`, `Blockstream`, `Litecoinspace`, `Blockscout v2`, `PublicNode RPCs`, `TronScan`, `Solana Mainnet RPC`, `XRPScan`)
  - Detects 1-hop tainted counterparties, rapid pass-through layering sweeps, UTXO peel chains, smurfing/fan-out structuring, fixed-denomination/CoinJoin mixer fingerprints, fresh burner wallet velocity, cross-chain bridge hopping, and dust poisoning
  - Interactive 1-Hop SVG Counterparty Flow Graph with click-to-pivot investigation
- **Batch Screening (up to 25 wallets)** with CSV & JSON export
- **Universal Free API / Public Site Wallet Scraper** (`/api/scrape`) with strict SSRF guards — paste any public HTTPS JSON, CSV, TXT, or HTML endpoint to extract multi-chain wallet addresses and cross-screen them immediately
- **Zero-Auth Public REST API**: `GET/POST /api/screen`, `POST /api/batch`, `POST /api/scrape`, `GET /api/feeds`, `GET /api/index`

## Local Development

```bash
npm install
npm run sync-intel   # Refreshes src/data/synced-intel.json from live GitHub threat feeds
npm run dev          # Starts on http://localhost:3000
```

## Deploy on Vercel

Zero environment variables or database setup required — works immediately out of the box on Vercel Hobby or Pro plans:

```bash
npm run build
```

Connect the repository in Vercel (framework preset `Next.js`). `vercel.json` automatically configures `maxDuration: 30` for `/api/**` routes.
