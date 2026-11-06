import { config } from "./config.js";
import { getDb } from "./db.js";
import { ApiError, sendError } from "./errors.js";
import { hashKey, utcNow } from "./ids.js";

const hits = new Map();

export function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = hits.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      hits.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      sendError(res, new ApiError(429, "RATE_LIMIT", "Too many requests, try later"));
      return;
    }
    next();
  };
}

export function clientAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Missing client key");
    const row = getDb()
      .prepare("SELECT * FROM clients WHERE key_hash = ?")
      .get(hashKey(token));
    if (!row) throw new ApiError(401, "UNAUTHORIZED", "Invalid client key");
    if (row.disabled) throw new ApiError(403, "DISABLED", "This client is disabled");
    getDb()
      .prepare("UPDATE clients SET last_seen_at = ? WHERE id = ?")
      .run(utcNow(), row.id);
    req.client = row;
    next();
  } catch (err) {
    sendError(res, err);
  }
}

export function adminAuth(req, res, next) {
  if (!config.adminPassword) {
    res
      .status(503)
      .send("ADMIN_PASSWORD is not set. Copy gateway/.env.example to gateway/.env first.");
    return;
  }
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="trade-site-admin"');
    res.status(401).send("Authentication required");
    return;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const user = sep === -1 ? decoded : decoded.slice(0, sep);
  const pass = sep === -1 ? "" : decoded.slice(sep + 1);
  if (user !== config.adminUser || pass !== config.adminPassword) {
    res.set("WWW-Authenticate", 'Basic realm="trade-site-admin"');
    res.status(401).send("Invalid credentials");
    return;
  }
  next();
}
