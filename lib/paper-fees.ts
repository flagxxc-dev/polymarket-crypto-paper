import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PaperTradingParams {
  takerFeeBps: number;
  minOrderShares: number;
  buySlippage: number;
  pairArbMinEdge: number;
}

let cached: PaperTradingParams | null = null;

export function getPaperTradingParams(): PaperTradingParams {
  if (cached) return cached;
  const path = join(process.cwd(), "config", "crypto-paper.json");
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const t = raw.trading ?? {};
  cached = {
    takerFeeBps: Number(t.takerFeeBps ?? 100),
    minOrderShares: Number(t.minOrderShares ?? 5),
    buySlippage: Number(t.buySlippage ?? 0.02),
    pairArbMinEdge: Number(t.pairArbMinEdge ?? 0.02),
  };
  return cached;
}

export function takerFeeRate(): number {
  return getPaperTradingParams().takerFeeBps / 10_000;
}

export function calcBuyFee(notional: number): number {
  return notional * takerFeeRate();
}

export function calcSellFee(proceeds: number): number {
  return proceeds * takerFeeRate();
}

/** 双边 taker 后，配对成本需低于此值才有锁利空间 */
export function maxPairCostForLock(): number {
  try {
    const userPath = join(process.cwd(), "data", "bot-settings.json");
    if (existsSync(userPath)) {
      const raw = JSON.parse(readFileSync(userPath, "utf-8")) as {
        pairLockMaxCost?: number;
      };
      const v = Number(raw.pairLockMaxCost);
      if (Number.isFinite(v) && v > 0 && v <= 1) return v;
    }
  } catch {
    /* 使用默认计算 */
  }

  const p = getPaperTradingParams();
  return 1 - p.pairArbMinEdge - 2 * takerFeeRate();
}
