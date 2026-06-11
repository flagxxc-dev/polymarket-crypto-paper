"use client";

import { Card } from "@/components/ui/card";
import {
  CryptoMarketWindow,
  PairCostSummary,
} from "@/lib/crypto-types";
import {
  computeHypotheticalPairCost,
  computeLivePairQuote,
} from "@/lib/pair-cost-client";

function findMarket(
  markets: CryptoMarketWindow[],
  slug: string,
): CryptoMarketWindow | undefined {
  return markets.find((m) => m.slug === slug);
}

function hypotheticalPairCost(
  summary: PairCostSummary,
  market: CryptoMarketWindow | undefined,
  pairLockMaxCost?: number,
): {
  pairCost: number;
  pairCostAfterFees: number;
  isLockedProfitAfterFees: boolean;
} | null {
  if (!market) return null;

  const upAsk = market.outcomes.find((o) => o.outcome === "Up")?.bestAsk;
  const downAsk = market.outcomes.find((o) => o.outcome === "Down")?.bestAsk;

  if (summary.upShares > 0 && summary.downShares === 0 && downAsk != null) {
    return computeHypotheticalPairCost(
      summary.upAvgPrice,
      downAsk,
      pairLockMaxCost,
    );
  }

  if (summary.downShares > 0 && summary.upShares === 0 && upAsk != null) {
    return computeHypotheticalPairCost(
      upAsk,
      summary.downAvgPrice,
      pairLockMaxCost,
    );
  }

  return null;
}

export function LivePairCostHint({
  market,
  pairLockMaxCost,
}: {
  market: CryptoMarketWindow;
  pairLockMaxCost?: number;
}) {
  const upAsk =
    market.outcomes.find((o) => o.outcome === "Up")?.bestAsk ?? null;
  const downAsk =
    market.outcomes.find((o) => o.outcome === "Down")?.bestAsk ?? null;
  const quote = computeLivePairQuote(upAsk, downAsk, pairLockMaxCost);

  if (!quote) {
    return (
      <p className="text-xs text-muted-foreground mb-3">
        实时配对买价：盘口数据不足
      </p>
    );
  }

  const locked = quote.isLockedProfitAfterFees;
  const edgePct =
    quote.pairCostAfterFees > 0
      ? (quote.edgeAfterFees / quote.pairCostAfterFees) * 100
      : 0;

  return (
    <div
      className={`mb-3 rounded-lg border p-2.5 text-xs ${
        locked
          ? "border-green-500/40 bg-green-500/10"
          : "border-border bg-background/40"
      }`}
    >
      <p className="font-medium mb-1">
        实时配对买价
        {locked ? <span className="text-green-500 ml-1">· 可锁利</span> : null}
      </p>
      <p className="font-mono">
        Up ${quote.upAsk.toFixed(3)} + Down ${quote.downAsk.toFixed(3)} ={" "}
        <span className={locked ? "text-green-500 font-semibold" : ""}>
          ${quote.pairCost.toFixed(3)}
        </span>
      </p>
      <p className="text-muted-foreground mt-1">
        扣费后 ${quote.pairCostAfterFees.toFixed(3)}
        {locked
          ? ` · 双边各买 1 股结算收 $1，毛利约 $${quote.edgeAfterFees.toFixed(3)}/对（${edgePct.toFixed(2)}%）`
          : " · 双边同买结算无套利空间"}
      </p>
    </div>
  );
}

export default function PairCostSection({
  summaries,
  markets,
  pairLockMaxCost,
}: {
  summaries: PairCostSummary[];
  markets: CryptoMarketWindow[];
  pairLockMaxCost?: number;
}) {
  if (summaries.length === 0) return null;

  return (
    <Card className="p-4 mb-6">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
        配对成本（下单后实时）
      </p>
      <div className="space-y-3">
        {summaries.map((s) => {
          const market = findMarket(markets, s.slug);
          const hypo = hypotheticalPairCost(s, market, pairLockMaxCost);
          const hasPair = s.pairedShares > 0 && s.pairCost != null;

          return (
            <div
              key={s.slug}
              className="rounded-lg border border-border p-3 text-sm space-y-2"
            >
              <p className="font-medium">
                {s.asset} · {s.intervalMinutes} 分钟
              </p>

              {hasPair ? (
                <div
                  className={
                    s.isLockedProfitAfterFees
                      ? "text-green-500"
                      : "text-foreground"
                  }
                >
                  <p className="font-mono text-xs">
                    已配对 {s.pairedShares.toFixed(2)} 对 · 成本 $
                    {s.pairCost!.toFixed(3)}
                    {s.pairCostAfterFees != null
                      ? `（扣费后 $${s.pairCostAfterFees.toFixed(3)}）`
                      : ""}
                  </p>
                  <p className="text-xs mt-1">
                    {s.isLockedProfitAfterFees
                      ? `锁定利润约 $${s.lockedProfitAfterFees.toFixed(2)}（与涨跌无关）`
                      : `配对成本 ≥ $1，配对段无锁利（${s.isLockedProfit ? "税前<1但扣费后不够" : "买贵了"}）`}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  仅单边持仓，暂无法配对锁利
                </p>
              )}

              {(s.unpairedUpShares > 0 || s.unpairedDownShares > 0) && (
                <p className="text-xs text-yellow-500">
                  未配对单边：
                  {s.unpairedUpShares > 0
                    ? ` Up ${s.unpairedUpShares.toFixed(2)} 股`
                    : ""}
                  {s.unpairedDownShares > 0
                    ? ` Down ${s.unpairedDownShares.toFixed(2)} 股`
                    : ""}
                  （仍承担方向风险）
                </p>
              )}

              {hypo ? (
                <p
                  className={`text-xs font-mono ${
                    hypo.isLockedProfitAfterFees
                      ? "text-green-500"
                      : "text-muted-foreground"
                  }`}
                >
                  补对面后估算配对：
                  ${hypo.pairCost.toFixed(3)}（扣费后 $
                  {hypo.pairCostAfterFees.toFixed(3)}）
                  {hypo.isLockedProfitAfterFees ? " · 可锁利" : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
