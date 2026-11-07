---
name: trade-site
description: Builds, lists, updates, and deploys static 外贸独立站 and export/B2B websites through the trade-site gateway to Cloudflare Pages. Use for 外贸独立站、独立站、品牌官网、英文官网、公司官网、外贸建站、询盘站、产品目录站、多语言站、落地页, multi-language catalogs, editing an existing Pages site, or publishing static HTML via this gateway. Site copy is written in the target market's language, with SEO essentials included.
---

# Trade Site

Create or update **static** export/B2B sites and publish them through the gateway. Visual design follows the user; do not reuse a fixed template.

Each company is **one local folder + one live site**. Never dump a second company into another company's folder.

This skill is portable. After `npx skills add` it may live under `.cursor/skills`, `.claude/skills`, `.codex/skills`, `.agents/skills`, or `~` equivalents. Do not hardcode `skills/trade-site`.

## Hard limits (free version)

Static hosting only. **Stop and explain** if the user needs a database, CMS, login, cart, stored inquiry forms, or `_worker.js`. Use `mailto:` / WhatsApp instead of a backend form.

Site root must contain `index.html`.

Quotas enforced by the gateway:

- **3 active sites** per client (disabling a site in admin frees a slot)
- **10 deploys per day** per client
- **15 MB** per deploy

**Allowed files** — one file outside this list makes the gateway reject the whole deploy:

- HTML: `.html` `.htm`
- CSS / JS: `.css` `.js` `.mjs` `.cjs` `.map`
- Images: `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` `.ico` `.avif` `.bmp`
- Fonts: `.woff` `.woff2` `.ttf` `.otf` `.eot`
- Text: `.txt` `.xml` `.json` `.webmanifest`
- Cloudflare Pages: `_headers`, `_redirects`

Never leave `README.md`, notes, `.gitignore`, design sources, or scratch files inside `sites/<slug>/` — keep them outside the site folder. The deploy script refuses before uploading if it finds one.

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

Omit `--agent` when possible; the script detects Cursor, Claude Code, and Codex. Override with `--agent cursor`, `--agent claude`, or `--agent codex`. Optional: `--email`, `--gateway`, `--site <id>` (overrides the manifest), `--new` (ignore the manifest and create a live site).

`--name` only applies when the site is created. Updating an existing site keeps its current name.

Run deploy commands from the user's project root — `--list` and the `sites/` lookup are relative to the current directory.

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
4. Local preview; run the **Overseas site requirements** checklist below; revise until the user says go live.
5. Deploy with the bundled script (no hand-written curl):

```bash
# update existing (manifest present)
node <skill-dir>/scripts/deploy.mjs sites/harborline-tools

# create new
node <skill-dir>/scripts/deploy.mjs sites/acme-valves --name "Acme Valves"
```

6. Give the user the `https://*.pages.dev` URL **and** the local folder `sites/<slug>/`. Tell them a new chat can say: `继续改 sites/<slug>，不要新建站`.

## Overseas site requirements

A site is not done until it passes this list. These are hard requirements, not suggestions.

**Language** — Write every page in the target market's language (English by default; ask when the market is not English-speaking). Chinese is only for talking to the user, never inside the site.

**SEO** — every page has:

- a unique `<title>` (~50–60 chars) and `<meta name="description">` (~140–160 chars)
- `<html lang="...">`, exactly one `<h1>`, headings in order, descriptive `alt` on every image
- Open Graph and Twitter card tags
- `<link rel="canonical">` — add it on the first update after deploy, once the live URL is known
- `sitemap.xml` and `robots.txt` at the site root (both are on the allowed list above)
- JSON-LD: `Organization` on the home page, `Product` on product pages, `BreadcrumbList` where pages nest

**Performance** — WebP/AVIF images with explicit `width`/`height` and `loading="lazy"` below the fold; `.woff2` fonts with `font-display: swap`; keep each page under ~500 KB.

**Trust & compliance** — Contact page with the company's real address, email, phone (with country code) and business hours; About page; Privacy Policy page; Terms page when the site collects anything. Add a WhatsApp click-to-chat link when the user has a number. If third-party analytics or ads are added, add a cookie consent banner first.

**Scope** — static only: no cart, checkout, payment, accounts, or server-side form storage. Inquiry goes through `mailto:` or WhatsApp; never point a `<form action>` at a backend you cannot provide.

## If deploy fails

| Error | What to do |
|-------|------------|
| `SITE_NOT_FOUND` | The folder's `.trade-site.json` names a site this client key cannot update (different machine, reset credentials, or a copied folder). Rerun with `--new` to create a new live site, or delete that manifest and deploy again. Never guess a site id. |
| `QUOTA_SITES` | 3 active sites already exist. Ask the user to disable one at `/admin` first. |
| `QUOTA_DEPLOYS` | 10 deploys used today. Wait for the next UTC day, or finish all edits and deploy once. |
| `FORBIDDEN_FILE` | Delete the file it names — only the types listed above are accepted. |
| `UPLOAD_TOO_LARGE` | Shrink images or fonts, then deploy again. |
| `DISABLED` | The site was disabled in admin; tell the user instead of retrying. |

A malformed `.trade-site.json` or `~/.config/trade-site/credentials.json` makes the script stop with an explanation instead of silently creating a duplicate site — fix or remove the file as it says.

## Gateway

Default `https://site.yizo.ai` (`TRADE_SITE_GATEWAY` or `--gateway`). Client key lives in `~/.config/trade-site/credentials.json`. Never put Cloudflare keys in this skill.

The gateway publishes to `*.pages.dev` only — it does not bind custom domains. Do not promise the user their own domain.
