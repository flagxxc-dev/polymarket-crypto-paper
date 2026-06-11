import { fetchActiveCryptoMarkets } from "../crypto-markets";
import { CryptoAsset } from "../crypto-types";
import { getPaperPortfolio } from "../paper-trading";
import { getBotConfig } from "./config-io";
import { ensureChainlinkFeed } from "../chainlink-server";
import {
  evaluateRiskOnTick,
  refreshRiskMetrics,
  shouldAllowStrategyTick,
} from "./risk-control";
import {
  appendBotLog,
  getAssetState,
  loadBotState,
  saveBotState,
} from "./state";
import { runDirectionalStrategy, runPairArbStrategy } from "./strategy-btc";

let tickTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function isBotEngineRunning(): boolean {
  return tickTimer != null;
}

async function botTick() {
  if (ticking) return;
  ticking = true;

  const state = loadBotState();
  if (!state.running) {
    ticking = false;
    return;
  }

  try {
    const config = getBotConfig();
    state.lastTickAt = Date.now();
    state.tickCount += 1;

    const { markets } = await fetchActiveCryptoMarkets();
    const portfolio = await getPaperPortfolio();

    evaluateRiskOnTick(state, portfolio, config);

    if (!shouldAllowStrategyTick(state)) {
      for (const asset of config.assets) {
        if (state.risk?.halted) {
          getAssetState(state, asset).phase = "risk_halted";
        }
      }
      state.lastError = null;
      saveBotState(state);
      ticking = false;
      return;
    }

    for (const asset of config.assets) {
      const market = markets.find(
        (m) => m.asset === asset && m.intervalMinutes === config.intervalMinutes,
      );
      const assetState = getAssetState(state, asset as CryptoAsset);

      if (!market) {
        appendBotLog(state, "warn", `[${asset}] 未找到 5m 窗口`);
        continue;
      }

      if (config.strategy === "pair_arb" || config.strategy === "combined") {
        await runPairArbStrategy(
          market,
          config,
          state,
          assetState,
          portfolio,
        );
      }

      if (config.strategy === "directional" || config.strategy === "combined") {
        await runDirectionalStrategy(
          market,
          config,
          state,
          assetState,
          portfolio,
        );
      }
    }

    state.lastError = null;
    saveBotState(state);
  } catch (err) {
    state.lastError = String(err);
    appendBotLog(state, "error", state.lastError);
    saveBotState(state);
  } finally {
    ticking = false;
  }
}

export function startBotEngine() {
  const state = loadBotState();
  if (tickTimer) return state;

  const config = getBotConfig();
  state.running = true;
  state.startedAt = state.startedAt ?? Date.now();
  appendBotLog(
    state,
    "info",
    `Bot 已启动（${config.assets.join("+")} · ${config.strategy} · ${config.mode} · Chainlink 方向信号）`,
  );
  void ensureChainlinkFeed();
  saveBotState(state);

  void botTick();
  tickTimer = setInterval(() => void botTick(), config.tickIntervalMs);
  return state;
}

export function stopBotEngine() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  const state = loadBotState();
  state.running = false;
  for (const asset of getBotConfig().assets) {
    getAssetState(state, asset).phase = "idle";
  }
  appendBotLog(state, "info", "Bot 已停止");
  saveBotState(state);
  return state;
}

/** 服务/容器重启后，状态文件仍 running 但内存 tick 丢失时自动续跑 */
export function resumeBotEngineIfNeeded() {
  const state = loadBotState();
  if (!state.running || tickTimer) return state;

  const config = getBotConfig();
  appendBotLog(state, "info", "Bot 引擎已恢复（服务重启后自动续跑）");
  void ensureChainlinkFeed();
  saveBotState(state);

  void botTick();
  tickTimer = setInterval(() => void botTick(), config.tickIntervalMs);
  return state;
}

export async function getBotStatus() {
  resumeBotEngineIfNeeded();
  const state = loadBotState();
  const config = getBotConfig();
  const portfolio = await getPaperPortfolio();
  const riskMetrics = refreshRiskMetrics(state, portfolio, config);
  saveBotState(state);

  return {
    ...state,
    config,
    engineRunning: isBotEngineRunning(),
    riskMetrics,
  };
}
