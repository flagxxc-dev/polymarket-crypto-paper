"use client";

import {
  buildWindowSnapshot,
  chainlinkSymbolToAsset,
  CHAINLINK_SYMBOL,
  PricePoint,
  WindowSpotSnapshot,
} from "@/lib/chainlink-feed";
import { CryptoAsset } from "@/lib/crypto-types";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = "wss://ws-live-data.polymarket.com";
const TRACKED_ASSETS: CryptoAsset[] = ["BTC", "ETH"];

interface AssetFeedState {
  current: number | null;
  currentAt: number | null;
  points: PricePoint[];
  connected: boolean;
  source: "chainlink" | "binance";
}

function emptyAssetState(): AssetFeedState {
  return {
    current: null,
    currentAt: null,
    points: [],
    connected: false,
    source: "chainlink",
  };
}

export function usePolymarketChainlinkPrices() {
  const [assets, setAssets] = useState<Record<CryptoAsset, AssetFeedState>>({
    BTC: emptyAssetState(),
    ETH: emptyAssetState(),
  });
  const pointsRef = useRef<Record<CryptoAsset, PricePoint[]>>({
    BTC: [],
    ETH: [],
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    const ingestPoint = (asset: CryptoAsset, t: number, v: number) => {
      if (!Number.isFinite(t) || !Number.isFinite(v)) return;

      const bucket = pointsRef.current[asset];
      const last = bucket[bucket.length - 1];
      if (last && last.t === t && last.v === v) return;

      bucket.push({ t, v });
      if (bucket.length > 600) {
        pointsRef.current[asset] = bucket.slice(-600);
      }

      setAssets((prev) => ({
        ...prev,
        [asset]: {
          ...prev[asset],
          current: v,
          currentAt: t,
          points: [...pointsRef.current[asset]],
          connected: true,
          source: "chainlink",
        },
      }));
    };

    const handleMessage = (raw: string) => {
      let msg: {
        topic?: string;
        payload?: {
          symbol?: string;
          timestamp?: number;
          value?: number;
          data?: { timestamp: number; value: number }[];
        };
      };

      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      const payload = msg.payload;
      if (!payload?.symbol) return;

      const asset = chainlinkSymbolToAsset(payload.symbol);
      if (!asset) return;

      if (Array.isArray(payload.data)) {
        for (const row of payload.data) {
          ingestPoint(asset, row.timestamp, row.value);
        }
        return;
      }

      if (msg.topic === "crypto_prices_chainlink" && payload.value != null) {
        ingestPoint(asset, payload.timestamp ?? Date.now(), payload.value);
      }
    };

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        for (const asset of TRACKED_ASSETS) {
          ws?.send(
            JSON.stringify({
              action: "subscribe",
              subscriptions: [
                {
                  topic: "crypto_prices_chainlink",
                  type: "*",
                  filters: JSON.stringify({
                    symbol: CHAINLINK_SYMBOL[asset],
                  }),
                },
              ],
            }),
          );
        }
      };

      ws.onmessage = (event) => handleMessage(String(event.data));

      ws.onclose = () => {
        if (!alive) return;
        setAssets((prev) => ({
          BTC: { ...prev.BTC, connected: false },
          ETH: { ...prev.ETH, connected: false },
        }));
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const getWindowSnapshot = useCallback(
    (asset: CryptoAsset, slug: string, windowStartSec: number | null) => {
      if (!windowStartSec) return null;
      const feed = assets[asset];
      return buildWindowSnapshot({
        points: feed.points,
        windowStartMs: windowStartSec * 1000,
        current: feed.current,
        currentAt: feed.currentAt,
        connected: feed.connected,
        source: feed.source,
      });
    },
    [assets],
  );

  return { getWindowSnapshot, assets };
}

export type { WindowSpotSnapshot };
