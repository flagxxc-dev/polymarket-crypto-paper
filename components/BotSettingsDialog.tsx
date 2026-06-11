"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface RiskMetrics {
  equity: number;
  dayPnl: number;
  dayPnlPct: number;
  drawdownFromPeakPct: number;
  drawdownFromDayProfitPct: number;
  dayPeakProfit: number;
}

interface BotSettingsData {
  config: {
    pairLockMaxCost: number;
    riskControl: {
      enabled: boolean;
      dayLossLimitPct: number;
      drawdownLimitPct: number;
      drawdownMode: "from_peak_equity" | "from_day_profit";
    };
  };
  risk?: {
    halted: boolean;
    haltPending: boolean;
    awaitingSettlement: boolean;
    haltReason: string | null;
  };
  riskMetrics?: RiskMetrics;
}

function pctToInput(v: number): string {
  return String(Math.round(v * 1000) / 10);
}

function inputToPct(v: string): number {
  return Number(v) / 100;
}

export default function BotSettingsDialog() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<BotSettingsData>({
    queryKey: ["botStatus"],
    queryFn: async () => {
      const res = await fetch("/api/bot", { cache: "no-store" });
      return res.json();
    },
    refetchInterval: 3000,
  });

  const [pairLockMaxCost, setPairLockMaxCost] = useState("0.96");
  const [riskEnabled, setRiskEnabled] = useState(true);
  const [dayLossPct, setDayLossPct] = useState("10");
  const [drawdownPct, setDrawdownPct] = useState("10");
  const [drawdownMode, setDrawdownMode] = useState<
    "from_peak_equity" | "from_day_profit"
  >("from_peak_equity");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!data?.config) return;
    setPairLockMaxCost(String(data.config.pairLockMaxCost ?? 0.96));
    setRiskEnabled(data.config.riskControl.enabled);
    setDayLossPct(pctToInput(data.config.riskControl.dayLossLimitPct));
    setDrawdownPct(pctToInput(data.config.riskControl.drawdownLimitPct));
    setDrawdownMode(data.config.riskControl.drawdownMode);
  }, [data?.config]);

  const save = useMutation({
    mutationFn: async () => {
      const plc = Number(pairLockMaxCost);
      if (!Number.isFinite(plc) || plc <= 0 || plc > 1) {
        throw new Error("配平比须在 0～1 之间（不含 0）");
      }
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSettings",
          pairLockMaxCost: plc,
          riskControl: {
            enabled: riskEnabled,
            dayLossLimitPct: inputToPct(dayLossPct),
            drawdownLimitPct: inputToPct(drawdownPct),
            drawdownMode,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存失败");
      return json;
    },
    onSuccess: (json) => {
      setMessage(json.message || "已保存");
      queryClient.invalidateQueries({ queryKey: ["botStatus"] });
    },
    onError: (err) => setMessage(String(err.message || err)),
  });

  const resumeRisk = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resumeRisk" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "解除失败");
      return json;
    },
    onSuccess: (json) => {
      setMessage(json.message || "封控已解除");
      queryClient.invalidateQueries({ queryKey: ["botStatus"] });
    },
    onError: (err) => setMessage(String(err.message || err)),
  });

  const risk = data?.risk;
  const m = data?.riskMetrics;
  const halted = risk?.halted || risk?.haltPending;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          策略与封控
          {halted ? (
            <span className="ml-1.5 text-red-500 text-xs">封控中</span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>策略与封控设置</DialogTitle>
          <DialogDescription>
            保存到 data/bot-settings.json（Docker 可写）；配平比同步策略与页面绿标
          </DialogDescription>
        </DialogHeader>

        {halted ? (
          <p className="text-xs text-red-500">
            封控中
            {risk?.haltPending ? "（等待当前交易结束）" : ""}
            {risk?.awaitingSettlement ? "（等待结算）" : ""}
            {risk?.haltReason ? ` — ${risk.haltReason}` : ""}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载设置…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                配平比（扣费后配对成本上限，≤ 1）
              </label>
              <Input
                type="number"
                min={0.01}
                max={1}
                step={0.001}
                value={pairLockMaxCost}
                onChange={(e) => setPairLockMaxCost(e.target.value)}
                className="font-mono h-8"
              />
              <p className="text-[10px] text-muted-foreground">
                例 0.96：只有 Up+Down 扣费后 &lt; 0.96 才配对/对冲
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                日亏损上限（% 总权益）
              </label>
              <Input
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                value={dayLossPct}
                onChange={(e) => setDayLossPct(e.target.value)}
                className="font-mono h-8"
                disabled={!riskEnabled}
              />
              <p className="text-[10px] text-muted-foreground">
                建议 8～10%（与回撤对齐）
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">回撤上限（%）</label>
              <Input
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                value={drawdownPct}
                onChange={(e) => setDrawdownPct(e.target.value)}
                className="font-mono h-8"
                disabled={!riskEnabled}
              />
              <select
                className="w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                value={drawdownMode}
                onChange={(e) =>
                  setDrawdownMode(
                    e.target.value as "from_peak_equity" | "from_day_profit",
                  )
                }
                disabled={!riskEnabled}
              >
                <option value="from_peak_equity">相对今日权益峰值</option>
                <option value="from_day_profit">相对今日最高盈利</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskEnabled}
                  onChange={(e) => setRiskEnabled(e.target.checked)}
                />
                启用封控（触发后暂停新开仓）
              </label>
              {m ? (
                <div className="text-xs font-mono space-y-0.5 text-muted-foreground">
                  <p>总权益 ${m.equity.toFixed(2)}</p>
                  <p>
                    日盈亏 {(m.dayPnl >= 0 ? "+" : "") + m.dayPnl.toFixed(2)}（
                    {(m.dayPnlPct * 100).toFixed(2)}%）
                  </p>
                  <p>
                    峰值回撤 {(m.drawdownFromPeakPct * 100).toFixed(2)}%
                    {drawdownMode === "from_day_profit"
                      ? ` · 盈利回撤 ${(m.drawdownFromDayProfitPct * 100).toFixed(1)}%`
                      : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            保存设置
          </Button>
          {risk?.halted ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => resumeRisk.mutate()}
              disabled={resumeRisk.isPending || risk.haltPending}
            >
              解除封控
            </Button>
          ) : null}
          {message ? (
            <span className="text-xs text-muted-foreground">{message}</span>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
