/** Portable schema (SQLite + PostgreSQL). {{ID}} is replaced per dialect. Timestamps are ISO-8601 UTC strings. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, url TEXT, data_class TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, poll_seconds INTEGER NOT NULL,
  last_attempt_at TEXT, last_success_at TEXT, last_change_at TEXT, last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0, last_latency_ms INTEGER, verified INTEGER NOT NULL DEFAULT 0
);
-- One row per distinct quote state (inserted only when the value changes => no duplicates).
CREATE TABLE IF NOT EXISTS quotes (
  id {{ID}}, source_id TEXT NOT NULL, entity TEXT NOT NULL, instrument TEXT NOT NULL,
  buy DOUBLE PRECISION, sell DOUBLE PRECISION, mid DOUBLE PRECISION,
  source_time TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, data_class TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS quotes_entity_time ON quotes(entity, instrument, first_seen_at);
-- Detected changes between consecutive quote states of the same entity.
CREATE TABLE IF NOT EXISTS price_changes (
  id {{ID}}, entity TEXT NOT NULL, instrument TEXT NOT NULL, source_id TEXT NOT NULL,
  old_buy DOUBLE PRECISION, new_buy DOUBLE PRECISION, old_sell DOUBLE PRECISION, new_sell DOUBLE PRECISION,
  direction INTEGER NOT NULL, detected_at TEXT NOT NULL, prev_seen_at TEXT NOT NULL, poll_seconds INTEGER NOT NULL,
  UNIQUE(entity, instrument, detected_at)
);
CREATE INDEX IF NOT EXISTS changes_time ON price_changes(detected_at);
CREATE TABLE IF NOT EXISTS daily_fx (
  date TEXT PRIMARY KEY, egp DOUBLE PRECISION, eur DOUBLE PRECISION, jpy DOUBLE PRECISION, gbp DOUBLE PRECISION,
  cad DOUBLE PRECISION, sek DOUBLE PRECISION, chf DOUBLE PRECISION, xau DOUBLE PRECISION, try_ DOUBLE PRECISION,
  zar DOUBLE PRECISION, brl DOUBLE PRECISION, inr DOUBLE PRECISION, ngn DOUBLE PRECISION, sar DOUBLE PRECISION,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS macro (
  series_id TEXT NOT NULL, date TEXT NOT NULL, value DOUBLE PRECISION, source TEXT NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY(series_id, date)
);
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, published_at TEXT,
  fetched_at TEXT NOT NULL, lang TEXT, label TEXT, reason TEXT, classifier TEXT, relevance DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS news_pub ON news(published_at);
CREATE TABLE IF NOT EXISTS forecasts (
  id {{ID}}, created_at TEXT NOT NULL, horizon TEXT NOT NULL, target_time TEXT NOT NULL, model TEXT NOT NULL,
  status TEXT NOT NULL, direction TEXT, p_up DOUBLE PRECISION, p_flat DOUBLE PRECISION, p_down DOUBLE PRECISION,
  base_value DOUBLE PRECISION, low DOUBLE PRECISION, high DOUBLE PRECISION, evidence TEXT, drivers TEXT,
  resolved_at TEXT, actual_value DOUBLE PRECISION, actual_class TEXT, hit INTEGER,
  UNIQUE(horizon, target_time, model)
);
CREATE TABLE IF NOT EXISTS alerts (
  id {{ID}}, created_at TEXT NOT NULL, rule TEXT NOT NULL, severity TEXT NOT NULL, strength TEXT,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, body_ar TEXT, body_en TEXT, data_json TEXT, sources_json TEXT,
  freshness_json TEXT, dedupe_key TEXT NOT NULL UNIQUE, channels TEXT
);
CREATE INDEX IF NOT EXISTS alerts_time ON alerts(created_at);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL
);
`;
