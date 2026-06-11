"use client";

import LoginModal from "@/components/LoginModal";
import BotPanel from "@/components/BotPanel";
import BotSettingsDialog from "@/components/BotSettingsDialog";
import HowToPlayDialog from "@/components/HowToPlayDialog";
import CryptoSpotPanel from "@/components/CryptoSpotPanel";
import PairCostSection, { LivePairCostHint } from "@/components/PairCostSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CryptoMarketWindow,
  CryptoOutcome,
  PaperPortfolioView,
  PaperTradeRecord,
} from "@/lib/crypto-types";
import { getWindowStartSecFromSlug } from "@/lib/chainlink-feed";
import { usePolymarketChainlinkPrices } from "@/hooks/usePolymarketChainlinkPrices";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

function formatWaitDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

function getSecondsRemaining(endDate: string, nowMs: number): number {
  return Math.max(0, Math.floor((new Date(endDate).getTime() - nowMs) / 1000));
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}

function formatSyncTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}

export default function CryptoPaperPage() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("50");
  const [message, setMessage] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { getWindowSnapshot } = usePolymarketChainlinkPrices();

  const { data: auth, refetch: refetchAuth } = useQuery<{
    authenticated: boolean;
  }>({
    queryKey: ["auth"],
    queryFn: async () => {
      const res = await fetch("/api/auth");
      return res.json();
    },
  });

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const {
    data: marketsData,
    isLoading: marketsLoading,
    isFetching: marketsFetching,
    isError: marketsError,
    dataUpdatedAt: marketsUpdatedAt,
    refetch: refetchMarkets,
  } = useQuery<{
    markets: CryptoMarketWindow[];
    fetchedAt?: number;
  }>({
    queryKey: ["cryptoMarkets"],
    queryFn: async () => {
      const res = await fetch("/api/crypto/markets", { cache: "no-store" });
      if (!res.ok) throw new Error("获取市场失败");
      return res.json();
    },
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 2,
  });

  const { data: botData } = useQuery<{
    config?: { pairLockMaxCost?: number };
  }>({
    queryKey: ["botStatus"],
    queryFn: async () => {
      const res = await fetch("/api/bot", { cache: "no-store" });
      return res.json();
    },
    refetchInterval: 5000,
  });

  const pairLockMaxCost = botData?.config?.pairLockMaxCost;

  const { data: portfolio } = useQuery<PaperPortfolioView>({
    queryKey: ["cryptoPaper"],
    queryFn: async () => {
      const res = await fetch("/api/crypto/paper", { cache: "no-store" });
      if (!res.ok) throw new Error("获取持仓失败");
      return res.json();
    },
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const activePositions = portfolio?.activePositions ?? portfolio?.account.positions ?? [];
  const pendingSettlement = portfolio?.pendingSettlement ?? [];
  const pendingSlugs = useMemo(
    () => new Set(pendingSettlement.map((p) => p.slug)),
    [pendingSettlement],
  );

  const markets = marketsData?.markets ?? [];
  const pairSummaries = portfolio?.pairSummaries ?? [];
  const priceSyncedAt = marketsData?.fetchedAt ?? marketsUpdatedAt;

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crypto/paper", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重置失败");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cryptoPaper"] });
      setMessage("模拟账户已重置为 $10,000");
    },
    onError: (err) => setMessage(String(err.message || err)),
  });

  const buyMutation = useMutation({
    mutationFn: async (payload: {
      market: CryptoMarketWindow;
      outcome: CryptoOutcome;
      tokenId: string;
    }) => {
      const res = await fetch("/api/crypto/paper/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: payload.market.slug,
          tokenId: payload.tokenId,
          outcome: payload.outcome,
          asset: payload.market.asset,
          intervalMinutes: payload.market.intervalMinutes,
          title: payload.market.title,
          endDate: payload.market.endDate,
          marketId: payload.market.marketId,
          maxPrice: 0,
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "买入失败");
      return data;
    },
    onSuccess: (data) => {
      setMessage(
        `模拟买入成功：${data.shares?.toFixed(2)} 股，花费 $${data.cost?.toFixed(2)}（真实盘口价）`,
      );
      queryClient.invalidateQueries({ queryKey: ["cryptoPaper"] });
    },
    onError: (err) => setMessage(String(err.message || err)),
  });

  const sellMutation = useMutation({
    mutationFn: async (payload: { tokenId: string; shares: number }) => {
      const res = await fetch("/api/crypto/paper/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: payload.tokenId,
          shares: payload.shares,
          minPrice: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "卖出失败");
      return data;
    },
    onSuccess: (data) => {
      setMessage(`模拟卖出成功，收入 $${data.proceeds?.toFixed(2)}（真实盘口价）`);
      queryClient.invalidateQueries({ queryKey: ["cryptoPaper"] });
    },
    onError: (err) => setMessage(String(err.message || err)),
  });

  const history = useMemo(
    () => portfolio?.account.history.slice(0, 20) ?? [],
    [portfolio],
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-lg md:text-xl font-semibold">
            BTC / ETH 5 分钟模拟盘
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            真实 Polymarket 盘口 · 本地虚拟 USDC · 纯模拟不下真单
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HowToPlayDialog />
          <BotSettingsDialog />
          {auth?.authenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              重置模拟账户
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowLoginModal(true)}>
              登录
            </Button>
          )}
        </div>
      </div>

      <BotPanel />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">模拟余额</p>
          <p className="text-xl font-mono font-semibold">
            ${(portfolio?.account.balance ?? 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">持仓市值</p>
          <p className="text-xl font-mono font-semibold">
            ${(portfolio?.positionsValue ?? 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">总权益</p>
          <p className="text-xl font-mono font-semibold">
            ${(portfolio?.totalEquity ?? 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">已实现盈亏</p>
          <p
            className={`text-xl font-mono font-semibold ${(portfolio?.realizedPnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
          >
            {(portfolio?.realizedPnl ?? 0) >= 0 ? "+" : ""}$
            {(portfolio?.realizedPnl ?? 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">未实现盈亏</p>
          <p
            className={`text-xl font-mono font-semibold ${(portfolio?.unrealizedPnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
          >
            {(portfolio?.unrealizedPnl ?? 0) >= 0 ? "+" : ""}$
            {(portfolio?.unrealizedPnl ?? 0).toFixed(2)}
          </p>
        </Card>
      </div>

      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
          <div className="space-y-2 flex-1 max-w-xs">
            <label className="text-sm text-muted-foreground">
              每次模拟买入金额 (USDC)
            </label>
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
            {priceSyncedAt ? (
              <p className="text-xs text-muted-foreground">
                盘口同步于 {formatSyncTime(priceSyncedAt)}
                {marketsFetching ? " · 更新中…" : " · 每 4 秒刷新"}
              </p>
            ) : null}
            {marketsError ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetchMarkets()}
              >
                盘口同步失败，点击重试
              </Button>
            ) : null}
            {message ? (
              <p className="text-sm text-muted-foreground">{message}</p>
            ) : null}
          </div>
        </div>

        {marketsLoading ? (
          <p className="text-center text-muted-foreground py-8">加载市场中...</p>
        ) : markets.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            未找到当前 BTC/ETH 5 分钟窗口，请稍后刷新
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {markets.map((market) => {
              const secondsLeft = getSecondsRemaining(market.endDate, nowMs);
              const isPending = pendingSlugs.has(market.slug);
              const windowEnded = secondsLeft <= 0;

              return (
              <Card key={market.slug} className="p-4 bg-secondary/20">
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div>
                    <p className="font-medium">
                      {market.asset} · {market.intervalMinutes} 分钟
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {market.title}
                    </p>
                    {isPending && (
                      <p className="text-xs text-yellow-500 mt-1">
                        你有持仓等待结算
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    {windowEnded ? (
                      <>
                        <p className="text-yellow-500">本局已结束</p>
                        <p className="text-muted-foreground mt-1">
                          {isPending ? "等待官方结果" : "等待下一窗口"}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground">剩余</p>
                        <p className="font-mono text-primary">
                          {formatCountdown(secondsLeft)}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-3">
                  <CryptoSpotPanel
                    asset={market.asset}
                    slug={market.slug}
                    snapshot={getWindowSnapshot(
                      market.asset,
                      market.slug,
                      getWindowStartSecFromSlug(market.slug),
                    )}
                  />
                </div>

                <LivePairCostHint
                  market={market}
                  pairLockMaxCost={pairLockMaxCost}
                />

                <div className="grid grid-cols-2 gap-2">
                  {market.outcomes.map((o) => (
                    <div
                      key={o.tokenId}
                      className="p-3 rounded-lg border border-border bg-background/50"
                    >
                      <p className="text-sm font-medium">
                        {o.outcome === "Up" ? "涨 Up" : "跌 Down"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        买价 {o.bestAsk != null ? `$${o.bestAsk.toFixed(3)}` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        卖价 {o.bestBid != null ? `$${o.bestBid.toFixed(3)}` : "—"}
                      </p>
                      <Button
                        size="sm"
                        className="w-full mt-2"
                        disabled={
                          buyMutation.isPending ||
                          !market.acceptingOrders ||
                          windowEnded ||
                          o.bestAsk == null
                        }
                        onClick={() =>
                          buyMutation.mutate({
                            market,
                            outcome: o.outcome,
                            tokenId: o.tokenId,
                          })
                        }
                      >
                        模拟买入
                      </Button>
                    </div>
                  ))}
                </div>

                <a
                  href={market.polymarketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-3 inline-block"
                >
                  在 Polymarket 官网查看 →
                </a>
              </Card>
            );
            })}
          </div>
        )}
      </Card>

      <PairCostSection
        summaries={pairSummaries}
        markets={markets}
        pairLockMaxCost={pairLockMaxCost}
      />

      {pendingSettlement.length > 0 && (
        <Card className="p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
          <p className="text-sm font-medium text-yellow-500 mb-2">
            等待结算（{pendingSettlement.length} 笔）
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            本局 5 分钟窗口已结束，但 Polymarket 官方尚未公布涨跌结果。系统每 3
            秒自动查询，通常 1–3 分钟内会结算并显示在下方「模拟成交记录」。只有
            <strong className="text-foreground">持有到窗口结束</strong>
            的仓位才会出现在这里。
          </p>
          <div className="space-y-2">
            {pendingSettlement.map((p) => {
              const endedMs = new Date(p.endDate).getTime();
              const waitingMs = nowMs - endedMs;
              return (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm border border-border rounded-lg p-2"
              >
                <span>
                  {p.asset} {p.intervalMinutes}m ·{" "}
                  {p.outcome === "Up" ? "涨" : "跌"} · {p.shares.toFixed(2)} 股
                </span>
                <span className="text-muted-foreground font-mono text-xs sm:text-sm">
                  成本 ${p.costBasis.toFixed(2)} · 已等待{" "}
                  {formatWaitDuration(waitingMs)}
                </span>
              </div>
            );
            })}
          </div>
        </Card>
      )}

      {activePositions.length > 0 && (
        <Card className="p-4 mb-6 overflow-x-auto">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            进行中持仓（可提前卖出）
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>市场</TableHead>
                <TableHead>方向</TableHead>
                <TableHead className="text-right">股数</TableHead>
                <TableHead className="text-right">成本</TableHead>
                <TableHead className="text-right">到期</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activePositions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[220px] truncate">
                    {p.asset} {p.intervalMinutes}m
                  </TableCell>
                  <TableCell>{p.outcome === "Up" ? "涨" : "跌"}</TableCell>
                  <TableCell className="text-right font-mono">
                    {p.shares.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${p.costBasis.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatTime(p.endDate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sellMutation.isPending}
                      onClick={() =>
                        sellMutation.mutate({
                          tokenId: p.tokenId,
                          shares: p.shares,
                        })
                      }
                    >
                      模拟卖出
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="p-4 overflow-x-auto">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            模拟成交记录
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            结算行「金额」为兑付额（输方 $0）；真实盈亏见「盈亏」列。同一窗口 Up/Down 各一行，需合并看净值。
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>市场</TableHead>
                <TableHead>方向</TableHead>
                <TableHead className="text-right">股数</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead className="text-right">盈亏</TableHead>
                <TableHead>说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h: PaperTradeRecord) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTime(new Date(h.executedAt).toISOString())}
                  </TableCell>
                  <TableCell>
                    {h.type === "buy"
                      ? "买入"
                      : h.type === "sell"
                        ? "卖出"
                        : "结算"}
                  </TableCell>
                  <TableCell>
                    {h.asset} {h.intervalMinutes}m
                  </TableCell>
                  <TableCell>{h.outcome === "Up" ? "涨" : "跌"}</TableCell>
                  <TableCell className="text-right font-mono">
                    {h.shares.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${h.amount.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${
                      h.pnl == null
                        ? "text-muted-foreground"
                        : h.pnl >= 0
                          ? "text-green-500"
                          : "text-red-500"
                    }`}
                  >
                    {h.pnl == null
                      ? "—"
                      : `${h.pnl >= 0 ? "+" : ""}$${h.pnl.toFixed(2)}`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                    {h.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => {
            refetchAuth();
            setShowLoginModal(false);
          }}
        />
      )}
    </div>
  );
}
