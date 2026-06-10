#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "需要 Node.js 20 或更高版本（推荐 22），当前: $(node -v)" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已从 .env.example 创建 .env，请修改 TRADE_USERNAME / TRADE_PASSWORD 后再对外访问。"
fi

mkdir -p data

echo "安装依赖..."
npm ci

echo "构建生产版本..."
npm run build

PORT="${PORT:-50003}"
export PORT

if command -v pm2 >/dev/null 2>&1; then
  echo "使用 PM2 启动，端口 ${PORT}..."
  pm2 delete polymarket-crypto-paper >/dev/null 2>&1 || true
  pm2 start ecosystem.config.cjs
  pm2 save
  echo
  echo "已启动: http://127.0.0.1:${PORT}/crypto"
  echo "查看日志: pm2 logs polymarket-crypto-paper"
  echo "开机自启: pm2 startup && pm2 save"
else
  echo
  echo "构建完成。未检测到 PM2，请手动启动:"
  echo "  PORT=${PORT} npm start"
  echo
  echo "建议安装 PM2 以便守护进程运行:"
  echo "  npm install -g pm2"
  echo "  pm2 start ecosystem.config.cjs && pm2 save"
fi
