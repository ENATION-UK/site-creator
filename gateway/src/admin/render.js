import { config } from "../config.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light; --bg:#f4f1ea; --ink:#1c1917; --muted:#57534e; --line:#e7e5e4; --card:#fff; --accent:#0f766e; --danger:#b91c1c; }
    * { box-sizing: border-box; }
    body { margin:0; font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--ink); }
    header { display:flex; justify-content:space-between; align-items:center; padding:20px 28px; border-bottom:1px solid var(--line); background:var(--card); }
    header a { color:var(--ink); text-decoration:none; font-weight:650; }
    main { padding:28px; max-width:1100px; margin:0 auto; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:28px; }
    .stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; }
    .stat b { display:block; font-size:24px; }
    .stat span { color:var(--muted); font-size:13px; }
    table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
    th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; font-size:13px; }
    th { color:var(--muted); font-weight:600; background:#fafaf9; }
    .ok { color:var(--accent); font-weight:650; }
    .off { color:var(--danger); font-weight:650; }
    form { display:inline; }
    button { appearance:none; border:0; background:#1c1917; color:#fff; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:12px; }
    button.danger { background:var(--danger); }
    button.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
    a.url { color:var(--accent); }
    .flash { background:#ecfdf5; color:#065f46; padding:10px 12px; border-radius:10px; margin-bottom:16px; }
    .err { background:#fef2f2; color:#991b1b; }
    nav a { margin-left:16px; color:var(--muted); font-weight:500; font-size:14px; }
  </style>
</head>
<body>
  <header>
    <a href="/admin">外贸建站管理端</a>
    <nav>
      <a href="/admin">总览</a>
      <a href="/health">健康检查</a>
    </nav>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

export function renderDashboard({ stats, clients, sites, notice, error }) {
  const flash = notice
    ? `<p class="flash">${esc(notice)}</p>`
    : error
      ? `<p class="flash err">${esc(error)}</p>`
      : "";
  const clientRows = clients
    .map(
      (c) => `<tr>
      <td><code>${esc(c.id)}</code></td>
      <td>${esc(c.email || "—")}</td>
      <td>${esc(c.agent || "—")}</td>
      <td>${c.site_count}/${c.site_total}</td>
      <td>${c.disabled ? '<span class="off">停用</span>' : '<span class="ok">正常</span>'}</td>
      <td>${esc(c.last_seen_at)}</td>
      <td>
        <form method="post" action="/admin/clients/${esc(c.id)}/${c.disabled ? "enable" : "disable"}">
          <button class="${c.disabled ? "ghost" : "danger"}" type="submit">${c.disabled ? "恢复" : "停用用户"}</button>
        </form>
      </td>
    </tr>`,
    )
    .join("");
  const siteRows = sites
    .map(
      (s) => `<tr>
      <td>${esc(s.name)}<br><code>${esc(s.id)}</code></td>
      <td><code>${esc(s.client_id)}</code><br>${esc(s.email || s.agent || "")}</td>
      <td>${s.url ? `<a class="url" href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.url)}</a>` : "—"}<br><code>${esc(s.cf_project)}</code></td>
      <td>${s.status === "disabled" ? '<span class="off">停用</span>' : `<span class="ok">${esc(s.status)}</span>`}</td>
      <td>${esc(s.updated_at)}</td>
      <td>${
        s.status === "disabled"
          ? "—"
          : `<form method="post" action="/admin/sites/${esc(s.id)}/disable">
              <button class="danger" type="submit">停用并删项目</button>
            </form>`
      }</td>
    </tr>`,
    )
    .join("");

  return layout(
    "外贸建站管理端",
    `${flash}
    <section class="stats">
      <div class="stat"><b>${stats.clients}</b><span>客户端</span></div>
      <div class="stat"><b>${stats.sites}</b><span>在线站点</span></div>
      <div class="stat"><b>${stats.disabledSites}</b><span>已停用站点</span></div>
      <div class="stat"><b>${stats.deploysToday}</b><span>今日部署</span></div>
      <div class="stat"><b>${stats.deploysTotal}</b><span>累计部署</span></div>
    </section>
    <h2>用户</h2>
    <table>
      <thead><tr><th>ID</th><th>邮箱</th><th>Agent</th><th>站点</th><th>状态</th><th>最后活跃</th><th></th></tr></thead>
      <tbody>${clientRows || `<tr><td colspan="7">暂无用户。网关：${esc(config.publicUrl)}</td></tr>`}</tbody>
    </table>
    <h2 style="margin-top:32px">站点</h2>
    <table>
      <thead><tr><th>站点</th><th>用户</th><th>地址</th><th>状态</th><th>更新</th><th></th></tr></thead>
      <tbody>${siteRows || '<tr><td colspan="6">暂无站点</td></tr>'}</tbody>
    </table>`,
  );
}
