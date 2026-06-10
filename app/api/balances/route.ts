import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getBalance } from "@/lib/trade-client";
import { assertLiveTradingEnabled } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = assertLiveTradingEnabled();
  if (blocked) return blocked;

  try {
    const usdc = await getBalance();
    return NextResponse.json({ usdc });
  } catch (err) {
    logger.error(`[Balances] USDC fetch failed: ${err}`);
    return NextResponse.json({ usdc: 0 });
  }
}
