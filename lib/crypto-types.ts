export type CryptoAsset = "BTC" | "ETH";
export type CryptoInterval = 5 | 15;
export type CryptoOutcome = "Up" | "Down";

export interface CryptoOutcomeQuote {
  outcome: CryptoOutcome;
  tokenId: string;
  bestAsk: number | null;
  bestBid: number | null;
  midPrice: number | null;
}

export interface CryptoMarketWindow {
  asset: CryptoAsset;
  intervalMinutes: CryptoInterval;
  slug: string;
  eventId: string;
  marketId: string;
  title: string;
  endDate: string;
  secondsRemaining: number;
  acceptingOrders: boolean;
  closed: boolean;
  polymarketUrl: string;
  outcomes: CryptoOutcomeQuote[];
}

export interface PaperPosition {
  id: string;
  slug: string;
  marketId: string;
  asset: CryptoAsset;
  intervalMinutes: CryptoInterval;
  outcome: CryptoOutcome;
  tokenId: string;
  title: string;
  endDate: string;
  shares: number;
  avgPrice: number;
  costBasis: number;
}

export interface PaperTradeRecord {
  id: string;
  type: "buy" | "sell" | "settle";
  slug: string;
  asset: CryptoAsset;
  intervalMinutes: CryptoInterval;
  outcome: CryptoOutcome;
  shares: number;
  price: number;
  amount: number;
  pnl?: number;
  note?: string;
  executedAt: number;
}

export interface PaperAccount {
  balance: number;
  initialBalance: number;
  positions: PaperPosition[];
  history: PaperTradeRecord[];
  updatedAt: number;
}

export interface PairCostSummary {
  slug: string;
  asset: CryptoAsset;
  intervalMinutes: CryptoInterval;
  upShares: number;
  downShares: number;
  upAvgPrice: number;
  downAvgPrice: number;
  pairedShares: number;
  pairCost: number | null;
  pairCostAfterFees: number | null;
  pairedSpend: number;
  lockedProfit: number;
  lockedProfitAfterFees: number;
  isLockedProfit: boolean;
  isLockedProfitAfterFees: boolean;
  unpairedUpShares: number;
  unpairedDownShares: number;
}

export interface LivePairQuote {
  upAsk: number;
  downAsk: number;
  pairCost: number;
  pairCostAfterFees: number;
  edgePerShare: number;
  edgeAfterFees: number;
  isLockedProfit: boolean;
  isLockedProfitAfterFees: boolean;
  maxPairCostForLock: number;
}

export interface PaperPortfolioView {
  account: PaperAccount;
  activePositions: PaperPosition[];
  pendingSettlement: PaperPosition[];
  pairSummaries: PairCostSummary[];
  positionsValue: number;
  totalEquity: number;
  unrealizedPnl: number;
  realizedPnl: number;
}
