import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "FBMIE — Multi-Chain Wallet Sanctions & AML Intelligence Screener",
  description:
    "Zero-account cross-chain wallet screening against US OFAC, UN, EU, UK & NBCTF sanctions, ransomware lists, mixers, darknet services, laundering patterns & free public API scraping.",
  keywords: [
    "OFAC",
    "sanctions screening",
    "crypto AML",
    "wallet risk score",
    "ransomware tracker",
    "blockchain forensics",
    "Tornado Cash",
    "EU FSF",
    "UN sanctions",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090C11] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-sky-100">
        {children}
      </body>
    </html>
  );
}
