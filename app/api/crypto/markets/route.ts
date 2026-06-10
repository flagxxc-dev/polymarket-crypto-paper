import { NextResponse } from "next/server";
import { fetchActiveCryptoMarkets } from "@/lib/crypto-markets";

export async function GET() {
  try {
    const { markets, fetchedAt } = await fetchActiveCryptoMarkets();
    return NextResponse.json({ markets, fetchedAt });
  } catch (err) {
    return NextResponse.json(
      { error: "获取市场失败", markets: [], fetchedAt: Date.now() },
      { status: 500 },
    );
  }
}
