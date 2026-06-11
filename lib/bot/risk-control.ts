import { CryptoAsset, PaperPortfolioView } from "../crypto-types";
import { appendBotLog } from "./state";
import { BotConfig, BotRuntimeState } from "./types";

const HALT_LOG_INTERVAL_MS = 60_000;

export interface RiskMetrics {
  equity: number;
  dayStartEquity: number;
  dayPnl: number;
  dayPnlPct: number;
  sessionPeakEquity: number;
  drawdownFromPeakPct: number;
  dayPeakProfit: number;
  drawdownFromDayProfitPct: number;
}

export function computeRiskEquity(portfolio: PaperPortfolioView): number {
  const positionCost = [
    ...portfolio.activePositions,
    ...portfolio.pendingSettlement,
  ].reduce((sum, p) => sum + p.costBasis, 0);
  return portfolio.account.balance + positionCost;
}

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export function ensureRiskState(state: BotRuntimeState) {
  if (!state.risk) {
    state.risk = {
      halted: false,
      haltPending: false,
      awaitingSettlement: false,
      haltReason: null,
      dayStartDate: todayKey(),
      dayStartEquity: 0,
      sessionPeakEquity: 0,
      dayPeakProfit: 0,
      lastCheckAt: 0,
      lastHaltLogAt: 0,
    };
  }
  return state.risk!;
}

export function rollDailyRiskBaseline(
  state: BotRuntimeState,
  equity: number,
): void {
  const risk = ensureRiskState(state);
  const today = todayKey();
  if (risk.dayStartDate !== today || risk.dayStartEquity <= 0) {
    risk.dayStartDate = today;
    risk.dayStartEquity = equity;
    risk.sessionPeakEquity = equity;
    risk.dayPeakProfit = 0;
  }
}

export function updateRiskPeaks(state: BotRuntimeState, equity: number): void {
  const risk = ensureRiskState(state);
  if (equity > risk.sessionPeakEquity) {
    risk.sessionPeakEquity = equity;
  }
  const dayProfit = equity - risk.dayStartEquity;
  if (dayProfit > risk.dayPeakProfit) {
    risk.dayPeakProfit = dayProfit;
  }
  risk.lastCheckAt = Date.now();
}

export function computeRiskMetrics(
  state: BotRuntimeState,
  equity: number,
): RiskMetrics {
  const risk = ensureRiskState(state);
  const dayPnl = equity - risk.dayStartEquity;
  const dayPnlPct =
    risk.dayStartEquity > 0 ? dayPnl / risk.dayStartEquity : 0;
  const drawdownFromPeakPct =
    risk.sessionPeakEquity > 0
      ? (risk.sessionPeakEquity - equity) / risk.sessionPeakEquity
      : 0;
  const profitGiveback =
    risk.dayPeakProfit > 0 ? risk.dayPeakProfit - dayPnl : 0;
  const drawdownFromDayProfitPct =
    risk.dayPeakProfit > 0 ? profitGiveback / risk.dayPeakProfit : 0;

  return {
    equity,
    dayStartEquity: risk.dayStartEquity,
    dayPnl,
    dayPnlPct,
    sessionPeakEquity: risk.sessionPeakEquity,
    drawdownFromPeakPct,
    dayPeakProfit: risk.dayPeakProfit,
    drawdownFromDayProfitPct,
  };
}

export function hasPendingSettlement(portfolio: PaperPortfolioView): boolean {
  return portfolio.pendingSettlement.length > 0;
}

/** 当前窗口内有未配平单边仓 = 进行中的交易 */
export function hasUnfinishedTrade(
  portfolio: PaperPortfolioView,
  state: BotRuntimeState,
  config: BotConfig,
): boolean {
  for (const asset of config.assets) {
    const assetState = state.assets[asset];
    if (!assetState?.currentSlug) continue;

    const slugPositions = portfolio.activePositions.filter(
      (p) => p.asset === asset && p.slug === assetState.currentSlug,
    );
    const up = slugPositions.find((p) => p.outcome === "Up");
    const down = slugPositions.find((p) => p.outcome === "Down");

    if ((up && !down) || (down && !up)) return true;
    if (assetState.phase === "directional" && slugPositions.length > 0) {
      return true;
    }
  }
  return false;
}

