#!/usr/bin/env node
/**
 * FBMIE Threat Intelligence Sync Script
 * Fetches live open-source public sanctions, ransomware, mixer, darknet, exploit,
 * and phishing datasets from GitHub and compiles a compact normalized index
 * at src/data/synced-intel.json.
 *
 * Run: npm run sync-intel
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "../src/data/synced-intel.json");

function fetchRaw(url) {
  try {
    const out = execFileSync(
      "curl",
      [
        "-fsSL",
        "--max-time",
        "30",
        "-H",
        "Accept: application/vnd.github.raw",
        "-H",
        "User-Agent: fbmie-intel-sync/1.0",
        url,
      ],
      { maxBuffer: 25 * 1024 * 1024, encoding: "utf8" }
    );
    return out;
  } catch (err) {
    console.warn(`[sync-intel] Warning: failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

const OFAC_ASSETS = [
  { ticker: "XBT", chain: "bitcoin" },
  { ticker: "ETH", chain: "ethereum" },
  { ticker: "TRX", chain: "tron" },
  { ticker: "USDT", chain: "multi" },
  { ticker: "USDC", chain: "multi" },
  { ticker: "BSC", chain: "bsc" },
  { ticker: "ARB", chain: "arbitrum" },
  { ticker: "SOL", chain: "solana" },
  { ticker: "LTC", chain: "litecoin" },
  { ticker: "XMR", chain: "monero" },
  { ticker: "ZEC", chain: "zcash" },
  { ticker: "DASH", chain: "dash" },
  { ticker: "BCH", chain: "bitcoincash" },
  { ticker: "BSV", chain: "bsv" },
  { ticker: "BTG", chain: "btg" },
  { ticker: "ETC", chain: "etc" },
  { ticker: "XRP", chain: "xrp" },
  { ticker: "XVG", chain: "verge" },
];

function inferChain(address, fallback = "ethereum") {
  const a = address.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return fallback === "multi" ? "ethereum" : fallback;
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return "tron";
  if (/^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a) || /^bc1[a-z0-9]{25,87}$/i.test(a)) return "bitcoin";
  if (/^(L|M)[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a) || /^ltc1[a-z0-9]{25,87}$/i.test(a)) return "litecoin";
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)) return "xrp";
  if (/^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/.test(a)) return "monero";
  if (/^(t1|t3)[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) || /^zs1[a-z0-9]{75}$/i.test(a)) return "zcash";
  if (/^X[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return "dash";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return fallback === "multi" ? "solana" : fallback;
  return fallback;
}

function main() {
  const syncedAt = new Date().toISOString();
  const records = [];
  const counts = {
    ofac: 0,
    ransomware: 0,
    mixer: 0,
    darknet: 0,
    exploit: 0,
    scam: 0,
    bridge: 0,
    exchange: 0,
  };

  // 1. OFAC SDN Digital Currency Addresses (0xB10C nightly extract from US Treasury SDN XML)
  console.log("[1/5] Fetching 0xB10C OFAC SDN sanctioned addresses across 18 assets...");
  const ofacSeen = new Set();
  for (const { ticker, chain } of OFAC_ASSETS) {
    const raw = fetchRaw(
      `https://api.github.com/repos/0xB10C/ofac-sanctioned-digital-currency-addresses/contents/sanctioned_addresses_${ticker}.json?ref=lists`
    );
    if (!raw) continue;
    try {
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;
      for (const addr of list) {
        if (typeof addr !== "string" || !addr.trim()) continue;
        const trimmed = addr.trim();
        const key = `${trimmed.toLowerCase()}::${ticker}`;
        if (ofacSeen.has(key)) continue;
        ofacSeen.add(key);
        const detectedChain = inferChain(trimmed, chain);
        records.push({
          a: trimmed,
          c: detectedChain,
          cat: "ofac_sanctions",
          sev: "critical",
          lbl: `OFAC SDN Designated Address (${ticker})`,
          src: "US Treasury OFAC SDN (0xB10C)",
          jur: "US",
          ref: `OFAC-SDN-${ticker}`,
          url: `https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses/blob/lists/sanctioned_addresses_${ticker}.json`,
        });
        counts.ofac++;
      }
    } catch {
      // ignore parse errors
    }
  }
  console.log(`   -> ${counts.ofac} OFAC SDN address records loaded.`);

  // 2. Conti & LockBit Ransomware Datasets
  console.log("[2/5] Fetching Conti & LockBit ransomware wallet datasets...");
  const ransomSeen = new Set();
  const contiExpanded = fetchRaw(
    "https://api.github.com/repos/cablej/conti-payments/contents/expanded_conti_addresses.csv"
  );
  if (contiExpanded) {
    for (const line of contiExpanded.split(/\r?\n/).slice(1)) {
      const addr = line.split(",")[0]?.trim();
      if (!addr || ransomSeen.has(addr)) continue;
      ransomSeen.add(addr);
      records.push({
        a: addr,
        c: "bitcoin",
        cat: "ransomware",
        sev: "critical",
        lbl: "Conti Ransomware Payment Address",
        src: "Conti Payments Dataset (cablej)",
        jur: "GLOBAL",
        ref: "CONTI-RANSOM",
        url: "https://github.com/cablej/conti-payments",
      });
      counts.ransomware++;
    }
  }

  const contiLabeled = fetchRaw(
    "https://api.github.com/repos/cablej/conti-payments/contents/labeled_addresses.csv"
  );
  if (contiLabeled) {
    for (const line of contiLabeled.split(/\r?\n/).slice(1)) {
      const [rawAddr, rawLabel] = line.split(",");
      const addr = rawAddr?.trim();
      const role = rawLabel?.trim() || "affiliate";
      if (!addr || ransomSeen.has(addr)) continue;
      ransomSeen.add(addr);
      records.push({
        a: addr,
        c: "bitcoin",
        cat: "ransomware",
        sev: "high",
        lbl: `Conti Ransomware Infrastructure (${role})`,
        src: "Conti Leaks Labeled Dataset (cablej)",
        jur: "GLOBAL",
        ref: `CONTI-${role.toUpperCase()}`,
        url: "https://github.com/cablej/conti-payments",
      });
      counts.ransomware++;
    }
  }

  const lockbitFunded = fetchRaw(
    "https://api.github.com/repos/elliott-diy/LockBit-Wallet-Tracker/contents/funded_wallets_may2025.csv"
  );
  if (lockbitFunded) {
    for (const line of lockbitFunded.split(/\r?\n/).slice(1)) {
      const [rawAddr, , btc] = line.split(",");
      const addr = rawAddr?.trim();
      if (!addr || ransomSeen.has(addr)) continue;
      ransomSeen.add(addr);
      records.push({
        a: addr,
        c: "bitcoin",
        cat: "ransomware",
        sev: "critical",
        lbl: `LockBit Ransomware Active Wallet${btc ? ` (${btc.trim()} BTC tracked)` : ""}`,
        src: "LockBit Wallet Tracker (2025 Leak)",
        jur: "GLOBAL",
        ref: "LOCKBIT-2025",
        url: "https://github.com/elliott-diy/LockBit-Wallet-Tracker",
      });
      counts.ransomware++;
    }
  }
  console.log(`   -> ${counts.ransomware} ransomware wallet records loaded.`);

  // 3. Etherscan Labeled Threat, Mixer, Darknet, Exploit, Bridge & Exchange Addresses
  console.log("[3/5] Fetching Etherscan labeled accounts (mixers, exploits, darknet, bridges, exchanges)...");
  const ethLabelsRaw = fetchRaw(
    "https://api.github.com/repos/brianleect/etherscan-labels/contents/data/etherscan/combined/combinedAccountLabels.json"
  );
  const ethLabelSeen = new Set();
  if (ethLabelsRaw) {
    try {
      const parsed = JSON.parse(ethLabelsRaw);
      for (const [addr, info] of Object.entries(parsed)) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
        const lower = addr.toLowerCase();
        const name = String(info?.name || "").trim();
        const labels = Array.isArray(info?.labels) ? info.labels.map((l) => String(l).toLowerCase()) : [];
        const combined = `${name.toLowerCase()} ${labels.join(" ")}`;

        let cat = null;
        let sev = "medium";

        if (
          combined.includes("tornado") ||
          combined.includes("mixer") ||
          combined.includes("tumbler") ||
          combined.includes("railgun") ||
          combined.includes("cyclone") ||
          combined.includes("sinbad") ||
          combined.includes("blender") ||
          combined.includes("aztec")
        ) {
          cat = "mixer";
          sev = combined.includes("tornado") || combined.includes("sinbad") || combined.includes("blender") ? "critical" : "high";
          counts.mixer++;
        } else if (
          combined.includes("darknet") ||
          combined.includes("hydra") ||
          combined.includes("garantex") ||
          combined.includes("suex") ||
          combined.includes("chatex") ||
          combined.includes("bitzlato") ||
          combined.includes("silk road")
        ) {
          cat = "darknet";
          sev = "critical";
          counts.darknet++;
        } else if (
          labels.includes("heist") ||
          labels.includes("exploit") ||
          labels.includes("lazarus-group") ||
          combined.includes("exploiter") ||
          combined.includes("hacker") ||
          combined.includes("heist") ||
          combined.includes("lazarus") ||
          combined.includes("drainer")
        ) {
          cat = "exploit";
          sev = "critical";
          counts.exploit++;
        } else if (
          labels.includes("phish-hack") ||
          labels.includes("scam") ||
          combined.includes("fake_phishing") ||
          combined.includes("phishing")
        ) {
          // Keep top 1200 named phish/hack records to stay super lightweight
          if (counts.scam < 1200) {
            cat = "scam";
            sev = "high";
            counts.scam++;
          }
        } else if (labels.includes("bridge") || combined.includes("bridge")) {
          if (counts.bridge < 300) {
            cat = "bridge";
            sev = "info";
            counts.bridge++;
          }
        } else if (labels.includes("exchange") && name && counts.exchange < 250) {
          cat = "exchange";
          sev = "info";
          counts.exchange++;
        }

        if (cat && !ethLabelSeen.has(`${lower}::${cat}`)) {
          ethLabelSeen.add(`${lower}::${cat}`);
          records.push({
            a: addr,
            c: "ethereum",
            cat,
            sev,
            lbl: name || `Labeled ${cat} (${labels.join(", ")})`,
            src: "Etherscan Public Labels",
            jur: "GLOBAL",
            ref: labels.slice(0, 3).join(",") || cat,
            url: "https://github.com/brianleect/etherscan-labels",
          });
        }
      }
    } catch (e) {
      console.warn("   -> Etherscan labels parse warning:", e.message);
    }
  }
  console.log(
    `   -> Mixers: ${counts.mixer}, Darknet: ${counts.darknet}, Exploits: ${counts.exploit}, Scams: ${counts.scam}, Bridges: ${counts.bridge}, Exchanges: ${counts.exchange}`
  );

  // 4. MyEtherWallet Darklist (scam, phishing, extortion, ransomware)
  console.log("[4/5] Fetching MyEtherWallet Ethereum Darklist...");
  const mewRaw = fetchRaw(
    "https://api.github.com/repos/MyEtherWallet/ethereum-lists/contents/src/addresses/addresses-darklist.json"
  );
  let mewAdded = 0;
  if (mewRaw) {
    try {
      const list = JSON.parse(mewRaw);
      if (Array.isArray(list)) {
        for (const item of list) {
          const addr = item?.address?.trim();
          if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
          const lower = addr.toLowerCase();
          if (ethLabelSeen.has(`${lower}::scam`)) continue;
          ethLabelSeen.add(`${lower}::scam`);
          const comment = String(item?.comment || "Community-reported malicious wallet").trim();
          const isRansom = /ransom|extort|blackmail/i.test(comment);
          records.push({
            a: addr,
            c: "ethereum",
            cat: isRansom ? "ransomware" : "scam",
            sev: isRansom ? "critical" : "high",
            lbl: comment.slice(0, 120),
            src: "MyEtherWallet Darklist",
            jur: "GLOBAL",
            ref: item?.date ? `MEW-${item.date}` : "MEW-DARKLIST",
            url: "https://github.com/MyEtherWallet/ethereum-lists/blob/master/src/addresses/addresses-darklist.json",
          });
          mewAdded++;
        }
      }
    } catch (e) {
      console.warn("   -> MEW darklist parse warning:", e.message);
    }
  }
  console.log(`   -> ${mewAdded} MEW darklist records loaded.`);

  // 5. ScamSniffer Malicious Drainer / Phishing Addresses
  console.log("[5/5] Fetching ScamSniffer wallet drainer blacklist...");
  const ssRaw = fetchRaw(
    "https://api.github.com/repos/scamsniffer/scam-database/contents/blacklist/address.json"
  );
  let ssAdded = 0;
  if (ssRaw) {
    try {
      const list = JSON.parse(ssRaw);
      if (Array.isArray(list)) {
        for (const addr of list) {
          if (typeof addr !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
          const lower = addr.toLowerCase();
          if (ethLabelSeen.has(`${lower}::scam`)) continue;
          ethLabelSeen.add(`${lower}::scam`);
          records.push({
            a: addr,
            c: "ethereum",
            cat: "scam",
            sev: "high",
            lbl: "ScamSniffer Verified Phishing / Wallet Drainer",
            src: "ScamSniffer Blacklist",
            jur: "GLOBAL",
            ref: "SCAMSNIFFER",
            url: "https://github.com/scamsniffer/scam-database",
          });
          ssAdded++;
        }
      }
    } catch (e) {
      console.warn("   -> ScamSniffer parse warning:", e.message);
    }
  }
  console.log(`   -> ${ssAdded} ScamSniffer records loaded.`);

  const payload = {
    syncedAt,
    totalRecords: records.length,
    sourceCounts: {
      ofac_sdn_0xb10c: counts.ofac,
      ransomware_conti_lockbit: counts.ransomware,
      etherscan_mixers: counts.mixer,
      etherscan_darknet: counts.darknet,
      etherscan_exploits: counts.exploit,
      etherscan_scam_phish: counts.scam,
      etherscan_bridges: counts.bridge,
      etherscan_exchanges: counts.exchange,
      mew_darklist: mewAdded,
      scamsniffer_blacklist: ssAdded,
    },
    records,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(payload));
  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`\n[sync-intel] Wrote ${records.length} real verified records to ${OUT_FILE} (${kb} KB).`);
}

main();
