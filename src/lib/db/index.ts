import { config } from "../config";
import { SCHEMA } from "./schema";
import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, any>;
export interface DB {
  dialect: "sqlite" | "postgres";
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

let instance: Promise<DB> | null = null;

/** Convert `?` placeholders to `$1..$n` for Postgres. */
function toPg(sql: string) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }

async function createSqlite(): Promise<DB> {
  const Database = (await import("better-sqlite3")).default;
  const file = path.resolve(process.cwd(), config.sqlitePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA.replaceAll("{{ID}}", "INTEGER PRIMARY KEY AUTOINCREMENT"));
  return {
    dialect: "sqlite",
    async all(sql, params = []) { return db.prepare(sql).all(...(params as any[])) as any; },
    async get(sql, params = []) { return db.prepare(sql).get(...(params as any[])) as any; },
    async run(sql, params = []) { const r = db.prepare(sql).run(...(params as any[])); return { changes: r.changes }; },
  };
}

async function createPg(): Promise<DB> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5,
    ssl: /sslmode=require|supabase|neon/.test(config.databaseUrl) ? { rejectUnauthorized: false } : undefined });
  await pool.query(SCHEMA.replaceAll("{{ID}}", "BIGSERIAL PRIMARY KEY"));
  return {
    dialect: "postgres",
    async all(sql, params = []) { return (await pool.query(toPg(sql), params as any[])).rows; },
    async get(sql, params = []) { return (await pool.query(toPg(sql), params as any[])).rows[0]; },
    async run(sql, params = []) { const r = await pool.query(toPg(sql), params as any[]); return { changes: r.rowCount ?? 0 }; },
  };
}

export function getDb(): Promise<DB> {
  if (!instance) instance = config.databaseUrl ? createPg() : createSqlite();
  return instance;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const r = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  if (!r) return fallback;
  try { return { ...(fallback as any), ...JSON.parse(r.value) }; } catch { return fallback; }
}
export async function setSetting(key: string, value: unknown) {
  const db = await getDb();
  await db.run("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, JSON.stringify(value)]);
}
