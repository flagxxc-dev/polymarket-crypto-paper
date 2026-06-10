import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const AUTH_COOKIE = "trade_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  const { username, password } = await request.json();
  const correctUsername = process.env.TRADE_USERNAME?.trim();
  const correctPassword = process.env.TRADE_PASSWORD?.trim();

  if (!correctUsername || !correctPassword) {
    return NextResponse.json(
      { error: "未配置 TRADE_USERNAME / TRADE_PASSWORD" },
      { status: 500 },
    );
  }

  if (username === correctUsername && password === correctPassword) {
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE, "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  }

  await new Promise((r) => setTimeout(r, 2000)); // 2s delay on failure
  return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
}

export async function GET() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE);
  const readonlyMode = process.env.READONLY_MODE !== "false";
  return NextResponse.json({
    authenticated: authCookie?.value === "authenticated",
    readonlyMode,
    liveTradingEnabled: process.env.ENABLE_LIVE_TRADING === "true",
  });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
