import { CryptoAsset, CryptoOutcome } from "../crypto-types";

export type BotStrategy = "pair_arb" | "directional" | "combined";
export type BotPhase =
  | "idle"
  | "watching"
  | "directional"
  | "hedged"
  | "cooldown"
  | "awaiting_settlement"
  | "risk_halted";

export type DrawdownMode = "from_peak_equity" | "from_day_profit";

export interface BotRiskControlConfig {
  enabled: boolean;
  dayLossLimitPct: number;
  drawdownLimitPct: number;
  drawdownMode: DrawdownMode;
}

export interface BotConfig {
  assets: CryptoAsset[];
  intervalMinutes: 5;
  enabled: boolean;
  mode: "paper" | "live";
  strategy: BotStrategy;
  tickIntervalMs: number;
  requirePriorSettlement: boolean;
  pairLockMaxCost: number;
  riskControl: BotRiskControlConfig;
  pairArb: {
    enabled: boolean;
    orderAmountUsd: number;
    cooldownSeconds: number;
    maxTradesPerWindow: number;
  };
  directional: {
    enabled: boolean;
    entryAmountUsd: number;
    minSecondsRemaining: number;
    maxEntryAsk: number;
    minEntryAsk: number;
    maxDirectionalAsk: number;
    minChainlinkDeltaBps: number;
    hedgeOnReversal: boolean;
    cooldownSeconds: number;
  };
}

export interface BotLogEntry {
  at: number;
  level: "info" | "warn" | "trade" | "error";
  message: string;
}

export interface BotRiskRuntimeState {
  halted: boolean;
  haltPending: boolean;
  awaitingSettlement: boolean;
  haltReason: string | null;
  dayStartDate: string;
  dayStartEquity: number;
  sessionPeakEquity: number;
  dayPeakProfit: number;
  lastCheckAt: number;
  lastHaltLogAt: number;
}

export interface AssetBotState {
  phase: BotPhase;
  currentSlug: string | null;
  directionalSide: CryptoOutcome | null;
  lastPairArbAt: number;
  lastDirectionalAt: number;
  lastSettlementWaitLogAt: number;
  pairArbCountThisWindow: number;
}

export interface BotRuntimeState {
  running: boolean;
  startedAt: number | null;
  lastTickAt: number;
  tickCount: number;
  lastError: string | null;
  logs: BotLogEntry[];
  assets: Record<CryptoAsset, AssetBotState>;
  risk?: BotRiskRuntimeState;
}
