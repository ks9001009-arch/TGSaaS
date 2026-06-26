# Telegram 群管理 SaaS 平台

一套可商业化运营的 Telegram 群管理平台（参考方丈 / 小熊机器人，采用现代 SaaS 界面）。
支持多用户注册，每个用户可创建并托管多个机器人，每个群组拥有独立配置，全部通过 Web 后台可视化管理，无需改代码。

> 当前版本为**平台骨架（Foundation）**：已跑通「注册 → 创建 Bot → 入群 → 欢迎 / 验证 / 过滤 → 统计」端到端链路，并预留各高级功能扩展点。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React + Next.js 14 (App Router) + Tailwind（深色模式 / 响应式 / Telegram Desktop 风格） |
| 后端 | Node.js + NestJS 10 + Prisma ORM |
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 机器人 | Telegram Bot API + grammY（Webhook 模式） |
| 部署 | Docker Compose + Nginx 反向代理（HTTPS 由 Nginx / CDN 终结） |
| 鉴权 | JWT |

## 目录结构

```
.
├── docker-compose.yml        # 一键编排 postgres / redis / api / web / nginx
├── .env.example              # 环境变量示例（复制为 .env）
├── nginx/default.conf        # 反向代理：/api -> 后端，/webhook -> 后端，/ -> 前端
├── apps/
│   ├── api/                  # NestJS 后端
│   │   ├── prisma/schema.prisma   # 全部数据模型
│   │   └── src/
│   │       ├── auth/         # 注册 / 登录 / JWT
│   │       ├── users/        # 账户 / 邀请奖励
│   │       ├── bots/         # Bot 托管：CRUD + 设置 Webhook
│   │       ├── telegram/     # Webhook 引擎：欢迎 / 验证 / 过滤 / 统计 / 日志
│   │       ├── groups/       # 群组与独立配置（欢迎/按钮/验证/关键词/名单/公告/日志）
│   │       └── stats/        # 数据统计
│   └── web/                  # Next.js 前端
│       └── src/
│           ├── app/          # 登录 / 注册 / Dashboard 各页面
│           └── components/   # 侧边栏、统计卡片、各配置编辑器、按钮编辑器
```

## 快速开始

前置：安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。

```bash
# 1. 准备环境变量
cp .env.example .env
#   修改 JWT_SECRET / 数据库密码 / TELEGRAM_WEBHOOK_SECRET 等

# 2. 一键启动（首次会自动建表 + 写入演示账号）
docker compose up -d --build

# 3. 访问
#   前端后台:  http://localhost
#   后端健康检查: http://localhost/api/health
```

默认演示账号：`admin@demo.local` / `admin12345`

### 让机器人真正收消息（Webhook）

Telegram Webhook 需要 **HTTPS 公网地址**。本地开发可用隧道：

```bash
# 任选其一暴露 80 端口
cloudflared tunnel --url http://localhost:80
# 或 ngrok http 80
```

将得到的 https 地址填入 `.env` 的 `PUBLIC_URL`，重启 api 后：

1. 浏览器登录后台 → 「创建机器人」粘贴 BotFather Token（创建时会自动尝试注册 Webhook）。
2. 如自动注册失败，在机器人卡片点「Webhook」按钮手动注册。
3. 把机器人拉进群并设为管理员 → 平台会自动收录该群，进入「我的群组」即可配置。

## 已实现能力（骨架）

- **多租户账户**：注册 / 登录 / JWT、邀请码与奖励积分、套餐字段
- **Bot 私聊中心**：`/start` 主菜单（首页/添加群组/我的群组/后台/VIP/邀请/客服/语言）、`/help`、`/id`
- **群管理引擎**：新人欢迎（图文/Markdown/按钮）、按钮/数学/验证码验证、入群限制与解除、关键词过滤、广告/链接启发式过滤、黑/白名单、自动回复、管理员日志、统计计数
- **Web 后台**：Dashboard 概览 + 趋势图、我的群组、群组可视化配置（欢迎编辑器 / 按钮编辑器 / 验证 / 关键词 / 过滤 / 名单 / 日志）、创建机器人、数据统计、账户、VIP、邀请、设置
- **按钮编辑器**：群/频道/Bot/客服/网页/任意 URL、一行多按钮、排序、Emoji、点击统计
- **多语言**：中文 / English 切换（账户页）

## 预留扩展点

- 第三方验证：Cloudflare Turnstile / Google reCAPTCHA（枚举与开关已就位，配置 `.env` 密钥即可对接）
- AI 风控：`AI_RISK_PROVIDER` 占位，可接入模型做风险评分
- 定时公告：`Announcement.intervalMinutes` 已建模，接一个 cron/队列即可发送
- 头像/用户名/账号年龄/Premium 检测：开关已在验证配置中，补充 Telegram API 调用即可生效
- 套餐计费：`PlanTier` 与到期时间字段已就位，可接支付与额度限制

## 开发说明

后端模块化清晰（每个功能一个 NestJS module），前端每个配置项一个独立编辑器组件，新增功能 = 新增一个 module + 一个编辑器组件，便于插件化扩展。
