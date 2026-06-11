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

export default function HowToPlayDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">怎么玩</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>怎么玩？（5 分钟看懂）</DialogTitle>
          <DialogDescription>
            BTC / ETH 5 分钟模拟盘 · 真实 Polymarket 盘口
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground leading-relaxed">
          <li>
            Polymarket 每 5 分钟开一个 BTC/ETH 窗口，问：「这 5 分钟涨还是跌？」
          </li>
          <li>
            买 <strong className="text-foreground">Up（涨）</strong> 或{" "}
            <strong className="text-foreground">Down（跌）</strong>
            ，价格来自官网真实订单簿（例如 $0.45 = 花 45¢ 赌 1 美元结果）
          </li>
          <li>
            窗口结束后持仓会进入<strong className="text-foreground">「等待结算」</strong>
            状态（Polymarket 官方通常 1–3 分钟出结果），赢的每股兑 $1，输的归零
          </li>
          <li>
            下方展示 <strong className="text-foreground">Chainlink 开盘价 / 现价 / 差额 / 走势</strong>
            （与 Polymarket 官方结算同源），帮助判断当前涨还是跌领先
          </li>
          <li>
            <strong className="text-foreground">实时配对买价</strong>：Up 买价 +
            Down 买价扣费后 &lt; $1 时窗口会标绿，表示双边买入可锁利
          </li>
        </ol>
        <p className="text-xs text-yellow-500/90 mt-3 leading-relaxed">
          提示：5 分钟盘波动快，先用小金额（如 $20–50）练手。本局结束后无需点「卖出」，等自动结算即可。买入时会按实时盘口 + 2¢ 滑点缓冲撮合。
        </p>
      </DialogContent>
    </Dialog>
  );
}
