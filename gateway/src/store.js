import { getDb } from "./db.js";
import { utcDayStart } from "./ids.js";

export function createClient({ id, keyHash, email, agent, now }) {
  getDb()
    .prepare(
      `INSERT INTO clients (id, key_hash, email, agent, created_at, last_seen_at, disabled)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, keyHash, email || null, agent || null, now, now);
}

export function getClient(id) {
  return getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id);
}

export function countClientSites(clientId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS n FROM sites WHERE client_id = ? AND status != 'disabled'")
    .get(clientId).n;
}

export function countClientDeploysToday(clientId) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM deploys d
       JOIN sites s ON s.id = d.site_id
       WHERE s.client_id = ? AND d.created_at >= ?`,
    )
    .get(clientId, utcDayStart()).n;
}

export function insertSite(row) {
  getDb()
    .prepare(
      `INSERT INTO sites (id, client_id, name, cf_project, url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.client_id,
      row.name,
      row.cf_project,
      row.url,
      row.status,
      row.created_at,
      row.updated_at,
    );
}

export function updateSite(id, fields) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  getDb()
    .prepare(`UPDATE sites SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function getSiteForClient(siteId, clientId) {
  return getDb()
    .prepare("SELECT * FROM sites WHERE id = ? AND client_id = ?")
    .get(siteId, clientId);
}

export function getSite(siteId) {
  return getDb().prepare("SELECT * FROM sites WHERE id = ?").get(siteId);
}

export function listClientSites(clientId) {
  return getDb()
    .prepare("SELECT * FROM sites WHERE client_id = ? ORDER BY created_at DESC")
    .all(clientId);
}

export function insertDeploy(row) {
  getDb()
    .prepare(
      `INSERT INTO deploys (id, site_id, status, error, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.site_id, row.status, row.error || null, row.created_at);
}

export function stats() {
  const db = getDb();
  const today = utcDayStart();
  return {
    clients: db.prepare("SELECT COUNT(*) AS n FROM clients").get().n,
    sites: db.prepare("SELECT COUNT(*) AS n FROM sites WHERE status != 'disabled'").get().n,
    disabledSites: db.prepare("SELECT COUNT(*) AS n FROM sites WHERE status = 'disabled'").get().n,
    deploysToday: db.prepare("SELECT COUNT(*) AS n FROM deploys WHERE created_at >= ?").get(today)
      .n,
    deploysTotal: db.prepare("SELECT COUNT(*) AS n FROM deploys").get().n,
  };
}

export function listClients() {
  return getDb()
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id AND s.status != 'disabled') AS site_count,
              (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id) AS site_total
       FROM clients c
       ORDER BY c.last_seen_at DESC`,
    )
    .all();
}

export function listSites() {
  return getDb()
    .prepare(
      `SELECT s.*, c.email, c.agent, c.id AS client_id
       FROM sites s
       JOIN clients c ON c.id = s.client_id
       ORDER BY s.updated_at DESC`,
    )
    .all();
}

export function disableClient(id, disabled) {
  getDb().prepare("UPDATE clients SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, id);
}
