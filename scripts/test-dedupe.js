/**
 * מוודא שעסקה שכבר נזרעה מהייצוא לא תיספר שוב כשהמייל שלה ייקלט:
 *   node scripts/test-dedupe.js
 * רץ על מסד נתונים זמני בזיכרון — לא נוגע בנתונים האמיתיים.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parsePaymentEmail } = require('../lib/growParser');

const db = new Database(':memory:');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

const insert = db.prepare(`
  INSERT INTO transactions (asmachta, occurred_at, amount, service, product, session, status, source, created_at)
  VALUES (@asmachta, @occurred_at, @amount, @service, @product, @session, @status, @source, @created_at)
`);

// אותה עסקה בדיוק כפי שהגיעה מהייצוא הרשמי
insert.run({
  asmachta: '174977529',
  occurred_at: '2026-09-17',
  amount: 450,
  service: '28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד',
  product: 'מאסטר קלאס קלוד קוד',
  session: '28.9 בשעות 18:00-20:30',
  status: 'charged',
  source: 'export',
  created_at: new Date().toISOString(),
});

// ...ועכשיו מגיע המייל של אותה עסקה
const parsed = parsePaymentEmail({
  subject: 'בוצע תשלום עבור בעל העסק',
  text: `| אנחנו שמחים לעדכן אותך שבוצע תשלום של 450 ש"ח. |
| שם: קרן אור תוהמי לובין |
| אסמכתא: 174977529 |
| עבור שירות: 28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד |`,
  html: '',
  date: new Date('2026-09-17T09:46:16Z'),
  messageId: '<dup@grow>',
});

assert.ok(parsed.ok);

let rejected = false;
try {
  insert.run({ ...parsed.transaction, created_at: new Date().toISOString() });
} catch (e) {
  rejected = String(e.message).includes('UNIQUE');
}

assert.ok(rejected, 'העסקה הכפולה נכנסה! האסמכתא לא חסמה אותה.');

const totals = db.prepare("SELECT COUNT(*) AS n, SUM(amount) AS sum FROM transactions WHERE status='charged'").get();
assert.strictEqual(totals.n, 1);
assert.strictEqual(totals.sum, 450);

console.log('✓ מייל של עסקה שכבר נזרעה מהייצוא נדחה — ההרשמות וההכנסות לא נספרו פעמיים');
