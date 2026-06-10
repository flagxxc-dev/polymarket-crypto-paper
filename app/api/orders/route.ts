import { NextResponse } from "next/server";
import { getOpenOrders, cancelOpenOrder } from "@/lib/trade-client";
import { isAuthenticated } from "@/lib/auth";
import { assertLiveTradingEnabled } from "@/lib/security";
import { logger } from "@/lib/logger";

export async function GET() {
  const blocked = assertLiveTradingEnabled();
  if (blocked) return blocked;

  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const orders = await getOpenOrders();
  return NextResponse.json({ orders });
}

export async function DELETE(request: Request) {
  const blocked = assertLiveTradingEnabled();
  if (blocked) return blocked;

  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { orderId } = await request.json();
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }
  logger.info(`[Orders] Cancelling ${orderId}`);
  const success = await cancelOpenOrder(orderId);
  return NextResponse.json({ success });
}
