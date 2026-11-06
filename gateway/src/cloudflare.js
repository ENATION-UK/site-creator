import { spawn } from "node:child_process";
import path from "node:path";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { config, canDeploy } from "./config.js";
import { ApiError } from "./errors.js";

let proxyApplied = false;

function applyProxy() {
  if (proxyApplied || !config.httpsProxy) return;
  setGlobalDispatcher(new ProxyAgent(config.httpsProxy));
  proxyApplied = true;
}

function assertConfigured() {
  if (!canDeploy()) {
    throw new ApiError(
      503,
      "CLOUDFLARE_NOT_CONFIGURED",
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to deploy",
    );
  }
}

async function cf(pathname, opts = {}) {
  assertConfigured();
  applyProxy();
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${config.cloudflareApiToken}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg =
      data.errors?.map((e) => e.message).join("; ") ||
      data.messages?.map((m) => m.message).join("; ") ||
      `Cloudflare API ${res.status}`;
    const err = new ApiError(res.status === 404 ? 404 : 502, "CLOUDFLARE_ERROR", msg);
    err.httpStatus = res.status;
    throw err;
  }
  return data;
}

export async function countPagesProjects() {
  if (config.dryRun) return 0;
  const data = await cf(
    `/accounts/${config.cloudflareAccountId}/pages/projects?per_page=1&page=1`,
  );
  return data.result_info?.total_count ?? data.result?.length ?? 0;
}

export async function ensureProject(projectName) {
  if (config.dryRun) {
    return {
      created: true,
      project: { name: projectName, subdomain: `${projectName}.pages.dev` },
      count: 0,
    };
  }
  const count = await countPagesProjects();
  try {
    const existing = await cf(
      `/accounts/${config.cloudflareAccountId}/pages/projects/${projectName}`,
    );
    return { created: false, project: existing.result, count };
  } catch (err) {
    const missing =
      err instanceof ApiError &&
      (err.httpStatus === 404 || /not found|could not find/i.test(err.message));
    if (!missing) throw err;
  }

  if (count >= config.maxPagesProjects) {
    throw new ApiError(
      503,
      "QUOTA_PAGES",
      `Cloudflare Pages project limit reached (${config.maxPagesProjects}). Disable unused sites in admin to free quota.`,
    );
  }

  const created = await cf(`/accounts/${config.cloudflareAccountId}/pages/projects`, {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      production_branch: "main",
    }),
  });
  return { created: true, project: created.result, count: count + 1 };
}

export async function getProject(projectName) {
  if (config.dryRun) {
    return { name: projectName, subdomain: `${projectName}.pages.dev` };
  }
  const data = await cf(
    `/accounts/${config.cloudflareAccountId}/pages/projects/${projectName}`,
  );
  return data.result;
}

export function pagesUrl(project) {
  if (project?.subdomain) {
    return project.subdomain.startsWith("http")
      ? project.subdomain
      : `https://${project.subdomain}`;
  }
  if (project?.canonical_deployment?.url) return project.canonical_deployment.url;
  if (project?.name) return `https://${project.name}.pages.dev`;
  return null;
}

export function deployDirectory(dir, projectName) {
  assertConfigured();
  if (config.dryRun) {
    return Promise.resolve({ stdout: `dry-run https://${projectName}.pages.dev\n`, stderr: "" });
  }
  const wrangler = path.join(config.gatewayRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const args = [
    wrangler,
    "pages",
    "deploy",
    dir,
    "--project-name",
    projectName,
    "--branch",
    "main",
    "--commit-dirty",
    "true",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: config.cloudflareAccountId,
        CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
        CLOUDFLARE_API_KEY: "",
        WRANGLER_SEND_METRICS: "false",
        CI: "true",
      },
      cwd: config.gatewayRoot,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      reject(new ApiError(502, "CLOUDFLARE_ERROR", err.message));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = (stderr || stdout).trim().slice(-1500) || `wrangler exited ${code}`;
      reject(new ApiError(502, "CLOUDFLARE_ERROR", detail));
    });
  });
}

export async function deleteProject(projectName) {
  if (config.dryRun) return;
  await cf(`/accounts/${config.cloudflareAccountId}/pages/projects/${projectName}`, {
    method: "DELETE",
  });
}
