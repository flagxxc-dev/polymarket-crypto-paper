import { CryptoAsset } from "./crypto-types";

export const CHAINLINK_SYMBOL: Record<CryptoAsset, string> = {
  BTC: "btc/usd",
  ETH: "eth/usd",
};

export interface PricePoint {
  t: number;
  v: number;
}

export interface WindowSpotSnapshot {
  openPrice: number | null;
  current: number | null;
  currentAt: number | null;
  delta: number | null;
  deltaPct: number | null;
  leading: "Up" | "Down" | null;
  windowPoints: PricePoint[];
  connected: boolean;
  source: "chainlink" | "binance";
}

export function chainlinkSymbolToAsset(symbol: string): CryptoAsset | null {
  const normalized = symbol.toLowerCase();
  if (normalized === "btc/usd") return "BTC";
  if (normalized === "eth/usd") return "ETH";
  return null;
}

export function getWindowStartSecFromSlug(slug: string): number | null {
  const match = slug.match(/^(btc|eth)-updown-(5|15)m-(\d+)$/i);
  if (!match) return null;
  return Number.parseInt(match[3], 10);
}

export function deriveOpenPrice(
  points: PricePoint[],
  windowStartMs: number,
): number | null {
  const inWindow = points
    .filter((p) => p.t >= windowStartMs)
    .sort((a, b) => a.t - b.t);
  return inWindow[0]?.v ?? null;
}

export function trimWindowHistory(
  points: PricePoint[],
  windowStartMs: number,
  maxPoints = 120,
): PricePoint[] {
  const filtered = points
    .filter((p) => p.t >= windowStartMs)
    .sort((a, b) => a.t - b.t);
  if (filtered.length <= maxPoints) return filtered;

  const step = Math.ceil(filtered.length / maxPoints);
  return filtered.filter(
    (_, index) => index % step === 0 || index === filtered.length - 1,
  );
}

export function buildWindowSnapshot(args: {
  points: PricePoint[];
  windowStartMs: number;
  current: number | null;
  currentAt: number | null;
  connected: boolean;
  source: "chainlink" | "binance";
}): WindowSpotSnapshot {
  const windowPoints = trimWindowHistory(args.points, args.windowStartMs);
  const openPrice = deriveOpenPrice(args.points, args.windowStartMs);
  const current = args.current;
  const delta =
    openPrice != null && current != null ? current - openPrice : null;
  const deltaPct =
    openPrice != null && delta != null && openPrice !== 0
      ? (delta / openPrice) * 100
      : null;
  const leading: "Up" | "Down" | null =
    current != null && openPrice != null
      ? current >= openPrice
        ? "Up"
        : "Down"
      : null;

  return {
    openPrice,
    current,
    currentAt: args.currentAt,
    delta,
    deltaPct,
    leading,
    windowPoints,
    connected: args.connected,
    source: args.source,
  };
}

export function formatUsdPrice(value: number | null, asset: CryptoAsset): string {
  if (value == null) return "—";
  const digits = asset === "BTC" ? 2 : 2;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatDelta(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatDeltaPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}%`;
}
