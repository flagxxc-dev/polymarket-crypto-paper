import { NextResponse } from "next/server";
import { loadOpportunities, isRejected } from "@/lib/persistence";
import { isStockScannerEnabled } from "@/lib/security";

export async function GET() {
  if (!isStockScannerEnabled()) {
    return NextResponse.json([]);
  }

  const opportunities = loadOpportunities();

  const filtered = opportunities
    .map((event) => ({
      ...event,
      brackets: event.brackets.filter(
        (b) => !isRejected(b.marketId, b.strikePrice),
      ),
    }))
    .filter((event) => event.brackets.length > 0);

  return NextResponse.json(filtered);
}
