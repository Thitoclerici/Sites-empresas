// Persistência em SQLite (node:sqlite, sem dependências nativas).
// Esquema pensado para migrar para PostgreSQL na Fase 2 sem mudar o domínio.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR, DB_PATH, UPLOAD_DIR } from './paths.ts';

export { DATA_DIR, UPLOAD_DIR };

mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

const MIGRATIONS: string[] = [
  `CREATE TABLE businesses (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_ref TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    segment TEXT NOT NULL,
    category TEXT NOT NULL,
    lat REAL, lon REAL,
    address TEXT NOT NULL DEFAULT '{}',
    phone TEXT,
    website TEXT,
    website_status TEXT NOT NULL,
    socials TEXT NOT NULL DEFAULT '{}',
    stage TEXT NOT NULL DEFAULT 'identified',
    saved INTEGER NOT NULL DEFAULT 0,
    priority_score INTEGER NOT NULL DEFAULT 0,
    priority_reasons TEXT NOT NULL DEFAULT '[]',
    source_attribution TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '{}',
    google_place_id TEXT,
    fetched_at TEXT NOT NULL,
    investigated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_business_segment ON businesses(segment);
  CREATE INDEX idx_business_stage ON businesses(stage);

  CREATE TABLE searches (
    id TEXT PRIMARY KEY,
    params TEXT NOT NULL,
    area_label TEXT,
    result_ids TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    note TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    retrieved_at TEXT NOT NULL
  );
  CREATE INDEX idx_facts_business ON facts(business_id, field);

  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    rights TEXT NOT NULL,
    source TEXT NOT NULL,
    note TEXT,
    palette TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    spec TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE site_versions (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    spec TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_activities_business ON activities(business_id, created_at);

  -- Pontos de validação humana (publicação, uso de material, contato).
  CREATE TABLE approvals (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    site_id TEXT,
    kind TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE geocache (
    query TEXT PRIMARY KEY,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  // 2: links públicos das demonstrações
  `ALTER TABLE sites ADD COLUMN share_token TEXT;
  ALTER TABLE sites ADD COLUMN share_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sites ADD COLUMN share_views INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sites ADD COLUMN share_last_view TEXT;
  CREATE UNIQUE INDEX idx_sites_share_token ON sites(share_token);`,
];

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number | null };
  const current = row?.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]!);
      db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(i + 1, now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
export const json = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

migrate();
