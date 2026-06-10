import { NextResponse } from "next/server";
import { executeTrade } from "@/lib/trade-client";
import { saveTrade } from "@/lib/persistence";
import { isAuthenticated } from "@/lib/auth";
import { assertLiveTradingEnabled } from "@/lib/security";
import { logger } from "@/lib/logger";
import { Trade } from "@/lib/types";

export async function POST(request: Request) {
  const blocked = assertLiveTradingEnabled();
  if (blocked) return blocked;

  if (!(await isAuthenticated())) {
    logger.warn("[Trade] Not authenticated");
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { marketId, noTokenId, strikePrice, maxPrice, maxAmount } =
    await request.json();

  logger.info(
    `[Trade] Executing: strike=$${strikePrice} maxPrice=${maxPrice} maxAmount=${maxAmount || "unlimited"}`,
  );

  if (!noTokenId || !maxPrice) {
    logger.warn("[Trade] Missing required fields");
    return NextResponse.json(
      { error: "缺少必填字段" },
      { status: 400 },
    );
  }

  try {
    if (!maxAmount) {
      return NextResponse.json(
        { error: "金额为必填项" },
        { status: 400 },
      );
    }

    const result = await executeTrade(noTokenId, maxPrice, maxAmount);

    if (result.success) {
      const trade: Trade = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        marketId,
        noTokenId,
        strikePrice,
        sharesBought: result.sharesBought,
        avgPrice: result.avgPrice,
        totalCost: result.totalCost,
        executedAt: Date.now(),
      };
      saveTrade(trade);
      logger.info(
        `[Trade] Success: ${result.sharesBought.toFixed(2)} shares @ $${result.avgPrice.toFixed(3)} = $${result.totalCost.toFixed(2)}`,
      );
    } else {
      logger.info(`[Trade] Failed: ${result.error ?? "No shares bought"}`);
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error(`[Trade] Error: ${err}`);
    return NextResponse.json(
      { success: false, error: "交易失败" },
      { status: 500 },
    );
  }
}
