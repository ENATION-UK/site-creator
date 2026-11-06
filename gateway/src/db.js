import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

let db;

export function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function initDb() {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      email TEXT,
      agent TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cf_project TEXT NOT NULL UNIQUE,
      url TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS deploys (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_id);
    CREATE INDEX IF NOT EXISTS idx_deploys_site ON deploys(site_id);
    CREATE INDEX IF NOT EXISTS idx_deploys_created ON deploys(created_at);
  `);
  return db;
}
