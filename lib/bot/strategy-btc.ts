import { PaperPortfolioView } from "../crypto-types";
import { getPaperPortfolio } from "../paper-trading";
import { CryptoMarketWindow, CryptoOutcome } from "../crypto-types";
import { botPaperBuy } from "./executor";
import { getPairLockThreshold } from "./pair-threshold";
import { appendBotLog } from "./state";
import {
  applySettlementWait,
  shouldRequirePriorSettlement,
} from "./settlement-guard";
import { shouldBlockNewEntries } from "./risk-control";
import { AssetBotState, BotConfig, BotRuntimeState } from "./types";
import { getChainlinkSignal, getOutcomeQuote, getPairQuote } from "./signals";

export async function runPairArbStrategy(
  market: CryptoMarketWindow,
  config: BotConfig,
  state: BotRuntimeState,
  assetState: AssetBotState,
  portfolio: PaperPortfolioView,
): Promise<void> {
  if (!config.pairArb.enabled) return;
  if (shouldBlockNewEntries(state)) return;
  if (!market.acceptingOrders || market.secondsRemaining < 30) return;

  if (
    shouldRequirePriorSettlement(config) &&
    applySettlementWait(
      state,
      assetState,
      market.asset,
      market.slug,
      portfolio,
    )
  ) {
    return;
  }

  if (assetState.currentSlug !== market.slug) {
    assetState.currentSlug = market.slug;
    assetState.pairArbCountThisWindow = 0;
    assetState.phase = "watching";
  }

  if (assetState.pairArbCountThisWindow >= config.pairArb.maxTradesPerWindow) {
    return;
  }

  const slugPositions = portfolio.activePositions.filter(
    (p) => p.slug === market.slug,
  );
  // 同一窗口已有持仓时不再叠加配对，避免多轮等额买入产生大量未配对敞口
  if (slugPositions.length > 0) {
    return;
  }

  const cooldownMs = config.pairArb.cooldownSeconds * 1000;
  if (Date.now() - assetState.lastPairArbAt < cooldownMs) return;

  const pair = getPairQuote(market);
  if (!pair) return;

  const threshold = getPairLockThreshold(config);
  if (pair.pairCostAfterFees >= threshold) return;

  const half = config.pairArb.orderAmountUsd / 2;
  const up = getOutcomeQuote(market, "Up");
  const down = getOutcomeQuote(market, "Down");
  if (!up?.bestAsk || !down?.bestAsk) return;

  appendBotLog(
    state,
    "trade",
    `[${market.asset}] 配对套利：扣费后 ${pair.pairCostAfterFees.toFixed(3)} < ${threshold.toFixed(3)}`,
  );

  const upRes = await botPaperBuy({
    market,
    outcome: "Up",
    amountUsd: half,
    note: `[${market.asset}] 配对 Up @${up.bestAsk.toFixed(3)}`,
  });

  if (!upRes.success) {
    appendBotLog(state, "warn", `[${market.asset}] 配对买 Up 失败：${upRes.error}`);
    return;
  }

  const downRes = await botPaperBuy({
    market,
    outcome: "Down",
    amountUsd: half,
    note: `[${market.asset}] 配对 Down @${down.bestAsk.toFixed(3)}`,
  });

  if (!downRes.success) {
    appendBotLog(state, "warn", `[${market.asset}] 配对买 Down 失败：${downRes.error}`);
  } else {
    appendBotLog(state, "trade", `[${market.asset}] 配对套利双边成交`);
    assetState.lastPairArbAt = Date.now();
    assetState.pairArbCountThisWindow += 1;
    assetState.phase = "hedged";
  }
}

