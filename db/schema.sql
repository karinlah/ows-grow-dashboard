-- OWS — דשבורד הרשמות Grow
-- סכמה ראשונית למסד נתונים חדש. שינויים מאוחרים יותר נעשים כמיגרציות
-- אדיטיביות ב-db/index.js, כדי שפרודקשן יקלוט אותם לבד בדיפלוי הבא.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin')),
  password_hash TEXT NOT NULL
);

-- כל שורה = עסקה אחת ב-Grow.
-- אסמכתא היא המפתח הייחודי: היא מופיעה גם בייצוא הרשמי וגם במייל, ולכן
-- עסקה שכבר נזרעה מהייצוא לא תיספר שוב כשהמייל שלה ייקלט.
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asmachta TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  amount REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  installments INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT,
  tx_type TEXT,
  card TEXT,
  service TEXT,
  product TEXT,
  session TEXT,
  status TEXT NOT NULL DEFAULT 'charged' CHECK(status IN ('charged','credited')),
  source TEXT NOT NULL CHECK(source IN ('export','email')),
  message_id TEXT,
  parse_ok INTEGER NOT NULL DEFAULT 1,
  raw_excerpt TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_occurred ON transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_product ON transactions(product);

-- מיילים שהפרסור נכשל עליהם — נשמרים כדי שאפשר יהיה לראות מה פוספס
-- ולתקן, במקום שייעלמו בשקט.
CREATE TABLE IF NOT EXISTS ingest_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE,
  occurred_at TEXT,
  reason TEXT NOT NULL,
  raw_excerpt TEXT,
  created_at TEXT NOT NULL
);

-- לוג הרצות — כדי לראות בדשבורד מתי רצה שליפה אחרונה ומה היא מצאה.
CREATE TABLE IF NOT EXISTS ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  scanned INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
