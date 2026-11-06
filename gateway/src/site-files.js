import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { ApiError } from "./errors.js";

const SKIP_NAMES = new Set([".DS_Store", "Thumbs.db"]);
const SKIP_DIRS = new Set(["__MACOSX", ".git", "node_modules"]);
const ALLOWED_BASENAMES = new Set(["_headers", "_redirects"]);
const ALLOWED_EXT = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".avif",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".txt",
  ".xml",
  ".json",
  ".webmanifest",
]);
const FORBIDDEN_NAMES = new Set([
  "_worker.js",
  "_worker.bundle",
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
  ".env",
]);
const FORBIDDEN_DIR_PREFIXES = ["functions/", "functions\\", "cloudflare-env"];

function normalizeEntry(entryName) {
  return entryName.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isForbidden(rel) {
  const lower = rel.toLowerCase();
  const base = path.posix.basename(lower);
  if (FORBIDDEN_NAMES.has(base)) return true;
  if (lower.split("/").includes("functions")) return true;
  return FORBIDDEN_DIR_PREFIXES.some((p) => lower.startsWith(p));
}

function isAllowedFile(rel) {
  const base = path.posix.basename(rel);
  if (ALLOWED_BASENAMES.has(base)) return true;
  const ext = path.posix.extname(base).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

function unwrapRoot(paths) {
  const files = paths.filter((p) => !p.endsWith("/"));
  if (files.length === 0) return "";
  const first = files[0].split("/")[0];
  const allNested = files.every((p) => p === first || p.startsWith(`${first}/`));
  const hasRootFile = files.some((p) => !p.includes("/"));
  if (allNested && !hasRootFile) return `${first}/`;
  return "";
}

export async function extractAndValidateZip(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ApiError(400, "INVALID_ZIP", "Upload is not a valid zip file");
  }

  const entries = zip.getEntries().filter((entry) => {
    const rel = normalizeEntry(entry.entryName);
    if (!rel || rel.includes("..")) return false;
    const parts = rel.split("/");
    if (parts.some((part) => SKIP_DIRS.has(part) || SKIP_NAMES.has(part))) return false;
    return true;
  });

  const rels = entries.map((e) => normalizeEntry(e.entryName));
  const prefix = unwrapRoot(rels);
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trade-site-"));
  let fileCount = 0;

  try {
    for (const entry of entries) {
      const rel = normalizeEntry(entry.entryName);
      if (entry.isDirectory) continue;
      const stripped = prefix && rel.startsWith(prefix) ? rel.slice(prefix.length) : rel;
      if (!stripped) continue;
      if (stripped.includes("..")) {
        throw new ApiError(400, "INVALID_ZIP", "Zip contains an unsafe path");
      }
      if (isForbidden(stripped)) {
        throw new ApiError(
          400,
          "FORBIDDEN_FILE",
          `File not allowed in free static hosting: ${stripped}`,
        );
      }
      if (!isAllowedFile(stripped)) {
        throw new ApiError(
          400,
          "FORBIDDEN_FILE",
          `Unsupported file type: ${stripped}. Static sites may only include HTML, CSS, JS, images, and fonts.`,
        );
      }
      fileCount += 1;
      if (fileCount > 5000) {
        throw new ApiError(400, "INVALID_ZIP", "Too many files in the zip");
      }
      const dest = path.resolve(tmp, stripped);
      if (!dest.startsWith(tmp + path.sep)) {
        throw new ApiError(400, "INVALID_ZIP", "Zip contains an unsafe path");
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
    }

    const indexPath = path.join(tmp, "index.html");
    if (!fs.existsSync(indexPath)) {
      throw new ApiError(400, "NO_INDEX", "Site must include index.html at the root");
    }
    return tmp;
  } catch (err) {
    await fs.promises.rm(tmp, { recursive: true, force: true });
    throw err;
  }
}

export async function removeTemp(dir) {
  if (!dir) return;
  await fs.promises.rm(dir, { recursive: true, force: true });
}
