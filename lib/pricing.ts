// Pure price helpers, safe to import from both server and client code.
// Keep this module free of server-only deps (e.g. winston/fs) so it can be
// bundled into client components.

// A market BUY's `price` is a slippage ceiling, not the price paid. Default it
// a touch above the best ask so a normal up-tick between scan and click doesn't
// make the order non-marketable (which silently yields 0 fillable shares).
export const BUY_SLIPPAGE_BUFFER = 0.01;

export function slippageCeiling(bestAsk: number): number {
  return Math.min(0.99, bestAsk + BUY_SLIPPAGE_BUFFER);
}
