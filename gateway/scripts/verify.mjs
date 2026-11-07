import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gatewayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(gatewayRoot, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trade-site-verify-"));
const dbPath = path.join(tmp, "app.db");

process.env.PORT = "0";
process.env.DATABASE_PATH = dbPath;
process.env.ADMIN_USER = "admin";
process.env.ADMIN_PASSWORD = "verify-pass";
process.env.CLOUDFLARE_DRY_RUN = "1";
process.env.GATEWAY_PUBLIC_URL = "http://127.0.0.1:0";
process.env.MAX_SITES_PER_CLIENT = "3";
process.env.TRADE_SITE_HOME = tmp;

const { initDb } = await import("../src/db.js");
const { createApp } = await import("../src/app.js");

initDb();
const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const deployScript = path.join(repoRoot, "skills", "trade-site", "scripts", "deploy.mjs");

function zipOf(dir) {
  const zipPath = path.join(tmp, `${path.basename(dir)}.zip`);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: dir });
  return zipPath;
}

// Deploy writes .trade-site.json into the folder it deploys, so never point it at fixtures/.
function stageFixture(name) {
  const dest = path.join(tmp, `fixture-${name}`);
  fs.cpSync(path.join(gatewayRoot, "fixtures", name), dest, { recursive: true });
  fs.rmSync(path.join(dest, ".trade-site.json"), { force: true });
  return dest;
}

async function req(pathname, opts = {}) {
  const res = await fetch(base + pathname, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

try {
  const health = await req("/health");
  assert(health.body.ok && health.body.dry_run, "health/dry-run failed");

  const registered = await req("/v1/clients/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "verify@example.com", agent: "verify" }),
  });
  assert(registered.res.status === 201, "register failed");
  const { client_id, client_key } = registered.body;
  const auth = { Authorization: `Bearer ${client_key}` };

  const okSite = stageFixture("ok-site");
  const okZip = zipOf(okSite);
  const created = await req("/v1/sites", {
    method: "POST",
    headers: auth,
    body: (() => {
      const form = new FormData();
      form.set("zip", new Blob([fs.readFileSync(okZip)]), "site.zip");
      form.set("name", "Acme Export");
      return form;
    })(),
  });
  assert(created.res.status === 201, `create site failed: ${JSON.stringify(created.body)}`);
  assert(created.body.url.includes(".pages.dev"), "missing pages.dev url");
  const siteId = created.body.id;

  const updated = await req(`/v1/sites/${siteId}/deploy`, {
    method: "POST",
    headers: auth,
    body: (() => {
      const form = new FormData();
      form.set("zip", new Blob([fs.readFileSync(okZip)]), "site.zip");
      return form;
    })(),
  });
  assert(updated.res.status === 200, `update failed: ${JSON.stringify(updated.body)}`);
  assert(updated.body.id === siteId, "update created a new site");

  const listed = await req("/v1/sites", { headers: auth });
  assert(listed.body.sites.length === 1, "list count");

  const badZip = zipOf(stageFixture("bad-worker"));
  const forbidden = await req("/v1/sites", {
    method: "POST",
    headers: auth,
    body: (() => {
      const form = new FormData();
      form.set("zip", new Blob([fs.readFileSync(badZip)]), "bad.zip");
      form.set("name", "Bad");
      return form;
    })(),
  });
  assert(forbidden.res.status === 400, "forbidden zip should 400");
  assert(forbidden.body.code === "FORBIDDEN_FILE", `expected FORBIDDEN_FILE got ${forbidden.body.code}`);

  const extra = [];
  for (const name of ["Two", "Three"]) {
    const r = await req("/v1/sites", {
      method: "POST",
      headers: auth,
      body: (() => {
        const form = new FormData();
        form.set("zip", new Blob([fs.readFileSync(okZip)]), "site.zip");
        form.set("name", name);
        return form;
      })(),
    });
    extra.push(r);
    assert(r.res.status === 201, `extra site ${name} failed`);
  }
  const over = await req("/v1/sites", {
    method: "POST",
    headers: auth,
    body: (() => {
      const form = new FormData();
      form.set("zip", new Blob([fs.readFileSync(okZip)]), "site.zip");
      form.set("name", "Four");
      return form;
    })(),
  });
  assert(over.res.status === 403 && over.body.code === "QUOTA_SITES", "quota sites");

  const admin = await req("/admin", {
    headers: { Authorization: "Basic " + Buffer.from("admin:verify-pass").toString("base64") },
  });
  assert(admin.res.status === 200, "admin auth");
  assert(String(admin.body).includes(client_id), "admin missing client");
  assert(String(admin.body).includes(siteId), "admin missing site");

  const disable = await req(`/admin/sites/${siteId}/disable`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from("admin:verify-pass").toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirect: "manual",
  });
  assert(disable.res.status === 302, "disable redirect");

  const after = await req("/v1/sites", { headers: auth });
  const disabled = after.body.sites.find((s) => s.id === siteId);
  assert(disabled.status === "disabled", "site not disabled");

  const scriptOut = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [deployScript, okSite, "--name", "ScriptSite", "--agent", "verify"],
      {
        env: {
          ...process.env,
          TRADE_SITE_GATEWAY: base,
          TRADE_SITE_HOME: path.join(tmp, "script-home"),
        },
      },
    );
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`deploy.mjs exited ${code}: ${out}`));
    });
  });
  assert(scriptOut.includes("URL:"), `deploy.mjs output: ${scriptOut}`);
  assert(fs.existsSync(path.join(tmp, "script-home", ".config", "trade-site", "credentials.json")), "credentials not saved");

  console.log("verify ok");
  console.log(`  client ${client_id}`);
  console.log(`  site   ${siteId} -> ${created.body.url}`);
  console.log(`  admin  ${base}/admin`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}
