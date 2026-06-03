import { describe, it, expect } from "vitest";
import {
  calculateSellPreview,
  calculateExecutionPreview,
} from "./trade-client";
import { Orderbook } from "./types";

const book = (bids: [number, number][]): Orderbook => ({
  asks: [],
  bids: bids.map(([price, size]) => ({
    price: String(price),
    size: String(size),
  })),
});

const askBook = (asks: [number, number][]): Orderbook => ({
  bids: [],
  asks: asks.map(([price, size]) => ({
    price: String(price),
    size: String(size),
  })),
});

describe("calculateSellPreview", () => {
  it("returns zeros when there are no bids", () => {
    const r = calculateSellPreview(book([]), 100);
    expect(r).toEqual({ fillableShares: 0, proceeds: 0, avgPrice: 0 });
  });

  it("fills entirely at the top bid when depth suffices", () => {
    const r = calculateSellPreview(book([[0.9, 200]]), 100);
    expect(r.fillableShares).toBe(100);
    expect(r.proceeds).toBeCloseTo(90, 6);
    expect(r.avgPrice).toBeCloseTo(0.9, 6);
  });

  it("walks bids high to low and clips the last level", () => {
    // 60 @ 0.90 then 40 @ 0.80 to fill 100 shares
    const r = calculateSellPreview(
      book([
        [0.8, 50],
        [0.9, 60],
      ]),
      100,
    );
    expect(r.fillableShares).toBe(100);
    expect(r.proceeds).toBeCloseTo(0.9 * 60 + 0.8 * 40, 6); // 86
    expect(r.avgPrice).toBeCloseTo(0.86, 6);
  });

  it("excludes bids below the min-price floor", () => {
    // floor 0.85 -> only the 0.90 level (60) is eligible
    const r = calculateSellPreview(
      book([
        [0.8, 100],
        [0.9, 60],
      ]),
      100,
      0.85,
    );
    expect(r.fillableShares).toBe(60);
    expect(r.proceeds).toBeCloseTo(54, 6);
  });

  it("reports partial fill when depth < requested", () => {
    const r = calculateSellPreview(book([[0.9, 30]]), 100);
    expect(r.fillableShares).toBe(30);
    expect(r.proceeds).toBeCloseTo(27, 6);
  });
});

describe("calculateExecutionPreview", () => {
  it("reports the live best ask even when the limit excludes every ask", () => {
    // The bug: best ask drifted up to 0.986 but the user's max price is the
    // stale 0.984. Preview yields 0 shares yet must surface the real ask so the
    // UI can explain it instead of silently disabling the button.
    const r = calculateExecutionPreview(askBook([[0.986, 100]]), 0.984, 30);
    expect(r.shares).toBe(0);
    expect(r.totalCost).toBe(0);
    expect(r.bestAsk).toBeCloseTo(0.986, 6);
  });

  it("fills exactly at the best ask (the price the user pays)", () => {
    const r = calculateExecutionPreview(askBook([[0.993, 100]]), 0.993, 30, 50);
    expect(r.bestAsk).toBeCloseTo(0.993, 6);
    expect(r.shares).toBeGreaterThan(0);
    expect(r.avgPrice).toBeCloseTo(0.993, 6);
  });

  it("reports 0 shares but the live ask when the limit is one tick too low", () => {
    // User lowered the limit to 0.992 while the live ask is 0.993.
    const r = calculateExecutionPreview(askBook([[0.993, 100]]), 0.992, 30);
    expect(r.shares).toBe(0);
    expect(r.bestAsk).toBeCloseTo(0.993, 6);
  });
});
