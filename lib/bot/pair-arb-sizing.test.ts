import { describe, it, expect } from "vitest";
import { computeEqualSharePairBudgets } from "./pair-arb-sizing";

describe("computeEqualSharePairBudgets", () => {
  it("allocates similar share counts on both legs", () => {
    const { shareTarget, upAmount, downAmountForShares } =
      computeEqualSharePairBudgets({
        orderAmountUsd: 40,
        upAsk: 0.28,
        downAsk: 0.64,
      });

    expect(shareTarget).toBeGreaterThan(40);
    const downAmount = downAmountForShares(shareTarget);
    expect(upAmount + downAmount).toBeLessThanOrEqual(40.5);
    expect(upAmount / 0.28).toBeCloseTo(downAmount / 0.64, 0);
  });
});