export async function runDirectionalStrategy(
  market: CryptoMarketWindow,
  config: BotConfig,
  state: BotRuntimeState,
  assetState: AssetBotState,
  portfolio: PaperPortfolioView,
): Promise<void> {
  if (!config.directional.enabled) return;
  if (!market.acceptingOrders) return;

  const slugPositions = portfolio.activePositions.filter(
    (p) => p.slug === market.slug,
  );
  const upPos = slugPositions.find((p) => p.outcome === "Up");
  const downPos = slugPositions.find((p) => p.outcome === "Down");

  if (assetState.currentSlug !== market.slug) {
    assetState.currentSlug = market.slug;
    assetState.phase = slugPositions.length > 0 ? "directional" : "watching";
    assetState.directionalSide = upPos?.outcome ?? downPos?.outcome ?? null;
  }

  const signal = await getChainlinkSignal(market);

  if (
    config.directional.hedgeOnReversal &&
    upPos &&
    !downPos &&
    signal.leading === "Down"
  ) {
    const downAsk = getOutcomeQuote(market, "Down")?.bestAsk;
    if (downAsk != null) {
      const hedgePairCost = upPos.avgPrice + downAsk;
      const threshold = getPairLockThreshold(config);
      if (hedgePairCost < threshold) {
        const amount = upPos.shares * downAsk * 1.05;
        appendBotLog(
          state,
          "trade",
          `[${market.asset}] 对冲 Down：${hedgePairCost.toFixed(3)} < ${threshold.toFixed(3)}`,
        );
        const res = await botPaperBuy({
          market,
          outcome: "Down",
          amountUsd: amount,
          note: `[${market.asset}] 条件对冲 Down`,
        });
        if (res.success) {
          assetState.phase = "hedged";
          appendBotLog(state, "trade", `[${market.asset}] 对冲 Down 成交`);
        } else {
          appendBotLog(state, "warn", `[${market.asset}] 对冲失败：${res.error}`);
        }
        return;
      }
    }
  }

  if (
    config.directional.hedgeOnReversal &&
    downPos &&
    !upPos &&
    signal.leading === "Up"
  ) {
    const upAsk = getOutcomeQuote(market, "Up")?.bestAsk;
    if (upAsk != null) {
      const hedgePairCost = upAsk + downPos.avgPrice;
      const threshold = getPairLockThreshold(config);
      if (hedgePairCost < threshold) {
        const amount = downPos.shares * upAsk * 1.05;
        appendBotLog(
          state,
          "trade",
          `[${market.asset}] 对冲 Up：${hedgePairCost.toFixed(3)} < ${threshold.toFixed(3)}`,
        );
        const res = await botPaperBuy({
          market,
          outcome: "Up",
          amountUsd: amount,
          note: `[${market.asset}] 条件对冲 Up`,
        });
        if (res.success) {
          assetState.phase = "hedged";
          appendBotLog(state, "trade", `[${market.asset}] 对冲 Up 成交`);
        } else {
          appendBotLog(state, "warn", `[${market.asset}] 对冲失败：${res.error}`);
        }
        return;
      }
    }
  }

  if (upPos || downPos) return;

  if (shouldBlockNewEntries(state)) return;

  if (
    shouldRequirePriorSettlement(config) &&
    applySettlementWait(
      state,
      assetState,
      market.asset,
      market.slug,
      portfolio,
    )
  ) {
    return;
  }

  if (market.secondsRemaining < config.directional.minSecondsRemaining) return;

  const cooldownMs = config.directional.cooldownSeconds * 1000;
  if (Date.now() - assetState.lastDirectionalAt < cooldownMs) return;

  if (
    !signal.ready ||
    signal.deltaBps == null ||
    Math.abs(signal.deltaBps) < config.directional.minChainlinkDeltaBps
  ) {
    return;
  }

  const side: CryptoOutcome = signal.leading ?? "Up";
  const ask = getOutcomeQuote(market, side)?.bestAsk;
  if (ask == null) return;
  if (ask > config.directional.maxDirectionalAsk) return;
  if (ask < config.directional.minEntryAsk || ask > config.directional.maxEntryAsk) {
    return;
  }

  appendBotLog(
    state,
    "trade",
    `[${market.asset}] 方向建仓 ${side}：Chainlink ${signal.deltaBps.toFixed(1)} bps，ask $${ask.toFixed(3)}`,
  );

  const res = await botPaperBuy({
    market,
    outcome: side,
    amountUsd: config.directional.entryAmountUsd,
    note: `[${market.asset}] 方向建仓 ${side}`,
  });

  if (res.success) {
    assetState.phase = "directional";
    assetState.directionalSide = side;
    assetState.lastDirectionalAt = Date.now();
    appendBotLog(state, "trade", `[${market.asset}] 方向建仓成功 ${side}`);
  } else {
    appendBotLog(state, "warn", `[${market.asset}] 方向建仓失败：${res.error}`);
  }
}
