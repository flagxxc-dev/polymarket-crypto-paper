import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getBalance } from "@/lib/trade-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usdc = await getBalance();
    return NextResponse.json({ usdc });
  } catch (err) {
    logger.error(`[Balances] USDC fetch failed: ${err}`);
    return NextResponse.json({ usdc: 0 });
  }
}
