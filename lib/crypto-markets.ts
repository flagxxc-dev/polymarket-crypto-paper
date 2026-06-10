import axios from "axios";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calculateSellPreview,
  getOrderbook,
} from "./trade-client";
import { Orderbook } from "./types";
import {
  CryptoAsset,
  CryptoInterval,
  CryptoMarketWindow,
  CryptoOutcome,
  CryptoOutcomeQuote,
} from "./crypto-types";

interface CryptoPaperConfig {
  assets: CryptoAsset[];
  intervalsMinutes: CryptoInterval[];
  paper: {
    initialBalance: number;
    currency: string;
  };
  api: {
    gammaApiUrl: string;
    clobApiUrl: string;
  };
}

interface GammaMarket {
  id: string;
  question?: string;
  outcomes?: string;
  clobTokenIds?: string;
  outcomePrices?: string;
  bestBid?: number;
  bestAsk?: number;
  acceptingOrders?: boolean;
  closed?: boolean;
  endDate?: string;
  umaResolutionStatus?: string;
  closedTime?: string;
}

interface GammaEvent {
  id: string;
  slug?: string;
  title?: string;
  endDate?: string;
  closed?: boolean;
  markets?: GammaMarket[];
}

let cachedConfig: CryptoPaperConfig | null = null;

const orderbookCache = new Map<
  string,
  { book: Orderbook; fetchedAt: number }
>();
const ORDERBOOK_CACHE_MS = 2500;
const ORDERBOOK_TIMEOUT_MS = 6000;

async function getOrderbookCached(tokenId: string): Promise<Orderbook | null> {
  const cached = orderbookCache.get(tokenId);
  if (cached && Date.now() - cached.fetchedAt < ORDERBOOK_CACHE_MS) {
    return cached.book;
  }

  const book = await getOrderbook(tokenId, ORDERBOOK_TIMEOUT_MS);
  if (book) {
    orderbookCache.set(tokenId, { book, fetchedAt: Date.now() });
  }
  return book;
}

export function getCryptoPaperConfig(): CryptoPaperConfig {
  if (cachedConfig) return cachedConfig;
  const path = join(process.cwd(), "config", "crypto-paper.json");
  cachedConfig = JSON.parse(readFileSync(path, "utf-8"));
  return cachedConfig!;
}

function intervalStartSeconds(intervalMinutes: CryptoInterval): number {
  const intervalSeconds = intervalMinutes * 60;
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / intervalSeconds) * intervalSeconds;
}

function buildSlug(
  asset: CryptoAsset,
  intervalMinutes: CryptoInterval,
  timestamp: number,
): string {
  return `${asset.toLowerCase()}-updown-${intervalMinutes}m-${timestamp}`;
}

/** Window end time derived from slug (more accurate than API endDate for 5m/15m). */
export function getWindowEndMsFromSlug(slug: string): number | null {
  const match = slug.match(/^(btc|eth)-updown-(5|15)m-(\d+)$/i);
  if (!match) return null;
  const intervalMinutes = Number.parseInt(match[2], 10) as CryptoInterval;
  const startSec = Number.parseInt(match[3], 10);
  return (startSec + intervalMinutes * 60) * 1000;
}

export function getWindowEndIsoFromSlug(slug: string): string | null {
  const ms = getWindowEndMsFromSlug(slug);
  return ms != null ? new Date(ms).toISOString() : null;
}

function parseJsonArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as T[];
  } catch {
    return [];
  }
}

function getBestAskFromBook(
  asks: { price: number; size: number }[],
): number | null {
  for (const ask of asks.sort((a, b) => a.price - b.price)) {
    if (ask.size >= 1 || ask.price * ask.size >= 1) return ask.price;
  }
  return asks[0]?.price ?? null;
}

function getBestBidFromBook(
  bids: { price: number; size: number }[],
): number | null {
  for (const bid of bids.sort((a, b) => b.price - a.price)) {
    if (bid.size >= 1 || bid.price * bid.size >= 1) return bid.price;
  }
  return bids[0]?.price ?? null;
}

