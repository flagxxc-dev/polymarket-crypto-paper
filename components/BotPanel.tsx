"use client";

import { Button } from "@/components/ui/button";
import CollapsibleSection from "@/components/CollapsibleSection";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface BotStatus {
  running: boolean;
  engineRunning: boolean;
  tickCount: number;
  lastTickAt: number;
  lastError: string | null;
  config: {
    assets: string[];
    strategy: string;
    mode: string;
    pairArb: { enabled: boolean; orderAmountUsd: number };
    directional: { enabled: boolean; entryAmountUsd: number };
  };
  assets: Record<
    string,
    { phase: string; currentSlug: string | null; pairArbCountThisWindow: number }
  >;
  logs: { at: number; level: string; message: string }[];
}

function formatTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("zh-CN");
}

export default function BotPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BotStatus>({
    queryKey: ["botStatus"],
    queryFn: async () => {
      const res = await fetch("/api/bot", { cache: "no-store" });
      return res.json();
    },
    refetchInterval: 2000,
  });

  const control = useMutation({
    mutationFn: async (action: "start" | "stop") => {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "操作失败");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botStatus"] });
      queryClient.invalidateQueries({ queryKey: ["cryptoPaper"] });
    },
  });

  const running = data?.running && data?.engineRunning;
  const staleRunning = data?.running && !data?.engineRunning;

  const summary = data ? (
    <>
      {running ? "运行中" : staleRunning ? "状态不同步（续跑中…）" : "已停止"}
      {" · "}
      Tick {data.tickCount}
      {data.logs?.[0]?.message
        ? ` · ${data.logs[0].message.slice(0, 40)}`
        : ""}
    </>
  ) : null;

  return (
    <CollapsibleSection
      title="BTC / ETH 自动 Bot（模拟对比）"
      description="全自动交易 BTC + ETH 5m：配对套利 + 方向建仓 + 条件对冲（Chainlink 方向信号）"
      summary={summary}
      defaultOpen={true}
      className="border-primary/30"
      badge={
        running ? (
          <span className="text-xs text-green-500">运行中</span>
        ) : staleRunning ? (
          <span className="text-xs text-yellow-500">续跑中</span>
        ) : null
      }
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={running || control.isPending}
            onClick={() => control.mutate("start")}
          >
            启动
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data?.running || control.isPending}
            onClick={() => control.mutate("stop")}
          >
            停止
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground pt-3">加载 Bot 状态…</p>
      ) : data ? (
        <>
          {staleRunning ? (
            <p className="text-xs text-yellow-500 pt-3 mb-2">
              检测到服务重启后引擎中断，正在自动续跑；若长时间无 Tick 请点「停止」再「启动」
            </p>
          ) : null}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 pt-3">
            <div>
              <span className="text-muted-foreground">状态 </span>
              <span className={running ? "text-green-500" : "text-yellow-500"}>
                {running ? "运行中" : staleRunning ? "续跑中" : "已停止"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">资产 </span>
              {(data.config.assets ?? ["BTC"]).join(" + ")}
            </div>
            <div>
              <span className="text-muted-foreground">策略 </span>
              {data.config.strategy}
            </div>
            <div>
              <span className="text-muted-foreground">Tick </span>
              {data.tickCount} · {formatTime(data.lastTickAt)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {Object.entries(data.assets ?? {}).map(([asset, s]) => (
              <span key={asset} className="mr-3">
                {asset}:{" "}
                {s.phase === "awaiting_settlement"
                  ? "等待上局结算"
                  : s.phase === "risk_halted"
                    ? "封控暂停"
                    : s.phase}
                {s.currentSlug ? ` · ${s.currentSlug.slice(-10)}` : ""}
              </span>
            ))}
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            配对 ${data.config.pairArb.orderAmountUsd}/次 · 方向 $
            {data.config.directional.entryAmountUsd}/次
          </p>
          {data.lastError ? (
            <p className="text-xs text-red-500 mb-2">错误：{data.lastError}</p>
          ) : null}
          <div className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono bg-background/50 rounded-lg p-2 border border-border">
            {(data.logs ?? []).slice(0, 30).map((log, i) => (
              <div key={`${log.at}-${i}`} className="text-muted-foreground">
                <span className="opacity-60">{formatTime(log.at)}</span>{" "}
                <span
                  className={
                    log.level === "trade"
                      ? "text-green-500"
                      : log.level === "warn"
                        ? "text-yellow-500"
                        : log.level === "error"
                          ? "text-red-500"
                          : ""
                  }
                >
                  [{log.level}]
                </span>{" "}
                {log.message}
              </div>
            ))}
            {(data.logs ?? []).length === 0 ? (
              <p className="text-muted-foreground">暂无日志，启动后自动记录</p>
            ) : null}
          </div>
        </>
      ) : null}
    </CollapsibleSection>
  );
}
