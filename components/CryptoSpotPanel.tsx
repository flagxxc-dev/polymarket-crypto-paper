"use client";

import {
  buildWindowSnapshot,
  formatDelta,
  formatDeltaPct,
  formatUsdPrice,
  getWindowStartSecFromSlug,
  WindowSpotSnapshot,
} from "@/lib/chainlink-feed";
import { CryptoAsset } from "@/lib/crypto-types";
import { useEffect, useMemo, useRef, useState } from "react";

function Sparkline({
  points,
  openPrice,
  leading,
}: {
  points: { t: number; v: number }[];
  openPrice: number | null;
  leading: "Up" | "Down" | null;
}) {
  const width = 280;
  const height = 52;

  const path = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((p) => p.v);
    const min = Math.min(...values, openPrice ?? values[0]);
    const max = Math.max(...values, openPrice ?? values[0]);
    const range = max - min || 1;

    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - ((point.v - min) / range) * (height - 8) - 4;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, openPrice]);

  const openY = useMemo(() => {
    if (openPrice == null || points.length < 2) return null;
    const values = points.map((p) => p.v);
    const min = Math.min(...values, openPrice);
    const max = Math.max(...values, openPrice);
    const range = max - min || 1;
    return height - ((openPrice - min) / range) * (height - 8) - 4;
  }, [points, openPrice]);

  if (!path) {
    return (
      <div className="h-[52px] flex items-center text-xs text-muted-foreground">
        收集本局走势中…
      </div>
    );
  }

  const stroke = leading === "Up" ? "#22c55e" : leading === "Down" ? "#ef4444" : "#94a3b8";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[52px]"
      preserveAspectRatio="none"
      aria-hidden
    >
      {openY != null ? (
        <line
          x1="0"
          y1={openY}
          x2={width}
          y2={openY}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeDasharray="4 3"
        />
      ) : null}
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function CryptoSpotPanel({
  asset,
  slug,
  snapshot,
}: {
  asset: CryptoAsset;
  slug: string;
  snapshot: WindowSpotSnapshot | null;
}) {
  const [fallbackSnapshot, setFallbackSnapshot] =
    useState<WindowSpotSnapshot | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  const chainlinkReady =
    !!snapshot &&
    snapshot.connected &&
    snapshot.openPrice != null &&
    snapshot.current != null;
  const effective = chainlinkReady
    ? snapshot
    : (fallbackSnapshot ?? snapshot);
  const windowStartSec = getWindowStartSecFromSlug(slug);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    setFallbackSnapshot(null);
  }, [slug]);

  useEffect(() => {
    if (!windowStartSec) return;

    let cancelled = false;
    const load = async () => {
      const live = snapshotRef.current;
      const chainlinkReady =
        !!live &&
        live.connected &&
        live.openPrice != null &&
        live.current != null &&
        live.windowPoints.length >= 2;

      if (chainlinkReady) {
        setFallbackSnapshot(null);
        return;
      }

      setFallbackLoading(true);
      try {
        const res = await fetch(
          `/api/crypto/spot?asset=${asset}&slug=${encodeURIComponent(slug)}&windowStart=${windowStartSec}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setFallbackSnapshot(
          buildWindowSnapshot({
            points: data.windowPoints ?? [],
            windowStartMs: windowStartSec * 1000,
            current: data.current ?? null,
            currentAt: data.currentAt ?? Date.now(),
            connected: !!data.connected,
            source: "binance",
          }),
        );
      } finally {
        if (!cancelled) setFallbackLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [asset, slug, windowStartSec]);

  if (!effective) {
    return (
      <div className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
        {fallbackLoading ? "加载 Chainlink 参考价…" : "等待价格数据…"}
      </div>
    );
  }

  const deltaClass =
    effective.delta == null
      ? "text-muted-foreground"
      : effective.delta >= 0
        ? "text-green-500"
        : "text-red-500";

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Chainlink 现货走势
          {effective.source === "binance" ? "（币安参考）" : ""}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {effective.connected ? "实时" : "同步中"}
          {effective.leading ? (
            <span
              className={
                effective.leading === "Up" ? " text-green-500" : " text-red-500"
              }
            >
              {" "}
              · 当前{effective.leading === "Up" ? "涨" : "跌"}领先
            </span>
          ) : null}
        </p>
      </div>

      <Sparkline
        points={effective.windowPoints}
        openPrice={effective.openPrice}
        leading={effective.leading}
      />

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">开盘价 </span>
          <span className="font-mono">{formatUsdPrice(effective.openPrice, asset)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">现价 </span>
          <span className="font-mono">{formatUsdPrice(effective.current, asset)}</span>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">较开盘 </span>
          <span className={`font-mono ${deltaClass}`}>
            {formatDelta(effective.delta)} ({formatDeltaPct(effective.deltaPct)})
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        虚线为本局开盘价（Price to Beat）。现价 ≥ 开盘价 → 涨 Up 领先；反之跌 Down 领先。
      </p>
    </div>
  );
}
