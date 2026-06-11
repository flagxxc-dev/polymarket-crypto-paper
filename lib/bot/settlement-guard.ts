import { CryptoAsset, PaperPortfolioView, PaperPosition } from "../crypto-types";
import { appendBotLog, AssetBotState, BotConfig, BotRuntimeState } from "./state";

const WAIT_LOG_INTERVAL_MS = 60_000;

/** 仅实盘且显式开启时，才等待上局结算回笼 */
export function shouldRequirePriorSettlement(config: BotConfig): boolean {
  return config.mode === "live" && config.requirePriorSettlement;
}

export function getPriorWindowPositions(
  portfolio: PaperPortfolioView,
  asset: CryptoAsset,
  currentSlug: string,
): PaperPosition[] {
  return [...portfolio.activePositions, ...portfolio.pendingSettlement].filter(
    (p) => p.asset === asset && p.slug !== currentSlug,
  );
}

export function applySettlementWait(
  state: BotRuntimeState,
  assetState: AssetBotState,
  asset: CryptoAsset,
  currentSlug: string,
  portfolio: PaperPortfolioView,
): boolean {
  const blocking = getPriorWindowPositions(portfolio, asset, currentSlug);
  if (blocking.length === 0) {
    if (assetState.phase === "awaiting_settlement") {
      assetState.phase = "watching";
      appendBotLog(state, "info", `[${asset}] 上局已结算回笼，恢复开仓`);
    }
    return false;
  }

  const now = Date.now();
  const wasWaiting = assetState.phase === "awaiting_settlement";
  assetState.phase = "awaiting_settlement";

  if (
    !wasWaiting ||
    now - assetState.lastSettlementWaitLogAt > WAIT_LOG_INTERVAL_MS
  ) {
    assetState.lastSettlementWaitLogAt = now;
    const slugs = [...new Set(blocking.map((p) => p.slug.slice(-12)))].join(
      ", ",
    );
    appendBotLog(
      state,
      "info",
      `[${asset}] 等待上局结算回笼（${slugs}），本窗口暂不新开仓`,
    );
  }

  return true;
}
