---
name: trade-site
description: Builds, lists, updates, and deploys static export/B2B websites through the trade-site gateway to Cloudflare Pages. Use for 外贸建站, multi-site catalogs, editing an existing Pages site, or publishing HTML via this gateway.
---

# Trade Site

Create or update **static** export/B2B sites and publish them through the gateway. Visual design follows the user; do not reuse a fixed template.

Each company is **one local folder + one live site**. Never dump a second company into another company's folder.

This skill is portable. After `npx skills add` it may live under `.cursor/skills`, `.claude/skills`, `.codex/skills`, `.agents/skills`, or `~` equivalents. Do not hardcode `skills/trade-site`.

## Hard limits (free version)

Static hosting only. **Stop and explain** if the user needs a database, CMS, login, cart, stored inquiry forms, or `_worker.js`. Use `mailto:` / WhatsApp instead of a backend form.

Allowed files: HTML, CSS, JS, images, fonts. Site root must contain `index.html`. Free quota: **3 active sites** per client.

Requires **Node.js 18+**. The bundled script has no npm dependencies.

## Layout

Sites belong in the **user's current project**, not inside this skill:

```
sites/<slug>/
  .trade-site.json    # site_id, url, name — written by deploy.mjs
  index.html
  ...
```

`<slug>` is a lowercase hyphenated id from the company name, e.g. `harborline-tools`. Do not use a shared `./dist` for more than one company.

## Deploy script

`scripts/deploy.mjs` sits next to this `SKILL.md`. Resolve `<skill-dir>` as the directory that contains this file, then run:

```bash
node <skill-dir>/scripts/deploy.mjs --list
node <skill-dir>/scripts/deploy.mjs sites/<slug> --name "Company Name"
```

Typical `<skill-dir>` after install:

| Agent | Project | Global (`-g`) |
|-------|---------|----------------|
| Cursor | `.cursor/skills/trade-site` | `~/.cursor/skills/trade-site` |
| Claude Code | `.claude/skills/trade-site` | `~/.claude/skills/trade-site` |
| Codex | `.codex/skills/trade-site` | `~/.codex/skills/trade-site` |

If you just read this `SKILL.md`, use its parent folder. Never call `node scripts/deploy.mjs` from the user's project root unless that is also the skill dir.

Omit `--agent` when possible; the script detects Cursor, Claude Code, and Codex. Override with `--agent cursor`, `--agent claude`, or `--agent codex`. Optional: `--email`, `--gateway`, `--site <id>` (overrides the manifest).

## First step in every conversation

Run `--list`, then choose a path:

| User intent | Action |
|-------------|--------|
| Change an existing company / URL | Edit **that** folder only. Deploy that folder. Do not create a new site. |
| New company, or "新建一个站" | New folder `sites/<new-slug>/`. Never reuse another site's files. |
| Unclear | Show the `--list` output and ask which site, or whether to create one. |

If `--list` already has 3 active remote sites, do not create another. Tell the user to disable one in admin first.

A folder **without** `.trade-site.json` will **create a new live site** on deploy. Do not deploy an unlinked copy of an existing company.

## Build / edit

1. Collect company, products, market, language, contact, and style. Ask if missing.
2. Use the user's logo/photos when given; otherwise a simple CSS/SVG mark.
3. Write files into `sites/<slug>/` (existing slug when updating).
4. Local preview, revise until the user says go live.
5. Deploy with the bundled script (no hand-written curl):

```bash
# update existing (manifest present)
node <skill-dir>/scripts/deploy.mjs sites/harborline-tools

# create new
node <skill-dir>/scripts/deploy.mjs sites/acme-valves --name "Acme Valves"
```

6. Give the user the `https://*.pages.dev` URL **and** the local folder `sites/<slug>/`. Tell them a new chat can say: `继续改 sites/<slug>，不要新建站`.

## Gateway

Default `https://site.yizo.ai` (`TRADE_SITE_GATEWAY` or `--gateway`). Client key lives in `~/.config/trade-site/credentials.json`. Never put Cloudflare keys in this skill.
