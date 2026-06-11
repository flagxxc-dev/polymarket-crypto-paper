import { paperBuy, paperSell } from "../paper-trading";
import { CryptoMarketWindow, CryptoOutcome } from "../crypto-types";
import { getOutcomeQuote } from "./signals";

export async function botPaperBuy(args: {
  market: CryptoMarketWindow;
  outcome: CryptoOutcome;
  amountUsd: number;
  note: string;
}) {
  const quote = getOutcomeQuote(args.market, args.outcome);
  if (!quote?.tokenId) {
    return { success: false, error: "无 tokenId" };
  }

  return paperBuy({
    slug: args.market.slug,
    tokenId: quote.tokenId,
    outcome: args.outcome,
    asset: args.market.asset,
    intervalMinutes: args.market.intervalMinutes,
    title: args.market.title,
    endDate: args.market.endDate,
    marketId: args.market.marketId,
    maxPrice: 0,
    amount: args.amountUsd,
    note: `[Bot] ${args.note}`,
  });
}

export async function botPaperSell(args: {
  tokenId: string;
  shares: number;
  note?: string;
}) {
  return paperSell({
    tokenId: args.tokenId,
    shares: args.shares,
    minPrice: 0,
  });
}
