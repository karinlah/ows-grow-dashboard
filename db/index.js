const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// On a host with a persistent disk (Render), DB_PATH points at the mounted volume so the database
// survives redeploys. Locally it just defaults to this folder.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'grow.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// A brand-new persistent disk starts with an empty file — better-sqlite3 opens it happily, but
// there are no tables yet. Bootstrap the schema so the app boots instead of crashing on the first
// query; on a database that already has real data this is a no-op.
const hasSchema = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transactions'").get();
if (!hasSchema) {
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

// --- additive migrations -------------------------------------------------
// New columns/tables go here rather than in one-off scripts, so production picks them up
// automatically on the next deploy. Each one must be safe to run repeatedly.

function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// (no migrations yet — the schema above is the first version)
void addColumn;

module.exports = db;

module.exports.getSetting = function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
};

module.exports.setSetting = function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
};
