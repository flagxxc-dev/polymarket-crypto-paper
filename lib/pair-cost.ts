import { maxPairCostForLock, takerFeeRate } from "./paper-fees";
import {
  CryptoAsset,
  LivePairQuote,
  PairCostSummary,
  PaperPosition,
} from "./crypto-types";

export function computeLivePairQuote(
  upAsk: number | null,
  downAsk: number | null,
): LivePairQuote | null {
  if (upAsk == null || downAsk == null) return null;

  const pairCost = upAsk + downAsk;
  const fee = 2 * takerFeeRate();
  const pairCostAfterFees = pairCost * (1 + fee);
  const maxLock = maxPairCostForLock();

  return {
    upAsk,
    downAsk,
    pairCost,
    pairCostAfterFees,
    edgePerShare: 1 - pairCost,
    edgeAfterFees: 1 - pairCostAfterFees,
    isLockedProfit: pairCost < 1,
    isLockedProfitAfterFees: pairCostAfterFees < maxLock,
    maxPairCostForLock: maxLock,
  };
}

export function computePairCostSummary(
  positions: PaperPosition[],
): PairCostSummary[] {
  const bySlug = new Map<string, PaperPosition[]>();
  for (const p of positions) {
    const bucket = bySlug.get(p.slug) ?? [];
    bucket.push(p);
    bySlug.set(p.slug, bucket);
  }

  const fee = 2 * takerFeeRate();
  const summaries: PairCostSummary[] = [];

  for (const [slug, rows] of bySlug) {
    const up = rows.find((p) => p.outcome === "Up");
    const down = rows.find((p) => p.outcome === "Down");
    if (!up && !down) continue;

    const upShares = up?.shares ?? 0;
    const downShares = down?.shares ?? 0;
    const upAvgPrice = up?.avgPrice ?? 0;
    const downAvgPrice = down?.avgPrice ?? 0;
    const pairedShares = Math.min(upShares, downShares);
    const pairCost =
      pairedShares > 0 && up && down ? upAvgPrice + downAvgPrice : null;
    const pairCostAfterFees =
      pairCost != null ? pairCost * (1 + fee) : null;
    const pairedSpend = pairCost != null ? pairCost * pairedShares : 0;
    const lockedProfit =
      pairCost != null ? pairedShares * (1 - pairCost) : 0;
    const lockedProfitAfterFees =
      pairCostAfterFees != null ? pairedShares * (1 - pairCostAfterFees) : 0;

    summaries.push({
      slug,
      asset: (up ?? down)!.asset,
      intervalMinutes: (up ?? down)!.intervalMinutes,
      upShares,
      downShares,
      upAvgPrice,
      downAvgPrice,
      pairedShares,
      pairCost,
      pairCostAfterFees,
      pairedSpend,
      lockedProfit,
      lockedProfitAfterFees,
      isLockedProfit: pairCost != null && pairCost < 1 && pairedShares > 0,
      isLockedProfitAfterFees:
        pairCostAfterFees != null &&
        pairCostAfterFees < 1 &&
        pairedShares > 0,
      unpairedUpShares: Math.max(0, upShares - pairedShares),
      unpairedDownShares: Math.max(0, downShares - pairedShares),
    });
  }

  return summaries.sort((a, b) => a.asset.localeCompare(b.asset));
}
