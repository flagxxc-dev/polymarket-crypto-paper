import { NextResponse } from "next/server";
import { getPaperPortfolio, resetPaperAccount } from "@/lib/paper-trading";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  try {
    const portfolio = await getPaperPortfolio();
    return NextResponse.json(portfolio);
  } catch (err) {
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function DELETE() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "重置模拟账户需要登录" }, { status: 401 });
  }

  try {
    const account = resetPaperAccount();
    return NextResponse.json({ success: true, account });
  } catch (err) {
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