async function quoteOutcome(tokenId: string): Promise<{
  bestAsk: number | null;
  bestBid: number | null;
  midPrice: number | null;
}> {
  const book = await getOrderbookCached(tokenId);
  if (!book) {
    return { bestAsk: null, bestBid: null, midPrice: null };
  }

  const asks = book.asks
    .map((a) => ({
      price: Number.parseFloat(a.price),
      size: Number.parseFloat(a.size),
    }))
    .filter((a) => !Number.isNaN(a.price) && !Number.isNaN(a.size));
  const bids = book.bids
    .map((b) => ({
      price: Number.parseFloat(b.price),
      size: Number.parseFloat(b.size),
    }))
    .filter((b) => !Number.isNaN(b.price) && !Number.isNaN(b.size));

  const bestAsk = getBestAskFromBook(asks);
  const bestBid = getBestBidFromBook(bids);
  const midPrice =
    bestAsk != null && bestBid != null
      ? (bestAsk + bestBid) / 2
      : (bestAsk ?? bestBid);

  return { bestAsk, bestBid, midPrice };
}

async function fetchEventBySlug(
  slug: string,
): Promise<GammaEvent | null> {
  const config = getCryptoPaperConfig();
  try {
    const res = await axios.get(`${config.api.gammaApiUrl}/events`, {
      params: { slug },
      timeout: 10000,
    });
    const events = (res.data || []) as GammaEvent[];
    return events[0] ?? null;
  } catch {
    return null;
  }
}

async function buildMarketWindow(
  asset: CryptoAsset,
  intervalMinutes: CryptoInterval,
): Promise<CryptoMarketWindow | null> {
  const timestamp = intervalStartSeconds(intervalMinutes);
  const slug = buildSlug(asset, intervalMinutes, timestamp);
  const event = await fetchEventBySlug(slug);
  const market = event?.markets?.[0];
  if (!event || !market) return null;

  const labels = parseJsonArray<string>(market.outcomes);
  const tokenIds = parseJsonArray<string>(market.clobTokenIds);
  const gammaPrices = parseJsonArray<string>(market.outcomePrices).map(Number);

  const outcomes: CryptoOutcomeQuote[] = [];
  const outcomeTasks: Promise<CryptoOutcomeQuote | null>[] = [];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label !== "Up" && label !== "Down") continue;
    const tokenId = tokenIds[i];
    if (!tokenId) continue;

    outcomeTasks.push(
      (async () => {
        const live = await quoteOutcome(tokenId);
        return {
          outcome: label,
          tokenId,
          bestAsk: live.bestAsk,
          bestBid: live.bestBid,
          midPrice:
            live.midPrice ??
            (Number.isFinite(gammaPrices[i]) ? gammaPrices[i] : null),
        };
      })(),
    );
  }

  const quoted = await Promise.all(outcomeTasks);
  for (const row of quoted) {
    if (row) outcomes.push(row);
  }

  if (outcomes.length === 0) return null;

  const slugEndIso =
    getWindowEndIsoFromSlug(slug) ||
    market.endDate ||
    event.endDate ||
    new Date().toISOString();
  const windowEndMs = new Date(slugEndIso).getTime();
  const secondsRemaining = Math.max(
    0,
    Math.floor((windowEndMs - Date.now()) / 1000),
  );

  return {
    asset,
    intervalMinutes,
    slug,
    eventId: event.id,
    marketId: market.id,
    title: event.title || market.question || slug,
    endDate: slugEndIso,
    secondsRemaining,
    acceptingOrders: market.acceptingOrders !== false && !market.closed,
    closed: !!market.closed || !!event.closed,
    polymarketUrl: `https://polymarket.com/event/${slug}`,
    outcomes,
  };
}

export async function fetchActiveCryptoMarkets(): Promise<{
  markets: CryptoMarketWindow[];
  fetchedAt: number;
}> {
  const config = getCryptoPaperConfig();
  const tasks: Promise<CryptoMarketWindow | null>[] = [];

  for (const asset of config.assets) {
    for (const intervalMinutes of config.intervalsMinutes) {
      tasks.push(buildMarketWindow(asset, intervalMinutes));
    }
  }

  const results = await Promise.all(tasks);
  return {
    markets: results
      .filter((r): r is CryptoMarketWindow => r != null)
      .sort((a, b) => {
        if (a.asset !== b.asset) return a.asset.localeCompare(b.asset);
        return a.intervalMinutes - b.intervalMinutes;
      }),
    fetchedAt: Date.now(),
  };
}

