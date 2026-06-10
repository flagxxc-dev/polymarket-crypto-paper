import { NextResponse } from "next/server";
import {
  buildWindowSnapshot,
  getWindowStartSecFromSlug,
  PricePoint,
} from "@/lib/chainlink-feed";
import { CryptoAsset } from "@/lib/crypto-types";

const BINANCE_SYMBOL: Record<CryptoAsset, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
};

async function fetchBinancePrice(symbol: string): Promise<number | null> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    { signal: AbortSignal.timeout(6000), cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { price?: string };
  const price = Number.parseFloat(data.price || "");
  return Number.isFinite(price) ? price : null;
}

async function fetchBinanceWindowPoints(
  symbol: string,
  windowStartMs: number,
): Promise<PricePoint[]> {
  const elapsedMinutes = Math.max(
    1,
    Math.min(5, Math.ceil((Date.now() - windowStartMs) / 60_000)),
  );
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${windowStartMs}&limit=${elapsedMinutes}`,
    { signal: AbortSignal.timeout(6000), cache: "no-store" },
  );
  if (!res.ok) return [];

  const rows = (await res.json()) as [
    number,
    string,
    string,
    string,
    string,
    ...unknown[],
  ][];

  const points: PricePoint[] = [];
  for (const row of rows) {
    const open = Number.parseFloat(row[1]);
    const close = Number.parseFloat(row[4]);
    const start = row[0];
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
    points.push({ t: start, v: open });
    points.push({ t: start + 30_000, v: close });
  }

  return points;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset")?.toUpperCase();
  const slug = url.searchParams.get("slug") || "";
  const windowStartSec =
    Number.parseInt(url.searchParams.get("windowStart") || "", 10) ||
    getWindowStartSecFromSlug(slug) ||
    0;

  if (asset !== "BTC" && asset !== "ETH") {
    return NextResponse.json({ error: "asset 必须是 BTC 或 ETH" }, { status: 400 });
  }
  if (!windowStartSec) {
    return NextResponse.json({ error: "缺少 windowStart 或 slug" }, { status: 400 });
  }

  try {
    const symbol = BINANCE_SYMBOL[asset];
    const windowStartMs = windowStartSec * 1000;
    const [current, points] = await Promise.all([
      fetchBinancePrice(symbol),
      fetchBinanceWindowPoints(symbol, windowStartMs),
    ]);

    const snapshot = buildWindowSnapshot({
      points,
      windowStartMs,
      current,
      currentAt: Date.now(),
      connected: current != null,
      source: "binance",
    });

    return NextResponse.json({
      asset,
      slug,
      windowStartSec,
      ...snapshot,
      note: "币安现货参考价，与 Polymarket Chainlink 结算价可能略有偏差",
    });
  } catch {
    return NextResponse.json({ error: "获取参考价失败" }, { status: 500 });
  }
}
