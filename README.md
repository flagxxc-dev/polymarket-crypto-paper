# Polymarket Crypto 5 分钟模拟盘 & 自动 Bot

基于 [Polymarket](https://polymarket.com) 的 **BTC / ETH 5 分钟涨跌** 模拟交易与自动策略 Bot。盘口来自 Polymarket 真实订单簿，方向信号与结算参考 **Chainlink**（与官方 5 分钟窗口同源）。

访问路径：`/crypto`（根路径 `/` 会自动跳转）

---

## 是什么？

Polymarket 每 5 分钟开一个窗口，问「这 5 分钟 BTC/ETH 涨还是跌」。你可以：

- **手动模拟买卖** Up / Down，练习窗口节奏与配对成本
- **开启自动 Bot**，在模拟盘（或配置后的实盘）上跑组合策略：配对套利 + 方向建仓 + 条件对冲

窗口结束后持仓进入「等待结算」，通常 1–3 分钟出结果；赢的每股兑 $1，输的归零。模拟盘无需钱包，数据保存在本地 `data/` 目录。

---

## 功能

| 模块 | 说明 |
| --- | --- |
| **模拟盘** | 初始 $10,000 USDC，按实时盘口 + 滑点/手续费撮合 |
| **Chainlink 面板** | 窗口开盘价、现价、差额、走势（Bot 方向信号同源） |
| **实时配对买价** | Up + Down 扣费后低于配平阈值时标绿，表示双边可锁利 |
| **自动 Bot** | 支持 BTC + ETH 独立预算；配对套利、方向单、反转对冲 |
| **策略与封控** | 页面可改配平比、日亏/回撤上限；触发后等本局结束再停 |
| **登录保护** | 默认需登录才能重置账户等敏感操作 |

---

## 快速开始

### Docker（推荐）

```bash
git clone https://github.com/flagxxc-dev/polymarket-crypto-paper.git
cd polymarket-crypto-paper
cp .env.example .env
# 编辑 .env：至少修改 TRADE_PASSWORD
docker compose up -d --build
```

浏览器打开：**http://localhost:50003/crypto**

> 容器内 Next.js 固定监听 `3000`，宿主机端口由 `APP_PORT`（默认 `50003`）映射，勿在 Docker 里改 `PORT`。

### 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

开发默认：**http://localhost:50003/crypto**（`.env` 中 `PORT=50003`）

---

## 环境变量（`.env`）

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `TRADE_USERNAME` / `TRADE_PASSWORD` | 登录凭证 | `admin` / 需修改 |
| `READONLY_MODE` | 为 `true` 时需登录才能操作 | `true` |
| `APP_PORT` | Docker 宿主机端口 | `50003` |
| `PORT` | 非 Docker 时 Node 监听端口 | `50003` |
| `BOT_ENABLED` | `true` 时容器启动自动跑 Bot（仍受 `config/bot.json` 的 `enabled` 控制） | `false` |
| `POLYGON_PRIVATE_KEY` | 实盘钱包私钥 | 空 |
| `POLYMARKET_FUNDER_ADDRESS` | Polymarket 代理钱包地址 | 空 |
| `ENABLE_LIVE_TRADING` | `true` 且钱包配好后，Bot 可切 `live` 模式 | `false` |

模拟盘 **不需要** 配置钱包。

---

## 配置文件

### `config/bot.json` — Bot 默认策略

主要字段：

```json
{
  "assets": ["BTC", "ETH"],
  "intervalMinutes": 5,
  "enabled": false,
  "mode": "paper",
  "strategy": "combined",
  "pairLockMaxCost": 0.96,
  "requirePriorSettlement": true,
  "pairArb": { "enabled": true, "orderAmountUsd": 40 },
  "directional": { "enabled": true, "entryAmountUsd": 50 },
  "riskControl": {
    "enabled": true,
    "dayLossLimitPct": 0.1,
    "drawdownLimitPct": 0.1
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `assets` | 参与 Bot 的资产，如 `BTC`、`ETH` |
| `mode` | `paper` 模拟盘 / `live` 实盘 |
| `pairLockMaxCost` | 配平比上限（≤1），双边扣费后总成本需低于此值才配对 |
| `requirePriorSettlement` | **仅 `live` 生效**：上局未结算回笼前不开新仓；模拟盘不等待 |
| `riskControl` | 总权益 = 现金 + 全部持仓成本；日亏/回撤默认各 10% |

页面上 **「策略与封控」** 保存的设置写入 `data/bot-settings.json`，与 `config/bot.json` 合并生效（Docker 中 `config/` 只读，故 UI 不写 config 目录）。

### `config/crypto-paper.json` — 模拟盘参数

- 初始余额、Gamma/CLOB API 地址
- `trading.takerFeeBps`、`buySlippage`、`pairArbMinEdge` 等撮合与费用参数

### `data/` — 运行时数据（需可写）

| 文件 | 内容 |
| --- | --- |
| `paper-trading.json` | 模拟账户、持仓、成交记录 |
| `bot-state.json` | Bot 运行状态与日志 |
| `bot-settings.json` | 页面保存的策略/封控覆盖项 |

重置模拟账户会清空 `paper-trading.json`；Bot 状态独立保存在 `bot-state.json`。

---

## 页面用法

1. 点击 **「怎么玩」** 查看 5 分钟规则说明
2. 在 **Chainlink 面板** 看当前窗口涨跌领先情况
3. 在 **市场列表** 选手动买入 Up/Down（可填金额）
4. 展开 **Bot 面板**：启动/停止、查看 tick 日志与风控状态
5. **「策略与封控」**：调整配平比、日亏/回撤；封控触发后需手动 **解除封控**
6. **「重置模拟账户」**：恢复初始 $10,000（需登录）

---

## Bot 策略（`combined`）

每个 tick（默认 3 秒）对每个资产独立执行：

1. **配对套利**：Up + Down 买价扣费后 < 配平比 → 双边同时买入锁利
2. **方向建仓**：Chainlink 相对窗口开盘价领先足够 bps，且剩余时间/价格满足条件 → 买领先一侧
3. **反转对冲**：已持方向单且 Chainlink 反转 → 买对侧对冲

封控触发时：先等当前交易结束 → 再等结算回笼 → 停止新开仓，需手动解除。

---

## 安全

- **私钥**：`POLYGON_PRIVATE_KEY` 拥有钱包完全控制权，勿提交 git、勿泄露。实盘请使用资金有限的专用钱包。
- **登录密码**：对外暴露 UI 前务必修改 `TRADE_PASSWORD`。
- **自托管**：建议在自有服务器运行；勿将私钥交给第三方托管环境。
- **模拟盘数据**：保存在服务器本地 `data/`，请定期备份并限制目录权限。

---

## 生产部署

### Docker

```bash
docker compose up -d --build
```

### Linux 服务器（无 Docker）

**环境要求：** Node.js 20+（推荐 22）、npm、可选 PM2

```bash
git clone https://github.com/flagxxc-dev/polymarket-crypto-paper.git
cd polymarket-crypto-paper
cp .env.example .env
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh
```

访问：`http://服务器IP:50003/crypto`

**PM2 手动启动：**

```bash
npm ci && npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

**systemd：** 参考 `deploy/polymarket-crypto-paper.service`

**Nginx 反代：** 参考 `deploy/nginx.conf.example`，转发到 `127.0.0.1:50003`

**注意：**

- 确保 `data/` 可写
- 防火墙放行 `APP_PORT`（默认 50003）
- 修改默认登录密码后再对外暴露

---

## VPN（可选，实盘下单）

若服务器所在地区无法直连 Polymarket，可使用 `docker-compose.vpn.yml` 或自行配置 OpenVPN。

1. 从 VPN 提供商下载 `.ovpn` 配置，放到 `vpn/vpn.ovpn`
2. 创建 `vpn/vpn.auth`（第一行用户名，第二行密码）
3. 在 `vpn.ovpn` 中将 `auth-user-pass` 改为 `auth-user-pass /vpn/vpn.auth`
4. 使用带 VPN 的 compose 文件启动

不需要 VPN 时，使用默认 `docker-compose.yml` 即可。

---

## 开发

```bash
npm run dev      # 开发服务器
npm run build    # 生产构建
npm test         # 单元测试（trade-client 预览计算等）
npm run lint     # ESLint
```

---

## 项目结构（简要）

```
app/crypto/          # 主页面
app/api/bot/         # Bot 控制与配置 API
app/api/crypto/      # 市场、模拟盘、现货 API
lib/bot/             # 引擎、策略、风控、执行器
lib/chainlink-server.ts  # Polymarket Chainlink WS 信号
config/bot.json      # Bot 默认配置（只读挂载）
data/                # 运行时持久化（可写挂载）
```
