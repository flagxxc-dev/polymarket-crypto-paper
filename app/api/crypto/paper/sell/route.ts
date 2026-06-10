import { NextResponse } from "next/server";
import { paperSell } from "@/lib/paper-trading";

export async function POST(request: Request) {
  try {
    const { tokenId, shares, minPrice } = await request.json();

    if (!tokenId || !shares) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const result = await paperSell({
      tokenId,
      shares: Number(shares),
      minPrice: Number(minPrice ?? 0),
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
