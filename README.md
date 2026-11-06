# trade-site

Agent 按用户风格生成静态外贸/B2B 站点，经网关部署到 Cloudflare Pages，返回 `https://*.pages.dev`。

Skill 遵循 [Agent Skills](https://agentskills.io) 布局，可用 `npx skills add` 安装到 Cursor、Claude Code、Codex 等。

## 给任意用户安装

```bash
npx skills add ENATION-UK/site-creator
```

在当前项目安装；跨项目可用再加 `-g`。只要特定 skill：

```bash
npx skills add ENATION-UK/site-creator --skill trade-site -y
```

CLI 会把 `skills/trade-site` 拷到对应 Agent 目录，例如 `.cursor/skills/trade-site`、`.claude/skills/trade-site`、`.codex/skills/trade-site`。之后在对话里说「外贸建站」或输入 `/trade-site`。

安装 skill **不等于**自建网关。默认连生产网关 `https://site.yizo.ai`。首次部署会在 `~/.config/trade-site/credentials.json` 写入客户端 ID。需要 Node.js 18+。

仓库需为 public，`npx skills add` 才能拉到。确认 CLI 能发现 skill（不安装）：

```bash
npx skills add ENATION-UK/site-creator --list
```

有人通过 `npx skills add` 安装后，[skills.sh](https://skills.sh/) 会按安装量收录，无需单独投稿。

## 站点目录

每个公司一个目录，写在**用户当前项目**里，不在 skill 包内：

```
sites/<slug>/
  .trade-site.json    # 部署脚本写入的 site_id / url / name
  index.html
```

```bash
node <skill-dir>/scripts/deploy.mjs --list
node <skill-dir>/scripts/deploy.mjs sites/acme-valves --name "Acme" 
```

`<skill-dir>` 是包含 `SKILL.md` 的目录，安装后不要再用仓库内的 `skills/trade-site/...` 硬编码路径。

## 自建网关（可选）

只有你要自己跑 Cloudflare 部署服务时才需要这一步。普通用 skill 的人连 `https://site.yizo.ai` 即可。

```bash
cd gateway
cp .env.example .env
# 填入 CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_API_TOKEN、ADMIN_PASSWORD
npm install
npm start
```

- 生产网关：`https://site.yizo.ai`
- 管理端：`https://site.yizo.ai/admin`（Basic Auth）
- 本地默认端口：8790

本地不连 Cloudflare 时，可在 `.env` 设 `CLOUDFLARE_DRY_RUN=1`。客户端改连本地网关：

```bash
export TRADE_SITE_GATEWAY=http://127.0.0.1:8790
```
