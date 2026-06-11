import { LivePairQuote } from "./crypto-types";
import {
  maxPairCostForLockFromParams,
  pairFeeMultiplier,
} from "./trading-params";

export function computeLivePairQuote(
  upAsk: number | null,
  downAsk: number | null,
  pairLockMaxCost?: number,
): LivePairQuote | null {
  if (upAsk == null || downAsk == null) return null;

  const pairCost = upAsk + downAsk;
  const pairCostAfterFees = pairCost * pairFeeMultiplier();
  const maxLock =
    pairLockMaxCost != null && pairLockMaxCost > 0 && pairLockMaxCost <= 1
      ? pairLockMaxCost
      : maxPairCostForLockFromParams();

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

export function computeHypotheticalPairCost(
  upPrice: number,
  downPrice: number,
  pairLockMaxCost?: number,
): {
  pairCost: number;
  pairCostAfterFees: number;
  isLockedProfitAfterFees: boolean;
} {
  const pairCost = upPrice + downPrice;
  const pairCostAfterFees = pairCost * pairFeeMultiplier();
  const maxLock =
    pairLockMaxCost != null && pairLockMaxCost > 0 && pairLockMaxCost <= 1
      ? pairLockMaxCost
      : maxPairCostForLockFromParams();
  return {
    pairCost,
    pairCostAfterFees,
    isLockedProfitAfterFees: pairCostAfterFees < maxLock,
  };
}