function detectRiskBreach(
  metrics: RiskMetrics,
  config: BotConfig,
): string | null {
  const rc = config.riskControl;
  if (!rc.enabled) return null;

  if (metrics.dayPnlPct <= -rc.dayLossLimitPct) {
    return `日亏损 ${(metrics.dayPnlPct * 100).toFixed(2)}% 触及上限 ${(rc.dayLossLimitPct * 100).toFixed(0)}%`;
  }

  if (rc.drawdownMode === "from_day_profit") {
    if (
      metrics.dayPeakProfit > 0 &&
      metrics.drawdownFromDayProfitPct >= rc.drawdownLimitPct
    ) {
      return `日内盈利回撤 ${(metrics.drawdownFromDayProfitPct * 100).toFixed(1)}% 触及上限`;
    }
  } else if (metrics.drawdownFromPeakPct >= rc.drawdownLimitPct) {
    return `权益峰值回撤 ${(metrics.drawdownFromPeakPct * 100).toFixed(2)}% 触及上限 ${(rc.drawdownLimitPct * 100).toFixed(0)}%`;
  }

  return null;
}

export function shouldBlockNewEntries(state: BotRuntimeState): boolean {
  const risk = ensureRiskState(state);
  return risk.halted || risk.haltPending;
}

export function shouldAllowStrategyTick(state: BotRuntimeState): boolean {
  const risk = ensureRiskState(state);
  if (!risk.halted) return true;
  return risk.haltPending;
}

function noteRiskHalt(
  state: BotRuntimeState,
  message: string,
  level: "warn" | "info" = "warn",
) {
  const risk = ensureRiskState(state);
  const now = Date.now();
  if (now - risk.lastHaltLogAt > HALT_LOG_INTERVAL_MS) {
    risk.lastHaltLogAt = now;
    appendBotLog(state, level, message);
  }
}

export function triggerRiskHalt(
  state: BotRuntimeState,
  reason: string,
  portfolio: PaperPortfolioView,
  config: BotConfig,
): void {
  const risk = ensureRiskState(state);
  if (risk.halted && !risk.haltPending) return;

  risk.haltReason = reason;

  if (hasUnfinishedTrade(portfolio, state, config)) {
    risk.haltPending = true;
    noteRiskHalt(
      state,
      `封控触发（${reason}），等待当前交易结束后再暂停新开仓`,
    );
    return;
  }

  risk.haltPending = false;
  risk.halted = true;
  if (hasPendingSettlement(portfolio)) {
    risk.awaitingSettlement = true;
    noteRiskHalt(
      state,
      `封控已生效：${reason}。有未结算持仓，等待结算完成（不开新单）`,
    );
  } else {
    risk.awaitingSettlement = false;
    noteRiskHalt(state, `封控已生效：${reason}。已暂停新开仓`);
  }
}

export function finalizeRiskHaltIfReady(
  state: BotRuntimeState,
  portfolio: PaperPortfolioView,
  config: BotConfig,
): void {
  const risk = ensureRiskState(state);

  if (risk.haltPending && !hasUnfinishedTrade(portfolio, state, config)) {
    risk.haltPending = false;
    risk.halted = true;
    if (hasPendingSettlement(portfolio)) {
      risk.awaitingSettlement = true;
      noteRiskHalt(
        state,
        `当前交易已结束，封控生效。等待未结算持仓完成`,
        "info",
      );
    } else {
      noteRiskHalt(state, `当前交易已结束，封控生效`, "info");
    }
  }

  if (
    risk.halted &&
    risk.awaitingSettlement &&
    !hasPendingSettlement(portfolio) &&
    !hasUnfinishedTrade(portfolio, state, config)
  ) {
    risk.awaitingSettlement = false;
    noteRiskHalt(
      state,
      `未结算持仓已清零，封控维持中。手动点「解除封控」后可恢复`,
      "info",
    );
  }
}

export function refreshRiskMetrics(
  state: BotRuntimeState,
  portfolio: PaperPortfolioView,
  config: BotConfig,
): RiskMetrics {
  const equity = computeRiskEquity(portfolio);
  rollDailyRiskBaseline(state, equity);
  updateRiskPeaks(state, equity);
  finalizeRiskHaltIfReady(state, portfolio, config);
  return computeRiskMetrics(state, equity);
}

/** 仅在 Bot tick 运行时调用，可触发封控 */
export function evaluateRiskOnTick(
  state: BotRuntimeState,
  portfolio: PaperPortfolioView,
  config: BotConfig,
): RiskMetrics {
  const metrics = refreshRiskMetrics(state, portfolio, config);

  if (!ensureRiskState(state).halted) {
    const breach = detectRiskBreach(metrics, config);
    if (breach) {
      triggerRiskHalt(state, breach, portfolio, config);
    }
  }

  return metrics;
}

export function resumeRiskControl(state: BotRuntimeState): void {
  const risk = ensureRiskState(state);
  risk.halted = false;
  risk.haltPending = false;
  risk.awaitingSettlement = false;
  risk.haltReason = null;
  risk.lastHaltLogAt = 0;
  appendBotLog(state, "info", "封控已手动解除，可恢复新开仓");
}
