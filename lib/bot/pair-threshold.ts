import { maxPairCostForLock } from "../paper-fees";
import { BotConfig } from "./types";

/** 策略与页面共用的配对锁利上限（配平比） */
export function getPairLockThreshold(config: BotConfig): number {
  if (
    config.pairLockMaxCost != null &&
    config.pairLockMaxCost > 0 &&
    config.pairLockMaxCost <= 1
  ) {
    return config.pairLockMaxCost;
  }
  return maxPairCostForLock();
}
