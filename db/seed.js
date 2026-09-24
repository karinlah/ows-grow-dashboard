/**
 * זריעת מסד הנתונים מהייצוא הרשמי של Grow (17.9.2026).
 *
 * הייצוא הוא מקור האמת לכל מה שעד התאריך הזה — חלק ממיילי התשלום הישנים
 * נמחקו מהתיבה, ולכן אי אפשר לשחזר את ההיסטוריה מהמייל. קליטת המיילים
 * מתחילה מהתאריך הזה והלאה, והאסמכתא מונעת ספירה כפולה בחפיפה.
 *
 * הרצה: npm run seed   (מוחק ובונה מחדש את טבלת העסקאות)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { syncAdmin } = require('./admin');

const { SINCE_KEY } = db;

const BASELINE = path.join(__dirname, '..', 'data', 'baseline-2026-09-17.json');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'hello@onewomanshowacademy.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ows';
const ADMIN_NAME = process.env.ADMIN_NAME || 'קארין';

function seedAdmin() {
  syncAdmin({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME });
}

function seedTransactions() {
  if (!fs.existsSync(BASELINE)) {
    console.log(`לא נמצא קובץ בסיס ב-${BASELINE} — נזרע רק משתמש המנהלת.`);
    return 0;
  }
  const payload = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const rows = payload.transactions || [];

  const insert = db.prepare(`
    INSERT INTO transactions (
      asmachta, occurred_at, customer_name, customer_email, customer_phone,
      amount, fee, net, installments, payment_method, tx_type, card,
      service, product, session, status, source, message_id, parse_ok, raw_excerpt, created_at
    ) VALUES (
      @asmachta, @occurred_at, @customer_name, @customer_email, @customer_phone,
      @amount, @fee, @net, @installments, @payment_method, @tx_type, @card,
      @service, @product, @session, @status, @source, NULL, 1, NULL, @created_at
    )
  `);

  const now = new Date().toISOString();
  const load = db.transaction(() => {
    db.prepare("DELETE FROM transactions WHERE source = 'export'").run();
    for (const row of rows) insert.run({ ...row, created_at: now });
  });
  load();

  // קליטת המיילים מתחילה מיום הייצוא עצמו (לא מיום אחריו): הייצוא נלקח
  // באמצע היום, ועסקאות מאוחרות יותר באותו יום קיימות רק במייל.
  db.setSetting(SINCE_KEY, payload.cutoff);

  // ברירת המחדל: המספרים הגדולים בדשבורד מדברים על המאסטר קלאס, המוצר
  // היחיד שפתוח למכירה. שאר המוצרים ממשיכים להיקלט ומוצגים בנפרד.
  if (db.getSetting('focus_product', null) === null) {
    db.setSetting('focus_product', 'מאסטר קלאס קלוד קוד');
  }
  return rows.length;
}

seedAdmin();
const count = seedTransactions();

const totals = db
  .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM transactions WHERE status = 'charged'")
  .get();

console.log(`נזרעו ${count} עסקאות מהייצוא.`);
console.log(`בתוקף: ${totals.n} עסקאות, ${Number(totals.sum).toLocaleString('he-IL')} ₪`);
console.log(`קליטת מיילים תתחיל מ-${db.getSetting(SINCE_KEY)}`);
console.log(`התחברות: ${ADMIN_EMAIL}`);

// סגירה מפורשת לפני שהתהליך נגמר. בלעדיה better-sqlite3 הורס statements
// שנשארו פתוחים אחרי שסביבת Node כבר נהרסה, וזה מפיל את התהליך ב-SIGABRT
// (status 134) — מה שהפיל את הדיפלוי הראשון ב-Render.
// רק כשהקובץ הורץ ישירות; כשהוא נטען מ-seed-if-empty.js הסגירה שם.
if (require.main === module) db.close();
