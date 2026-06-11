import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BotConfig } from "./types";

const BOT_CONFIG_PATH = join(process.cwd(), "config", "bot.json");
const USER_SETTINGS_PATH = join(process.cwd(), "data", "bot-settings.json");

let cachedConfig: BotConfig | null = null;

function ensureDataDir() {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function defaultRiskControl(): BotConfig["riskControl"] {
  return {
    enabled: true,
    dayLossLimitPct: 0.1,
    drawdownLimitPct: 0.1,
    drawdownMode: "from_peak_equity",
  };
}

export function normalizeBotConfig(raw: Record<string, unknown>): BotConfig {
  return {
    requirePriorSettlement: true,
    pairLockMaxCost: 0.96,
    ...raw,
    assets: (raw.assets as BotConfig["assets"]) ??
      (raw.asset ? [raw.asset as BotConfig["assets"][0]] : ["BTC", "ETH"]),
    riskControl: {
      ...defaultRiskControl(),
      ...((raw.riskControl as object) ?? {}),
    },
  } as BotConfig;
}

function loadUserSettings(): Record<string, unknown> | null {
  if (!existsSync(USER_SETTINGS_PATH)) return null;
  return JSON.parse(readFileSync(USER_SETTINGS_PATH, "utf-8")) as Record<
    string,
    unknown
  >;
}

export function getBotConfig(): BotConfig {
  if (cachedConfig) return cachedConfig;

  const legacy = join(process.cwd(), "config", "bot-btc.json");
  const basePath = existsSync(BOT_CONFIG_PATH) ? BOT_CONFIG_PATH : legacy;
  const base = JSON.parse(readFileSync(basePath, "utf-8")) as Record<
    string,
    unknown
  >;

  const user = loadUserSettings();
  const merged = user
    ? {
        ...base,
        ...user,
        riskControl: {
          ...((base.riskControl as object) ?? {}),
          ...((user.riskControl as object) ?? {}),
        },
      }
    : base;

  cachedConfig = normalizeBotConfig(merged);
  return cachedConfig;
}

export function clearBotConfigCache() {
  cachedConfig = null;
}

export function validatePairLockMaxCost(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error("配平比须在 0～1 之间（不含 0，含 1）");
  }
  return Math.round(value * 1000) / 1000;
}

export function saveBotConfig(partial: {
  pairLockMaxCost?: number;
  riskControl?: Partial<BotConfig["riskControl"]>;
}): BotConfig {
  const current = getBotConfig();
  const next: BotConfig = { ...current };

  if (partial.pairLockMaxCost != null) {
    next.pairLockMaxCost = validatePairLockMaxCost(partial.pairLockMaxCost);
  }

  if (partial.riskControl) {
    next.riskControl = {
      ...current.riskControl,
      ...partial.riskControl,
    };
    if (
      next.riskControl.dayLossLimitPct <= 0 ||
      next.riskControl.dayLossLimitPct > 1
    ) {
      throw new Error("日亏损上限须在 0～100% 之间");
    }
    if (
      next.riskControl.drawdownLimitPct <= 0 ||
      next.riskControl.drawdownLimitPct > 1
    ) {
      throw new Error("回撤上限须在 0～100% 之间");
    }
  }

  const existing = loadUserSettings() ?? {};
  const toSave = {
    ...existing,
    pairLockMaxCost: next.pairLockMaxCost,
    riskControl: next.riskControl,
  };

  ensureDataDir();
  writeFileSync(USER_SETTINGS_PATH, JSON.stringify(toSave, null, 2));

  clearBotConfigCache();
  return getBotConfig();
}
