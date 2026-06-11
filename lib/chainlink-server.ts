import {
  buildWindowSnapshot,
  chainlinkSymbolToAsset,
  CHAINLINK_SYMBOL,
  PricePoint,
} from "./chainlink-feed";
import { CryptoAsset, CryptoOutcome } from "./crypto-types";

const WS_URL = "wss://ws-live-data.polymarket.com";
const TRACKED_ASSETS: CryptoAsset[] = ["BTC", "ETH"];
const MAX_POINTS = 600;
const PING_INTERVAL_MS = 5000;

interface AssetFeedState {
  current: number | null;
  currentAt: number | null;
  points: PricePoint[];
  connected: boolean;
}

function emptyFeed(): AssetFeedState {
  return {
    current: null,
    currentAt: null,
    points: [],
    connected: false,
  };
}

const feeds: Record<CryptoAsset, AssetFeedState> = {
  BTC: emptyFeed(),
  ETH: emptyFeed(),
};

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectPromise: Promise<void> | null = null;
let alive = false;

function ingestPoint(asset: CryptoAsset, t: number, v: number) {
  if (!Number.isFinite(t) || !Number.isFinite(v)) return;

  const feed = feeds[asset];
  const last = feed.points[feed.points.length - 1];
  if (last && last.t === t && last.v === v) {
    feed.current = v;
    feed.currentAt = t;
    feed.connected = true;
    return;
  }

  feed.points.push({ t, v });
  if (feed.points.length > MAX_POINTS) {
    feed.points = feed.points.slice(-MAX_POINTS);
  }
  feed.current = v;
  feed.currentAt = t;
  feed.connected = true;
}

function handleMessage(raw: string) {
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
}

function subscribeAll() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  for (const asset of TRACKED_ASSETS) {
    ws.send(
      JSON.stringify({
        action: "subscribe",
        subscriptions: [
          {
            topic: "crypto_prices_chainlink",
            type: "*",
            filters: JSON.stringify({ symbol: CHAINLINK_SYMBOL[asset] }),
          },
        ],
      }),
    );
  }
}

function scheduleReconnect() {
  if (!alive || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectPromise = null;
    void ensureChainlinkFeed();
  }, 3000);
}

function connectFeed(): Promise<void> {
  if (connectPromise) return connectPromise;

  connectPromise = new Promise<void>((resolve) => {
    alive = true;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      subscribeAll();
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send("PING");
        }
      }, PING_INTERVAL_MS);
      settle();
    };

    ws.onmessage = (event) => handleMessage(String(event.data));

    ws.onclose = () => {
      for (const asset of TRACKED_ASSETS) {
        feeds[asset].connected = false;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (alive) scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };

    setTimeout(settle, 10_000);
  });

  return connectPromise;
}

/** 启动 Polymarket Chainlink WS（Bot / API 共用） */
export function ensureChainlinkFeed(): Promise<void> {
  return connectFeed();
}

export async function getChainlinkWindowSignal(
  asset: CryptoAsset,
  windowStartSec: number,
): Promise<{
  openPrice: number | null;
  current: number | null;
  deltaBps: number | null;
  leading: CryptoOutcome | null;
  source: "chainlink";
  ready: boolean;
}> {
  await ensureChainlinkFeed();

  const feed = feeds[asset];
  const snapshot = buildWindowSnapshot({
    points: feed.points,
    windowStartMs: windowStartSec * 1000,
    current: feed.current,
    currentAt: feed.currentAt,
    connected: feed.connected,
    source: "chainlink",
  });

  const ready =
    feed.connected &&
    snapshot.openPrice != null &&
    snapshot.current != null &&
    snapshot.openPrice > 0;

  if (!ready) {
    return {
      openPrice: snapshot.openPrice,
      current: snapshot.current,
      deltaBps: null,
      leading: null,
      source: "chainlink",
      ready: false,
    };
  }

  const deltaBps =
    ((snapshot.current! - snapshot.openPrice!) / snapshot.openPrice!) * 10_000;
  const leading: CryptoOutcome = snapshot.current! >= snapshot.openPrice! ? "Up" : "Down";

  return {
    openPrice: snapshot.openPrice,
    current: snapshot.current,
    deltaBps,
    leading,
    source: "chainlink",
    ready: true,
  };
}
