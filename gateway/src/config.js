import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const gatewayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(gatewayRoot, ".env") });

function num(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

export const config = {
  gatewayRoot,
  port: num("PORT", 8790),
  listenHost: process.env.LISTEN_HOST || "0.0.0.0",
  databasePath: path.resolve(gatewayRoot, process.env.DATABASE_PATH || "./data/app.db"),
  adminUser: process.env.ADMIN_USER || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || "",
  publicUrl: (process.env.GATEWAY_PUBLIC_URL || "http://127.0.0.1:8790").replace(/\/$/, ""),
  httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "",
  maxSitesPerClient: num("MAX_SITES_PER_CLIENT", 3),
  maxDeploysPerDay: num("MAX_DEPLOYS_PER_DAY", 10),
  maxUploadMb: num("MAX_UPLOAD_MB", 15),
  maxPagesProjects: num("MAX_PAGES_PROJECTS", 100),
  dryRun: process.env.CLOUDFLARE_DRY_RUN === "1",
};

export function cloudflareConfigured() {
  return Boolean(config.cloudflareAccountId && config.cloudflareApiToken);
}

export function canDeploy() {
  return config.dryRun || cloudflareConfigured();
}
