import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CryptoAsset, CryptoOutcome } from "../crypto-types";
import { getBotConfig } from "./config-io";
import {
  AssetBotState,
  BotLogEntry,
  BotPhase,
  BotRiskRuntimeState,
  BotRuntimeState,
} from "./types";

export type {
  AssetBotState,
  BotConfig,
  BotLogEntry,
  BotPhase,
  BotRiskControlConfig,
  BotRiskRuntimeState,
  BotRuntimeState,
  BotStrategy,
  DrawdownMode,
} from "./types";
export { getBotConfig, saveBotConfig } from "./config-io";

const STATE_PATH = join(process.cwd(), "data", "bot-state.json");
const LEGACY_STATE_PATH = join(process.cwd(), "data", "bot-btc-state.json");

function defaultAssetState(): AssetBotState {
  return {
    phase: "watching",
    currentSlug: null,
    directionalSide: null,
    lastPairArbAt: 0,
    lastDirectionalAt: 0,
    lastSettlementWaitLogAt: 0,
    pairArbCountThisWindow: 0,
  };
}

export function defaultBotState(): BotRuntimeState {
  const config = getBotConfig();
  const assets = {} as Record<CryptoAsset, AssetBotState>;
  for (const asset of config.assets) {
    assets[asset] = defaultAssetState();
  }
  return {
    running: false,
    startedAt: null,
    lastTickAt: 0,
    tickCount: 0,
    lastError: null,
    logs: [],
    assets,
    risk: {
      halted: false,
      haltPending: false,
      awaitingSettlement: false,
      haltReason: null,
      dayStartDate: "",
      dayStartEquity: 0,
      sessionPeakEquity: 0,
      dayPeakProfit: 0,
      lastCheckAt: 0,
      lastHaltLogAt: 0,
    },
  };
}

function ensureDataDir() {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function migrateLegacyState(raw: Record<string, unknown>): BotRuntimeState {
  const base = defaultBotState();
  base.running = !!raw.running;
  base.startedAt = (raw.startedAt as number) ?? null;
  base.lastTickAt = (raw.lastTickAt as number) ?? 0;
  base.tickCount = (raw.tickCount as number) ?? 0;
  base.lastError = (raw.lastError as string) ?? null;
  base.logs = (raw.logs as BotLogEntry[]) ?? [];
  if (raw.risk && typeof raw.risk === "object") {
    base.risk = { ...base.risk!, ...(raw.risk as BotRiskRuntimeState) };
  }
  if (raw.assets && typeof raw.assets === "object") {
    base.assets = { ...base.assets, ...(raw.assets as Record<CryptoAsset, AssetBotState>) };
  } else {
    base.assets.BTC = {
      phase: (raw.phase as BotPhase) ?? "watching",
      currentSlug: (raw.currentSlug as string) ?? null,
      directionalSide: (raw.directionalSide as CryptoOutcome) ?? null,
      lastPairArbAt: (raw.lastPairArbAt as number) ?? 0,
      lastDirectionalAt: (raw.lastDirectionalAt as number) ?? 0,
      lastSettlementWaitLogAt: 0,
      pairArbCountThisWindow: (raw.pairArbCountThisWindow as number) ?? 0,
    };
  }
  return base;
}

export function loadBotState(): BotRuntimeState {
  ensureDataDir();
  const path = existsSync(STATE_PATH)
    ? STATE_PATH
    : existsSync(LEGACY_STATE_PATH)
      ? LEGACY_STATE_PATH
      : null;

  if (!path) {
    const s = defaultBotState();
    saveBotState(s);
    return s;
  }

  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const state = migrateLegacyState(raw);
  for (const asset of getBotConfig().assets) {
    if (!state.assets[asset]) {
      state.assets[asset] = defaultAssetState();
    } else {
      state.assets[asset].lastSettlementWaitLogAt ??= 0;
    }
  }
  if (!state.risk) {
    state.risk = defaultBotState().risk;
  }
  return state;
}

export function saveBotState(state: BotRuntimeState) {
  ensureDataDir();
  if (state.logs.length > 200) {
    state.logs = state.logs.slice(0, 200);
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function appendBotLog(
  state: BotRuntimeState,
  level: BotLogEntry["level"],
  message: string,
) {
  state.logs.unshift({ at: Date.now(), level, message });
}

export function getAssetState(
  state: BotRuntimeState,
  asset: CryptoAsset,
): AssetBotState {
  if (!state.assets[asset]) {
    state.assets[asset] = defaultAssetState();
  }
  return state.assets[asset];
}
