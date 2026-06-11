import { getPaperTradingParams, takerFeeRate } from "../paper-fees";

/** 配对套利：按等量股数预算，避免等额 USD 造成 Up/Down 股数严重失衡 */
export function computeEqualSharePairBudgets(args: {
  orderAmountUsd: number;
  upAsk: number;
  downAsk: number;
}) {
  const fee = takerFeeRate();
  const pairCost = args.upAsk + args.downAsk;
  const shareTarget = args.orderAmountUsd / (pairCost * (1 + fee));

  const legBudget = (ask: number, shares: number) => {
    const notional = shares * ask;
    return notional + notional * fee;
  };

  return {
    shareTarget,
    upAmount: legBudget(args.upAsk, shareTarget),
    downAmountForShares: (shares: number) => legBudget(args.downAsk, shares),
  };
}

export function meetsMinPairShares(shareTarget: number): boolean {
  return shareTarget >= getPaperTradingParams().minOrderShares;
}
