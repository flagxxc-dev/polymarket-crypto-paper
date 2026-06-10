import { NextResponse } from "next/server";
import { paperBuy } from "@/lib/paper-trading";
import {
  CryptoAsset,
  CryptoInterval,
  CryptoOutcome,
} from "@/lib/crypto-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      slug,
      tokenId,
      outcome,
      asset,
      intervalMinutes,
      title,
      endDate,
      marketId,
      maxPrice,
      amount,
    } = body;

    if (
      !slug ||
      !tokenId ||
      !outcome ||
      !asset ||
      !intervalMinutes ||
      !marketId
    ) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const result = await paperBuy({
      slug,
      tokenId,
      outcome: outcome as CryptoOutcome,
      asset: asset as CryptoAsset,
      intervalMinutes: Number(intervalMinutes) as CryptoInterval,
      title: title || slug,
      endDate: endDate || new Date().toISOString(),
      marketId,
      maxPrice: Number(maxPrice),
      amount: Number(amount),
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