export async function fetchCryptoMarketBySlug(
  slug: string,
): Promise<CryptoMarketWindow | null> {
  const match = slug.match(/^(btc|eth)-updown-(5|15)m-/i);
  if (!match) return null;
  const asset = match[1].toUpperCase() as CryptoAsset;
  const intervalMinutes = Number.parseInt(match[2], 10) as CryptoInterval;
  const event = await fetchEventBySlug(slug);
  if (!event) return null;

  const timestamp = intervalStartSeconds(intervalMinutes);
  const expectedSlug = buildSlug(asset, intervalMinutes, timestamp);
  if (event.slug !== slug && slug !== expectedSlug) {
    // Still allow lookup by explicit slug from positions/history.
  }

  const market = event.markets?.[0];
  if (!market) return null;

  const labels = parseJsonArray<string>(market.outcomes);
  const tokenIds = parseJsonArray<string>(market.clobTokenIds);
  const outcomeTasks: Promise<CryptoOutcomeQuote | null>[] = [];

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label !== "Up" && label !== "Down") continue;
    const tokenId = tokenIds[i];
    if (!tokenId) continue;
    outcomeTasks.push(
      (async () => {
        const live = await quoteOutcome(tokenId);
        return {
          outcome: label as CryptoOutcome,
          tokenId,
          ...live,
        };
      })(),
    );
  }

  const quoted = await Promise.all(outcomeTasks);
  const outcomes = quoted.filter((o): o is CryptoOutcomeQuote => o != null);

  const endDate =
    getWindowEndIsoFromSlug(event.slug || slug) ||
    market.endDate ||
    event.endDate ||
    new Date().toISOString();
  const windowEndMs = new Date(endDate).getTime();
  return {
    asset,
    intervalMinutes,
    slug: event.slug || slug,
    eventId: event.id,
    marketId: market.id,
    title: event.title || market.question || slug,
    endDate,
    secondsRemaining: Math.max(
      0,
      Math.floor((windowEndMs - Date.now()) / 1000),
    ),
    acceptingOrders: market.acceptingOrders !== false && !market.closed,
    closed: !!market.closed || !!event.closed,
    polymarketUrl: `https://polymarket.com/event/${event.slug || slug}`,
    outcomes,
  };
}

export async function getLiveBidPrice(tokenId: string): Promise<number> {
  const book = await getOrderbookCached(tokenId);
  if (!book) return 0;
  const preview = calculateSellPreview(book, 1, 0);
  return preview.avgPrice;
}

export async function resolveWinningOutcome(
  slug: string,
): Promise<CryptoOutcome | null> {
  const event = await fetchEventBySlug(slug);
  const market = event?.markets?.[0];
  if (!market) return null;

  const labels = parseJsonArray<string>(market.outcomes);
  const prices = parseJsonArray<string>(market.outcomePrices).map(Number);
  if (labels.length === 0 || prices.length === 0) return null;

  const windowEndMs =
    getWindowEndMsFromSlug(slug) ??
    new Date(market.endDate || event.endDate || 0).getTime();
  const pastWindow = Date.now() >= windowEndMs;

  let winnerIdx = -1;
  let maxPrice = -1;
  prices.forEach((price, idx) => {
    if (price > maxPrice) {
      maxPrice = price;
      winnerIdx = idx;
    }
  });

  if (winnerIdx < 0) return null;
  const label = labels[winnerIdx];
  if (label !== "Up" && label !== "Down") return null;

  const officiallyResolved =
    !!market.closed ||
    !!event?.closed ||
    market.umaResolutionStatus === "resolved" ||
    !!market.closedTime;

  // Clear winner once prices snap (e.g. ["0","1"] or ["0.02","0.98"])
  if (maxPrice >= 0.9) return label;

  if (officiallyResolved && maxPrice >= 0.5) return label;

  // Trading halted after window, even if closed flag lags
  if (pastWindow && market.acceptingOrders === false && maxPrice >= 0.5) {
    return label;
  }

  return null;
}
