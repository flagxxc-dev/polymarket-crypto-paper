import { NextResponse } from "next/server";
import {
  getBotStatus,
  startBotEngine,
  stopBotEngine,
} from "@/lib/bot/engine";
import { saveBotConfig } from "@/lib/bot/config-io";
import { loadBotState, saveBotState } from "@/lib/bot/state";
import { resumeRiskControl } from "@/lib/bot/risk-control";

export async function GET() {
  return NextResponse.json(await getBotStatus());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === "start") {
      return NextResponse.json(startBotEngine());
    }
    if (action === "stop") {
      return NextResponse.json(stopBotEngine());
    }
    if (action === "updateSettings") {
      const config = saveBotConfig({
        pairLockMaxCost:
          body.pairLockMaxCost != null
            ? Number(body.pairLockMaxCost)
            : undefined,
        riskControl: body.riskControl,
      });
      return NextResponse.json({
        ok: true,
        config,
        message: "策略设置已保存并生效",
      });
    }
    if (action === "resumeRisk") {
      const state = loadBotState();
      resumeRiskControl(state);
      saveBotState(state);
      return NextResponse.json({
        ok: true,
        risk: state.risk,
        message: "封控已解除",
      });
    }

    return NextResponse.json(
      { error: "action 必须是 start、stop、updateSettings 或 resumeRisk" },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
