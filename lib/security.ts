/** 是否启用股票扫描（已停用则返回空数据） */
export function isStockScannerEnabled(): boolean {
  if (process.env.STOCK_SCANNER_ENABLED === "true") return true;
  return false;
}

/**
 * 是否允许实盘交易 API（approve/sell/orders 等）。
 * 必须同时：显式开启 + 配置私钥和代理钱包地址。
 */
export function isLiveTradingEnabled(): boolean {
  if (process.env.ENABLE_LIVE_TRADING !== "true") return false;
  const key = process.env.POLYGON_PRIVATE_KEY?.trim();
  const funder = process.env.POLYMARKET_FUNDER_ADDRESS?.trim();
  return !!(key && funder);
}

/** 私钥/钱包仅服务端使用，永不通过 API 返回 */
export function assertLiveTradingEnabled(): Response | null {
  if (!isLiveTradingEnabled()) {
    return Response.json(
      { error: "实盘交易未启用（ENABLE_LIVE_TRADING=false 或未配置钱包）" },
      { status: 403 },
    );
  }
  return null;
}
