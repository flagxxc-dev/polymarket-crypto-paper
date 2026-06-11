/** 与 config/crypto-paper.json 默认值对齐，供客户端安全引用 */
export const DEFAULT_TAKER_FEE_BPS = 100;
export const DEFAULT_PAIR_ARB_MIN_EDGE = 0.02;

export function takerFeeRateFromBps(bps = DEFAULT_TAKER_FEE_BPS): number {
  return bps / 10_000;
}

export function pairFeeMultiplier(bps = DEFAULT_TAKER_FEE_BPS): number {
  return 1 + 2 * takerFeeRateFromBps(bps);
}

export function maxPairCostForLockFromParams(
  pairArbMinEdge = DEFAULT_PAIR_ARB_MIN_EDGE,
  bps = DEFAULT_TAKER_FEE_BPS,
): number {
  return 1 - pairArbMinEdge - 2 * takerFeeRateFromBps(bps);
}
