#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const DEFAULT_GATEWAY = process.env.TRADE_SITE_GATEWAY || "https://site.yizo.ai";
const MANIFEST_NAME = ".trade-site.json";
const CREDENTIALS_PATH = path.join(
  process.env.TRADE_SITE_HOME || process.env.HOME || process.env.USERPROFILE || ".",
  ".config",
  "trade-site",
  "credentials.json",
);

function usage() {
  console.error(`Usage:
  node scripts/deploy.mjs --list [--gateway URL]
  node scripts/deploy.mjs <site-dir> [--name "Company"] [--site SITE_ID] [--email you@x.com] [--agent cursor] [--gateway URL]

  --list   Show local sites (sites/*) and remote sites on the gateway
  deploy   Create or update one site. Reuses .trade-site.json / --site when present.`);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function walkFiles(root) {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === ".DS_Store" || name === "Thumbs.db" || name === ".git" || name === MANIFEST_NAME) {
        continue;
      }
      const abs = path.join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "__MACOSX") continue;
        walk(abs);
      } else {
        out.push(abs);
      }
    }
  }
  walk(root);
  return out;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function zipDirectory(root, dest) {
  const files = walkFiles(root);
  if (files.length === 0) throw new Error("Site directory is empty");
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const data = readFileSync(abs);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(rel, "utf8");
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      compressed,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBuf.length),
    u32(centralStart),
    u16(0),
  ]);
  writeFileSync(dest, Buffer.concat([...locals, centralBuf, end]));
}

function parseArgs(argv) {
  const args = {
    dir: null,
    name: null,
    site: null,
    email: null,
    agent: null,
    gateway: null,
    list: false,
    help: false,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const cur = rest[i];
    if (cur === "--help" || cur === "-h") args.help = true;
    else if (cur === "--list") args.list = true;
    else if (cur === "--name") args.name = rest[++i];
    else if (cur === "--site") args.site = rest[++i];
    else if (cur === "--email") args.email = rest[++i];
    else if (cur === "--agent") args.agent = rest[++i];
    else if (cur === "--gateway") args.gateway = rest[++i];
    else if (!cur.startsWith("-") && !args.dir) args.dir = cur;
    else throw new Error(`Unknown argument: ${cur}`);
  }
  return args;
}

function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) return { sites: {} };
  try {
    const data = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
    data.sites = data.sites || {};
    return data;
  } catch {
    return { sites: {} };
  }
}

function saveCredentials(data) {
  mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2));
}

function manifestPath(dir) {
  return path.join(dir, MANIFEST_NAME);
}

