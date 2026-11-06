import crypto from "node:crypto";

export function clientId() {
  return `c_${crypto.randomBytes(6).toString("hex")}`;
}

export function clientKey() {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function slugify(name) {
  const slug = String(name || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return slug || "site";
}

export function projectName(cid, siteName) {
  const short = cid.replace(/^c_/, "").slice(0, 8);
  const slug = slugify(siteName);
  const rand = crypto.randomBytes(2).toString("hex");
  return `ts-${short}-${slug}-${rand}`.replace(/[^a-z0-9-]/g, "").slice(0, 50);
}

export function utcNow() {
  return new Date().toISOString();
}

export function utcDayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
