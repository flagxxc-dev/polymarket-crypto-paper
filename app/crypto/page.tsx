"use client";

import LoginModal from "@/components/LoginModal";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}

export default function CryptoPaperPage() {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("50");
  const [message, setMessage] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { data: auth, refetch: refetchAuth } = useQuery<{
    authenticated: boolean;
  }>({
    queryKey: ["auth"],
    queryFn: async () => {
      const res = await fetch("/api/auth");
      return res.json();
    },
  });

  const { data: marketsData, isLoading: marketsLoading } = useQuery<{
    markets: CryptoMarketWindow[];
  }>({
    queryKey: ["cryptoMarkets"],
    queryFn: async () => {
      const res = await fetch("/api/crypto/markets");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: portfolio } = useQuery<PaperPortfolioView>({
    queryKey: ["cryptoPaper"],
    queryFn: async () => {
      const res = await fetch("/api/crypto/paper");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const activePositions = portfolio?.activePositions ?? portfolio?.account.positions ?? [];
  const pendingSettlement = portfolio?.pendingSettlement ?? [];

  const markets = marketsData?.markets ?? [];

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
      bestAsk: number;
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
          maxPrice: payload.bestAsk,
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
        <div className="flex gap-2">
          {auth?.authenticated ? (
            <Button
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              重置模拟账户
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setShowLoginModal(true)}>
              登录
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 mb-6 space-y-3 text-sm leading-relaxed">
        <p className="font-medium">怎么玩？（5 分钟看懂）</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>
            Polymarket 每 5 分钟开一个 BTC/ETH 窗口，问：「这 5 分钟涨还是跌？」
          </li>
          <li>
            买 <strong className="text-foreground">Up（涨）</strong> 或{" "}
            <strong className="text-foreground">Down（跌）</strong>
            ，价格来自官网真实订单簿（例如 $0.45 = 花 45¢ 赌 1 美元结果）
          </li>
          <li>
            窗口结束后系统会<strong className="text-foreground">自动结算</strong>
            （通常等待 Polymarket 官方 1–3 分钟出结果），赢的每股兑 $1，输的归零
          </li>
          <li>
            下方价格、倒计时、成交逻辑均对接 Polymarket 官方 API；只有余额是本地模拟的
          </li>
        </ol>
        <p className="text-xs text-yellow-500/90">
          提示：5 分钟盘波动快，先用小金额（如 $20–50）练手。本局结束后无需点「卖出」，等自动结算即可。
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
          {message && (
            <p className="text-sm text-muted-foreground flex-1">{message}</p>
          )}
        </div>

        {marketsLoading ? (
          <p className="text-center text-muted-foreground py-8">加载市场中...</p>
        ) : markets.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            未找到当前 BTC/ETH 5 分钟窗口，请稍后刷新
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {markets.map((market) => (
              <Card key={market.slug} className="p-4 bg-secondary/20">
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div>
                    <p className="font-medium">
                      {market.asset} · {market.intervalMinutes} 分钟
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {market.title}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">剩余</p>
                    <p className="font-mono text-primary">
                      {formatCountdown(market.secondsRemaining)}
                    </p>
                  </div>
                </div>

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
                          o.bestAsk == null
                        }
                        onClick={() =>
                          buyMutation.mutate({
                            market,
                            outcome: o.outcome,
                            tokenId: o.tokenId,
                            bestAsk: o.bestAsk ?? 0,
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
            ))}
          </div>
        )}
      </Card>

      {pendingSettlement.length > 0 && (
        <Card className="p-4 mb-6 border-yellow-500/30 bg-yellow-500/5">
          <p className="text-sm font-medium text-yellow-500 mb-2">
            等待结算（{pendingSettlement.length} 笔）
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            本局时间已到，正在等待 Polymarket 官方公布涨跌结果，通常 1–3
            分钟内会自动入账并显示在下方「模拟成交记录」。
          </p>
          <div className="space-y-2">
            {pendingSettlement.map((p) => (
              <div
                key={p.id}
                className="flex justify-between text-sm border border-border rounded-lg p-2"
              >
                <span>
                  {p.asset} {p.intervalMinutes}m ·{" "}
                  {p.outcome === "Up" ? "涨" : "跌"} · {p.shares.toFixed(2)} 股
                </span>
                <span className="text-muted-foreground font-mono">
                  成本 ${p.costBasis.toFixed(2)}
                </span>
              </div>
            ))}
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
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            模拟成交记录
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
