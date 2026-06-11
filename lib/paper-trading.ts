import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchCryptoMarketBySlug,
  getCryptoPaperConfig,
  getLiveBidPrice,
  getWindowEndMsFromSlug,
  getWindowEndIsoFromSlug,
  resolveWinningOutcome,
} from "./crypto-markets";
import {
  calculateExecutionPreview,
  calculateSellPreview,
  getOrderbook,
} from "./trade-client";
import {
  CryptoAsset,
  CryptoInterval,
  CryptoOutcome,
  PaperAccount,
  PaperPortfolioView,
  PaperPosition,
  PaperTradeRecord,
} from "./crypto-types";
import { calcBuyFee, calcSellFee, getPaperTradingParams } from "./paper-fees";
import { computePairCostSummary } from "./pair-cost";

const DATA_PATH = join(process.cwd(), "data", "paper-trading.json");

function ensureDataDir() {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function createEmptyAccount(): PaperAccount {
  const initialBalance = getCryptoPaperConfig().paper.initialBalance;
  return {
    balance: initialBalance,
    initialBalance,
    positions: [],
    history: [],
    updatedAt: Date.now(),
  };
}

function loadAccount(): PaperAccount {
  ensureDataDir();
  if (!existsSync(DATA_PATH)) {
    const account = createEmptyAccount();
    saveAccount(account);
    return account;
  }
  return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as PaperAccount;
}

function saveAccount(account: PaperAccount) {
  ensureDataDir();
  account.updatedAt = Date.now();
  writeFileSync(DATA_PATH, JSON.stringify(account, null, 2));
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mergePosition(
  positions: PaperPosition[],
  next: PaperPosition,
): PaperPosition[] {
  const idx = positions.findIndex((p) => p.tokenId === next.tokenId);
  if (idx < 0) return [...positions, next];

  const existing = positions[idx];
  const totalShares = existing.shares + next.shares;
  const totalCost = existing.costBasis + next.costBasis;
  const merged: PaperPosition = {
    ...existing,
    shares: totalShares,
    costBasis: totalCost,
    avgPrice: totalShares > 0 ? totalCost / totalShares : 0,
  };

  return positions.map((p, i) => (i === idx ? merged : p));
}

function getPositionWindowEndMs(position: PaperPosition): number {
  return (
    getWindowEndMsFromSlug(position.slug) ??
    new Date(position.endDate).getTime()
  );
}

function isPositionExpired(position: PaperPosition): boolean {
  return getPositionWindowEndMs(position) <= Date.now();
}

async function settleExpiredPositions(account: PaperAccount): Promise<void> {
  const remaining: PaperPosition[] = [];

  for (const position of account.positions) {
    if (!isPositionExpired(position)) {
      remaining.push(position);
      continue;
    }

    const winner = await resolveWinningOutcome(position.slug);
    if (!winner) {
      remaining.push(position);
      continue;
    }

    const won = position.outcome === winner;
    const payout = won ? position.shares : 0;
    const pnl = payout - position.costBasis;
    account.balance += payout;

    account.history.unshift({
      id: newId("settle"),
      type: "settle",
      slug: position.slug,
      asset: position.asset,
      intervalMinutes: position.intervalMinutes,
      outcome: position.outcome,
      shares: position.shares,
      price: won ? 1 : 0,
      amount: payout,
      pnl,
      note: won
        ? `本局胜出（${winner}），兑 $${payout.toFixed(2)}，盈亏 ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`
        : `本局失败（胜方 ${winner}），亏损 $${Math.abs(pnl).toFixed(2)}`,
      executedAt: Date.now(),
    });
  }

  account.positions = remaining;
}

export async function getPaperPortfolio(): Promise<PaperPortfolioView> {
  const account = loadAccount();
  await settleExpiredPositions(account);
  saveAccount(account);

  const activePositions: PaperPosition[] = [];
  const pendingSettlement: PaperPosition[] = [];

  for (const position of account.positions) {
    if (isPositionExpired(position)) {
      pendingSettlement.push(position);
    } else {
      activePositions.push(position);
    }
  }

  let positionsValue = 0;
  let costBasis = 0;

  for (const position of activePositions) {
    const bid = await getLiveBidPrice(position.tokenId);
    const mark = bid > 0 ? bid : position.avgPrice;
    positionsValue += mark * position.shares;
    costBasis += position.costBasis;
  }

  for (const position of pendingSettlement) {
    costBasis += position.costBasis;
  }

  const realizedPnl = account.history
    .filter((h) => h.type === "sell" || h.type === "settle")
    .reduce((sum, h) => sum + (h.pnl ?? 0), 0);

  return {
    account: { ...account, positions: activePositions },
    activePositions,
    pendingSettlement,
    pairSummaries: computePairCostSummary([
      ...activePositions,
      ...pendingSettlement,
    ]),
    positionsValue,
    totalEquity: account.balance + positionsValue,
    unrealizedPnl: positionsValue - costBasis,
    realizedPnl,
  };
}

export function resetPaperAccount(): PaperAccount {
  const account = createEmptyAccount();
  saveAccount(account);
  return account;
}

export async function paperBuy(args: {
  slug: string;
  tokenId: string;
  outcome: CryptoOutcome;
  asset: CryptoAsset;
  intervalMinutes: CryptoInterval;
  title: string;
  endDate: string;
  marketId: string;
  maxPrice: number;
  amount: number;
  note?: string;
}): Promise<{ success: boolean; error?: string; shares?: number; cost?: number }> {
  if (args.amount <= 0) {
    return { success: false, error: "金额必须大于 0" };
  }

  const account = loadAccount();
  await settleExpiredPositions(account);

  if (args.amount > account.balance) {
    return { success: false, error: "模拟余额不足" };
  }

  const market = await fetchCryptoMarketBySlug(args.slug);
  if (!market || market.closed || !market.acceptingOrders) {
    return { success: false, error: "该窗口已关闭或不可交易" };
  }

  const book = await getOrderbook(args.tokenId);
  if (!book) {
    return { success: false, error: "无法获取真实订单簿" };
  }

  const params = getPaperTradingParams();
  const minutesToExpiry = Math.max(market.secondsRemaining / 60, 0.01);
  const daysToExpiry = minutesToExpiry / (60 * 24);
  const liveProbe = calculateExecutionPreview(book, 1, daysToExpiry, args.amount);
  const liveBestAsk = liveProbe.bestAsk;
  const ceilingFromBook =
    liveBestAsk != null ? liveBestAsk + params.buySlippage : args.maxPrice;
  const effectiveMaxPrice = Math.min(
    args.maxPrice > 0
      ? Math.max(args.maxPrice, ceilingFromBook)
      : ceilingFromBook,
    0.99,
  );
  const preview = calculateExecutionPreview(
    book,
    effectiveMaxPrice,
    daysToExpiry,
    args.amount,
  );

  if (preview.shares <= 0 || preview.totalCost <= 0) {
    const askHint =
      liveBestAsk != null ? `（当前最低卖价约 $${liveBestAsk.toFixed(3)}）` : "";
    return {
      success: false,
      error: `按当前真实盘口无法成交${askHint}，可能卖盘为空或网络超时，请稍后重试`,
    };
  }

  if (preview.shares < params.minOrderShares) {
    return {
      success: false,
      error: `成交股数 ${preview.shares.toFixed(2)} 低于最小 ${params.minOrderShares} 股，请加大金额`,
    };
  }

  const buyFee = calcBuyFee(preview.totalCost);
  const totalDebit = preview.totalCost + buyFee;

  if (totalDebit > account.balance) {
    return { success: false, error: "模拟余额不足（含手续费）" };
  }

  account.balance -= totalDebit;
  const costWithFee = preview.totalCost + buyFee;
  const avgWithFee = costWithFee / preview.shares;
  const windowEndIso =
    getWindowEndIsoFromSlug(args.slug) || args.endDate || market.endDate;
  account.positions = mergePosition(account.positions, {
    id: newId("pos"),
    slug: args.slug,
    marketId: args.marketId,
    asset: args.asset,
    intervalMinutes: args.intervalMinutes,
    outcome: args.outcome,
    tokenId: args.tokenId,
    title: args.title,
    endDate: windowEndIso,
    shares: preview.shares,
    avgPrice: avgWithFee,
    costBasis: costWithFee,
  });

  account.history.unshift({
    id: newId("buy"),
    type: "buy",
    slug: args.slug,
    asset: args.asset,
    intervalMinutes: args.intervalMinutes,
    outcome: args.outcome,
    shares: preview.shares,
    price: avgWithFee,
    amount: totalDebit,
    note: args.note ?? `模拟买入（盘口 $${preview.avgPrice.toFixed(3)} + 手续费 $${buyFee.toFixed(2)}）`,
    executedAt: Date.now(),
  });

  saveAccount(account);
  return {
    success: true,
    shares: preview.shares,
    cost: totalDebit,
  };
}

export async function paperSell(args: {
  tokenId: string;
  shares: number;
  minPrice: number;
}): Promise<{ success: boolean; error?: string; proceeds?: number }> {
  if (args.shares <= 0) {
    return { success: false, error: "卖出数量必须大于 0" };
  }

  const account = loadAccount();
  await settleExpiredPositions(account);

  const positionIdx = account.positions.findIndex(
    (p) => p.tokenId === args.tokenId,
  );
  if (positionIdx < 0) {
    return { success: false, error: "未找到对应模拟持仓" };
  }

  const position = account.positions[positionIdx];
  if (isPositionExpired(position)) {
    return {
      success: false,
      error: "本局已结束，请等待自动结算（无需手动卖出）",
    };
  }
  if (args.shares > position.shares + 1e-9) {
    return { success: false, error: "卖出数量超过持仓" };
  }

  const book = await getOrderbook(args.tokenId);
  if (!book) {
    return { success: false, error: "无法获取真实订单簿" };
  }

  const preview = calculateSellPreview(book, args.shares, args.minPrice);
  if (preview.fillableShares <= 0 || preview.proceeds <= 0) {
    return { success: false, error: "按当前真实买盘无法成交，请降低最低卖价" };
  }

  const soldShares = preview.fillableShares;
  const grossProceeds = preview.proceeds;
  const sellFee = calcSellFee(grossProceeds);
  const proceeds = grossProceeds - sellFee;
  const costReleased = position.avgPrice * soldShares;
  const pnl = proceeds - costReleased;

  account.balance += proceeds;

  const remainingShares = position.shares - soldShares;
  if (remainingShares <= 1e-9) {
    account.positions = account.positions.filter((_, i) => i !== positionIdx);
  } else {
    account.positions[positionIdx] = {
      ...position,
      shares: remainingShares,
      costBasis: position.avgPrice * remainingShares,
    };
  }

  account.history.unshift({
    id: newId("sell"),
    type: "sell",
    slug: position.slug,
    asset: position.asset,
    intervalMinutes: position.intervalMinutes,
    outcome: position.outcome,
    shares: soldShares,
    price: preview.avgPrice,
    amount: proceeds,
    pnl,
    note: `模拟卖出（gross $${grossProceeds.toFixed(2)} - 手续费 $${sellFee.toFixed(2)}）`,
    executedAt: Date.now(),
  });

  saveAccount(account);
  return { success: true, proceeds };
}
