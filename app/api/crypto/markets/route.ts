import { NextResponse } from "next/server";
import { fetchActiveCryptoMarkets } from "@/lib/crypto-markets";

export async function GET() {
  try {
    const markets = await fetchActiveCryptoMarkets();
    return NextResponse.json({ markets });
  } catch (err) {
    return NextResponse.json(
      { error: "获取市场失败", markets: [] },
      { status: 500 },
    );
  }
}