function readManifest(dir) {
  const file = manifestPath(dir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeManifest(dir, data) {
  const prev = readManifest(dir) || {};
  const next = {
    ...prev,
    site_id: data.site_id,
    name: data.name || prev.name || path.basename(dir),
    url: data.url || prev.url,
    cf_project: data.cf_project || prev.cf_project,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(manifestPath(dir), JSON.stringify(next, null, 2) + "\n");
  return next;
}

function detectAgent() {
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_AGENT) return "cursor";
  if (process.env.CLAUDE_CODE || process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) {
    return "claude";
  }
  if (
    process.env.CODEX_THREAD_ID ||
    process.env.CODEX_SESSION_ID ||
    process.env.CODEX_CI ||
    process.env.CODEX_SANDBOX
  ) {
    return "codex";
  }
  return "unknown";
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
}

function resolveGateway(args, creds) {
  return (args.gateway || process.env.TRADE_SITE_GATEWAY || creds.gateway || DEFAULT_GATEWAY).replace(
    /\/$/,
    "",
  );
}

async function ensureClient(creds, gateway, args) {
  if (creds.client_id && creds.client_key) return creds;
  const res = await fetch(`${gateway}/v1/clients/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: args.email || creds.email || undefined,
      agent: args.agent || creds.agent || detectAgent(),
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(`Register failed: ${body.error || res.status}`);
  }
  const next = {
    ...creds,
    client_id: body.client_id,
    client_key: body.client_key,
    gateway: body.gateway || gateway,
    email: args.email || creds.email,
    agent: args.agent || creds.agent || detectAgent(),
    sites: creds.sites || {},
  };
  saveCredentials(next);
  console.log(`Registered client ${next.client_id}`);
  console.log(`Credentials saved to ${CREDENTIALS_PATH}`);
  return next;
}

function listLocalSiteDirs() {
  const cwd = process.cwd();
  const dirs = [];
  const sitesRoot = path.join(cwd, "sites");
  if (existsSync(sitesRoot) && statSync(sitesRoot).isDirectory()) {
    for (const name of readdirSync(sitesRoot)) {
      const dir = path.join(sitesRoot, name);
      if (statSync(dir).isDirectory() && existsSync(path.join(dir, "index.html"))) {
        dirs.push(dir);
      }
    }
  }
  const legacy = path.join(cwd, "dist");
  if (existsSync(path.join(legacy, "index.html"))) dirs.push(legacy);
  return dirs;
}

async function fetchRemoteSites(creds, gateway) {
  if (!creds.client_id || !creds.client_key) return [];
  const res = await fetch(`${gateway}/v1/sites`, {
    headers: { Authorization: `Bearer ${creds.client_key}` },
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error(`List failed: ${body.error || res.status}`);
  }
  return body.sites || [];
}

function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

async function listSites(args) {
  const creds = loadCredentials();
  const gateway = resolveGateway(args, creds);
  const localDirs = listLocalSiteDirs();
  console.log("Local sites");
  if (localDirs.length === 0) {
    console.log("  (none)  put new sites in sites/<slug>/");
  } else {
    for (const dir of localDirs) {
      const rel = path.relative(process.cwd(), dir) || dir;
      const manifest = readManifest(dir);
      const mapped = creds.sites?.[dir];
      const siteId = manifest?.site_id || mapped || "(unlinked — deploy would CREATE a new site)";
      const name = manifest?.name || path.basename(dir);
      const url = manifest?.url || "";
      console.log(`  ${rel}`);
      console.log(`    name:    ${name}`);
      console.log(`    site_id: ${siteId}`);
      if (url) console.log(`    url:     ${url}`);
    }
  }

  if (!creds.client_id || !creds.client_key) {
    console.log("\nRemote sites");
    console.log("  (no credentials yet — first deploy will register this machine)");
    return;
  }

  const remote = await fetchRemoteSites(creds, gateway);
  console.log("\nRemote sites");
  if (remote.length === 0) {
    console.log("  (none on gateway)");
    return;
  }
  const active = remote.filter((s) => s.status !== "disabled").length;
  console.log(`  ${active} active / ${remote.length} total  (free quota: 3 active)`);
  for (const site of remote) {
    console.log(
      `  ${pad(site.status, 10)} ${site.id}  ${site.name}  ${site.url || ""}`,
    );
  }
}

function resolveSiteId(args, siteDir, creds) {
  if (args.site) return args.site;
  const manifest = readManifest(siteDir);
  if (manifest?.site_id) return manifest.site_id;
  if (creds.sites?.[siteDir]) return creds.sites[siteDir];
  return null;
}

async function deploySite(args) {
  const siteDir = path.resolve(args.dir);
  if (!existsSync(path.join(siteDir, "index.html"))) {
    throw new Error(`No index.html in ${siteDir}`);
  }

  let creds = loadCredentials();
  const gateway = resolveGateway(args, creds);
  creds = await ensureClient(creds, gateway, args);

  const manifest = readManifest(siteDir);
  const siteId = resolveSiteId(args, siteDir, creds);
  const name =
    args.name || manifest?.name || path.basename(siteDir) || "site";

  const tmp = mkdtempSync(path.join(os.tmpdir(), "trade-site-zip-"));
  const zipPath = path.join(tmp, "site.zip");
  try {
    zipDirectory(siteDir, zipPath);
    const zip = readFileSync(zipPath);
    const form = new FormData();
    form.set("zip", new Blob([zip], { type: "application/zip" }), "site.zip");
    form.set("name", name);

    const url = siteId ? `${gateway}/v1/sites/${siteId}/deploy` : `${gateway}/v1/sites`;
    if (siteId) {
      console.log(`Updating existing site ${siteId}`);
    } else {
      console.log("Creating a NEW site (no .trade-site.json / --site found)");
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.client_key}` },
      body: form,
    });
    const body = await readJson(res);
    if (!res.ok) {
      throw new Error(`${body.code || res.status}: ${body.error || "deploy failed"}`);
    }
    creds.sites[siteDir] = body.id;
    creds.gateway = gateway;
    saveCredentials(creds);
    writeManifest(siteDir, {
      site_id: body.id,
      name: body.name || name,
      url: body.url,
      cf_project: body.cf_project,
    });
    console.log(`Site ID: ${body.id}`);
    console.log(`Status:  ${body.status}`);
    console.log(`URL:     ${body.url}`);
    console.log(`Manifest ${manifestPath(siteDir)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(err.message);
    usage();
    process.exit(1);
  }
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (args.list) {
    await listSites(args);
    return;
  }
  if (!args.dir) {
    usage();
    process.exit(1);
  }
  await deploySite(args);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
