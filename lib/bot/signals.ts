import { getWindowStartSecFromSlug } from "../chainlink-feed";
import { getChainlinkWindowSignal } from "../chainlink-server";
import { CryptoMarketWindow, CryptoOutcome } from "../crypto-types";
import { computeLivePairQuote } from "../pair-cost";

export function getOutcomeQuote(market: CryptoMarketWindow, outcome: CryptoOutcome) {
  return market.outcomes.find((o) => o.outcome === outcome);
}

export function getPairQuote(market: CryptoMarketWindow) {
  const up = getOutcomeQuote(market, "Up");
  const down = getOutcomeQuote(market, "Down");
  return computeLivePairQuote(up?.bestAsk ?? null, down?.bestAsk ?? null);
}

/** Bot 方向信号：Polymarket Chainlink（与 5m 结算同源） */
export async function getChainlinkSignal(
  market: CryptoMarketWindow,
): Promise<{
  openPrice: number | null;
  current: number | null;
  deltaBps: number | null;
  leading: CryptoOutcome | null;
  source: "chainlink";
  ready: boolean;
}> {
  const windowStart = getWindowStartSecFromSlug(market.slug);
  if (!windowStart) {
    return {
      openPrice: null,
      current: null,
      deltaBps: null,
      leading: null,
      source: "chainlink",
      ready: false,
    };
  }

  return getChainlinkWindowSignal(market.asset, windowStart);
}
