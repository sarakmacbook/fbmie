"use client";

import { ArrowUpRight } from "lucide-react";
import { shortenAddress } from "@/lib/chains";
import { CounterpartyNode, RiskTier } from "@/lib/types";

interface FlowGraphProps {
  targetAddress: string;
  targetRiskTier: RiskTier;
  counterparties: CounterpartyNode[];
  onPivotAddress: (address: string) => void;
}

function riskStroke(risk: string): string {
  switch (risk) {
    case "critical":
    case "SEVERE":
      return "#f43f5e";
    case "high":
    case "HIGH":
      return "#f97316";
    case "medium":
    case "ELEVATED":
      return "#eab308";
    case "low":
    case "MODERATE":
      return "#38bdf8";
    default:
      return "#334155";
  }
}

function riskFill(risk: string): string {
  switch (risk) {
    case "critical":
    case "SEVERE":
      return "#2a1219";
    case "high":
    case "HIGH":
      return "#2b180e";
    case "medium":
    case "ELEVATED":
      return "#261f0b";
    default:
      return "#131b27";
  }
}

export function FlowGraph({
  targetAddress,
  targetRiskTier,
  counterparties,
  onPivotAddress,
}: FlowGraphProps) {
  if (counterparties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#243043] bg-[#0B0F16] px-6 py-10 text-center">
        <p className="text-xs font-medium text-slate-300">
          No 1-Hop Counterparty Graph Edges Available
        </p>
        <p className="mt-1 max-w-md text-[11px] text-slate-500">
          Either this address has no recent public transfers in the sampled window, uses a privacy-shielded chain, or public explorer endpoints were unavailable.
        </p>
      </div>
    );
  }

  const inbound = counterparties.filter((c) => c.direction === "inbound" || c.direction === "both").slice(0, 6);
  const outbound = counterparties.filter((c) => c.direction === "outbound").slice(0, 6);

  // If all nodes went to inbound, balance display slightly
  const leftNodes = inbound;
  const rightNodes = outbound.length > 0 ? outbound : counterparties.slice(leftNodes.length, leftNodes.length + 6);

  const maxRows = Math.max(leftNodes.length, rightNodes.length, 1);
  const height = Math.max(240, maxRows * 58 + 44);
  const width = 820;
  const centerX = width / 2;
  const centerY = height / 2;

  const yPos = (idx: number, total: number) => {
    if (total === 1) return centerY;
    const span = height - 80;
    return 40 + (span / (total - 1)) * idx;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          Click any counterparty node to immediately pivot and screen that wallet.
        </span>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> High
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Medium
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-500" /> Neutral
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#1E2736] bg-[#090C11] p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[660px]"
          role="img"
          aria-label="1-Hop Transaction Counterparty Exposure Graph"
        >
          <defs>
            <marker
              id="arrow-in"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" opacity="0.7" />
            </marker>
            <marker
              id="arrow-out"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" opacity="0.7" />
            </marker>
            <marker
              id="arrow-risk"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
          </defs>

          {/* Column Labels */}
          <text x="120" y="18" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
            INBOUND SOURCES ({leftNodes.length})
          </text>
          <text x={centerX} y="18" textAnchor="middle" fill="#38bdf8" fontSize="10" fontFamily="monospace">
            SCREENED WALLET
          </text>
          <text x={width - 120} y="18" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace">
            OUTBOUND DESTINATIONS ({rightNodes.length})
          </text>

          {/* Inbound edges & nodes */}
          {leftNodes.map((node, i) => {
            const ny = yPos(i, leftNodes.length);
            const isRisky = node.risk !== "clean" && node.risk !== "info";
            const stroke = isRisky ? riskStroke(node.risk) : "#38bdf8";
            return (
              <g key={`in-${node.address}`}>
                <path
                  d={`M 225 ${ny} C 285 ${ny}, 295 ${centerY}, ${centerX - 88} ${centerY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isRisky ? 2 : 1.25}
                  strokeOpacity={isRisky ? 0.9 : 0.45}
                  markerEnd={isRisky ? "url(#arrow-risk)" : "url(#arrow-in)"}
                />
                <g
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  onClick={() => onPivotAddress(node.address)}
                >
                  <rect
                    x="14"
                    y={ny - 20}
                    width="210"
                    height="40"
                    rx="8"
                    fill={riskFill(node.risk)}
                    stroke={riskStroke(node.risk)}
                    strokeWidth={isRisky ? 1.5 : 1}
                  />
                  <text
                    x="24"
                    y={ny - 4}
                    fill="#e2e8f0"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {shortenAddress(node.address, 9, 6)}
                  </text>
                  <text
                    x="24"
                    y={ny + 12}
                    fill={isRisky ? "#fda4af" : "#94a3b8"}
                    fontSize="9.5"
                    fontFamily="sans-serif"
                  >
                    {(node.label || `${node.txCount} tx · ${node.totalValueNative} ${node.symbol}`).slice(0, 30)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Outbound edges & nodes */}
          {rightNodes.map((node, i) => {
            const ny = yPos(i, rightNodes.length);
            const isRisky = node.risk !== "clean" && node.risk !== "info";
            const stroke = isRisky ? riskStroke(node.risk) : "#94a3b8";
            return (
              <g key={`out-${node.address}`}>
                <path
                  d={`M ${centerX + 88} ${centerY} C ${centerX + 125} ${centerY}, ${width - 285} ${ny}, ${width - 225} ${ny}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isRisky ? 2 : 1.25}
                  strokeOpacity={isRisky ? 0.9 : 0.45}
                  markerEnd={isRisky ? "url(#arrow-risk)" : "url(#arrow-out)"}
                />
                <g
                  className="cursor-pointer transition-opacity hover:opacity-90"
                  onClick={() => onPivotAddress(node.address)}
                >
                  <rect
                    x={width - 224}
                    y={ny - 20}
                    width="210"
                    height="40"
                    rx="8"
                    fill={riskFill(node.risk)}
                    stroke={riskStroke(node.risk)}
                    strokeWidth={isRisky ? 1.5 : 1}
                  />
                  <text
                    x={width - 214}
                    y={ny - 4}
                    fill="#e2e8f0"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {shortenAddress(node.address, 9, 6)}
                  </text>
                  <text
                    x={width - 214}
                    y={ny + 12}
                    fill={isRisky ? "#fda4af" : "#94a3b8"}
                    fontSize="9.5"
                    fontFamily="sans-serif"
                  >
                    {(node.label || `${node.txCount} tx · ${node.totalValueNative} ${node.symbol}`).slice(0, 30)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Center Target Node */}
          <g>
            <rect
              x={centerX - 86}
              y={centerY - 30}
              width="172"
              height="60"
              rx="10"
              fill={riskFill(targetRiskTier)}
              stroke={riskStroke(targetRiskTier)}
              strokeWidth="2"
            />
            <text
              x={centerX}
              y={centerY - 7}
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="11"
              fontWeight="bold"
              fontFamily="monospace"
            >
              {shortenAddress(targetAddress, 8, 6)}
            </text>
            <text
              x={centerX}
              y={centerY + 13}
              textAnchor="middle"
              fill={targetRiskTier === "LOW" ? "#34d399" : "#fda4af"}
              fontSize="10"
              fontFamily="monospace"
            >
              TARGET · {targetRiskTier}
            </text>
          </g>
        </svg>
      </div>

      {/* Quick clickable counterparty chips for mobile/accessibility */}
      <div className="flex flex-wrap gap-1.5">
        {counterparties.slice(0, 8).map((cp) => (
          <button
            key={cp.address}
            type="button"
            onClick={() => onPivotAddress(cp.address)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors ${
              cp.risk !== "clean" && cp.risk !== "info"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                : "border-[#1E2736] bg-[#131924] text-slate-300 hover:border-sky-500/40 hover:text-sky-200"
            }`}
          >
            <span>{shortenAddress(cp.address, 6, 4)}</span>
            {cp.label && <span className="font-sans text-slate-400">({cp.label.slice(0, 18)})</span>}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
