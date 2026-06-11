export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { resumeBotEngineIfNeeded } = await import("./lib/bot/engine");
  resumeBotEngineIfNeeded();

  if (process.env.BOT_ENABLED === "true") {
    const { ensureChainlinkFeed } = await import("./lib/chainlink-server");
    void ensureChainlinkFeed();
    const { startBotEngine, isBotEngineRunning } = await import("./lib/bot/engine");
    if (!isBotEngineRunning()) {
      startBotEngine();
    }
  }
}
