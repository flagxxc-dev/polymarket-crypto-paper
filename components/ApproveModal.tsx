"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ExecutionPreview } from "@/lib/trade-client";
import { BracketOpportunity } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  bracket: BracketOpportunity;
  daysToExpiry: number;
  ticker: string;
  currentStockPrice: number;
  userShares: number;
  balance: number;
  existingShares: number;
  existingAvgPrice: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ApproveModal({
  bracket,
  daysToExpiry,
  ticker,
  currentStockPrice,
  userShares,
  balance,
  existingShares,
  existingAvgPrice,
  onClose,
  onSuccess,
}: Props) {
  // Price = the max we'll pay, defaulted to the current best ask. We start from
  // the (possibly stale) scan-time ask, then seed it to the LIVE best ask once
  // the first preview lands. The ref locks auto-seeding once it has happened or
  // the user has taken control of the field, so we never override their input.
  const [maxPrice, setMaxPrice] = useState(bracket.currentNoPrice.toFixed(3));
  const priceSeededRef = useRef(false);
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [maxAmountEdited, setMaxAmountEdited] = useState(false);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Only refetch when maxPrice changes, or when user edits maxAmount.
  // When not edited, cap by available balance so the auto-filled amount is the
  // min of what the balance and the orderbook allow.
  const effectiveMaxAmount = maxAmountEdited
    ? maxAmount
    : balance > 0
      ? String(balance)
      : undefined;

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      try {
        let url = `/api/orderbook/${bracket.noTokenId}?maxPrice=${maxPrice}&daysToExpiry=${daysToExpiry}`;
        if (effectiveMaxAmount) url += `&maxAmount=${effectiveMaxAmount}`;
        const res = await fetch(url);
        const data = await res.json();
        setPreview(data.preview);
        // Seed the limit to the LIVE best ask once, so it opens at the real
        // price to pay instead of a stale scan value that may sit below it.
        if (!priceSeededRef.current && data.preview?.bestAsk != null) {
          priceSeededRef.current = true;
          setMaxPrice(data.preview.bestAsk.toFixed(3));
        }
        // Show available amount in input (without triggering edited state)
        if (!maxAmountEdited && data.preview?.totalCost) {
          setMaxAmount(data.preview.totalCost.toFixed(2));
        }
      } catch {
        setPreview(null);
      }
      setLoading(false);
    };

    const timer = setTimeout(fetchPreview, 300);
    return () => clearTimeout(timer);
  }, [
    maxPrice,
    effectiveMaxAmount,
    bracket.noTokenId,
    daysToExpiry,
    maxAmountEdited,
  ]);

  const handleExecute = async () => {
    const parsedPrice = Number.parseFloat(maxPrice);
    const parsedAmount = maxAmount ? Number.parseFloat(maxAmount) : NaN;
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setResult({ success: false, message: "Enter a valid max price" });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setResult({ success: false, message: "Enter a valid amount ($)" });
      return;
    }
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: bracket.marketId,
          noTokenId: bracket.noTokenId,
          strikePrice: bracket.strikePrice,
          maxPrice: parsedPrice,
          maxAmount: parsedAmount,
        }),
      });
      if (res.status === 401) {
        setResult({
          success: false,
          message: "Not authenticated - please login",
        });
        setExecuting(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setResult({
          success: true,
          message: `Bought ${data.sharesBought.toFixed(2)} shares @ $${data.avgPrice.toFixed(3)} avg`,
        });
        onSuccess();
      } else {
        setResult({
          success: false,
          message: data.error
            ? `Trade failed: ${data.error}`
            : "Trade failed - no shares bought",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
    setExecuting(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Execute Trade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{bracket.question}</p>

          <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Strike</p>
              <p className="font-mono font-semibold">
                ${bracket.strikePrice.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delta</p>
              <p
                className={`font-mono font-semibold ${bracket.delta > 0 ? "text-primary" : "text-destructive"}`}
              >
                {bracket.delta > 0 ? "+" : ""}
                {bracket.delta.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Price</label>
              <Input
                type="number"
                step="0.001"
                min="0.01"
                max="0.999"
                value={maxPrice}
                onChange={(e) => {
                  priceSeededRef.current = true;
                  setMaxPrice(e.target.value);
                }}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Amount ($)
              </label>
              <Input
                type="number"
                step="1"
                min="1"
                value={maxAmount}
                onChange={(e) => {
                  setMaxAmount(e.target.value);
                  setMaxAmountEdited(true);
                }}
                className="font-mono"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading...
            </p>
          ) : preview && preview.shares === 0 ? (
            <div className="p-3 rounded-lg text-sm bg-amber-500/15 text-amber-400 space-y-2">
              {preview.bestAsk != null ? (
                <>
                  <p>
                    No shares fillable at max ${Number(maxPrice).toFixed(3)} —
                    the current best ask is ${preview.bestAsk.toFixed(3)}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      priceSeededRef.current = true;
                      setMaxPrice(preview.bestAsk!.toFixed(3));
                    }}
                  >
                    Raise to ${preview.bestAsk.toFixed(3)}
                  </Button>
                </>
              ) : (
                <p>No liquidity available in the order book right now.</p>
              )}
            </div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Shares</p>
                  <p className="font-mono">{preview.shares.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="font-mono">${preview.totalCost.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">APY</p>
                  <p className="font-mono text-primary">
                    {preview.apy.toFixed(2)}%
                  </p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Profit</p>
                  <p className="font-mono text-primary">
                    ${preview.profit.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Hedge P&L Scenarios */}
              {userShares > 0 && currentStockPrice > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded">
                    <p className="text-[10px] text-muted-foreground uppercase">
                      If {ticker} &lt; ${bracket.strikePrice}
                    </p>
                    <p className="font-mono text-green-400 font-semibold">
                      +${((1 - preview.avgPrice) * preview.shares).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      bet profit
                    </p>
                  </div>
                  {(() => {
                    const minStockGain =
                      userShares * (bracket.strikePrice - currentStockPrice);
                    // Include the cost of NO shares already held in this market,
                    // not just the shares about to be bought.
                    const existingHedgeCost = existingShares * existingAvgPrice;
                    const totalHedgeCost =
                      existingHedgeCost + preview.totalCost;
                    const hedgeCostPct =
                      minStockGain > 0
                        ? (totalHedgeCost / minStockGain) * 100
                        : 0;
                    return (
                      <div className="p-3 bg-secondary/50 rounded">
                        <p className="text-[10px] text-muted-foreground uppercase">
                          If {ticker} &ge; ${bracket.strikePrice}
                        </p>
                        <p className="font-mono text-muted-foreground font-semibold">
                          {hedgeCostPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          hedge cost
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          ) : null}

          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.success
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {result.message}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              {result?.success ? "Close" : "Cancel"}
            </Button>
            {!result?.success && (
              <Button
                onClick={handleExecute}
                disabled={
                  executing || !preview || preview.shares === 0 || balance <= 0
                }
                className="flex-1 bg-primary text-primary-foreground"
              >
                {executing
                  ? "Executing..."
                  : balance <= 0
                    ? "No balance"
                    : "Execute"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
