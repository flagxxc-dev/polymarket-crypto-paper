export async function register() {
  // 股票对冲定时扫描已停用，仅跑 BTC/ETH 5m 模拟盘
  if (
    process.env.STOCK_SCANNER_ENABLED === "true" &&
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production"
  ) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
