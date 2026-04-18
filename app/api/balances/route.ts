import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getBalance } from "@/lib/trade-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();

  const [usdcRes, polRes] = await Promise.allSettled([
    getBalance(),
    (async () => {
      const provider = new ethers.providers.JsonRpcProvider(
        config.api.polygonRpcUrl,
      );
      const wei = await provider.getBalance(config.api.funderAddress);
      return Number.parseFloat(ethers.utils.formatEther(wei));
    })(),
  ]);

  if (usdcRes.status === "rejected") {
    logger.error(`[Balances] USDC fetch failed: ${usdcRes.reason}`);
  }
  if (polRes.status === "rejected") {
    logger.error(`[Balances] POL fetch failed: ${polRes.reason}`);
  }

  return NextResponse.json({
    usdc: usdcRes.status === "fulfilled" ? usdcRes.value : 0,
    pol: polRes.status === "fulfilled" ? polRes.value : 0,
  });
}
