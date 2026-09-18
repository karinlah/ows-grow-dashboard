/**
 * בדיקת הפרסור על גוף מייל אמיתי מ-Grow: node scripts/test-parser.js
 * אין כאן תלות בתיבת המייל — רק בטקסט עצמו.
 */

const assert = require('assert');
const { parsePaymentEmail, splitService } = require('../lib/growParser');

const SUBJECT = 'בוצע תשלום עבור בעל העסק';

/* --- 1. מייל רגיל: כתובת המייל כטקסט אחרי "מייל:" --- */
const plain = `| |
| [](https://grow.business) |
| היי קארין לחיאני, |
| אנחנו שמחים לעדכן אותך שבוצע תשלום של 450 ש"ח. |
| ממי התשלום |
| שם: קרן אור תוהמי לובין |
| טלפון: 0522886077 |
| מייל: kerenortohami@gmail.com |
| עוד פרטים על העסקה |
| סוג עסקה: רגיל |
| אמצעי תשלום: Bit |
| אשראי: 2128...Visa |
| אסמכתא: 174977529 |
| עבור שירות: 28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד |
| בברכה, צוות Grow |
| שם המוצר | כמות | מחיר | סה״כ |
| מאסטר קלאס קלוד קוד | 1 | ₪450.00 | ₪450.00 |
| סה״כ שולם | ₪450.00 |`;

const a = parsePaymentEmail({
  subject: SUBJECT,
  text: plain,
  html: '',
  date: new Date('2026-09-17T09:46:16Z'),
  messageId: '<a@grow>',
});

assert.ok(a.ok, `הפרסור נכשל: ${a.reason}`);
assert.strictEqual(a.transaction.asmachta, '174977529');
assert.strictEqual(a.transaction.amount, 450);
assert.strictEqual(a.transaction.customer_name, 'קרן אור תוהמי לובין');
assert.strictEqual(a.transaction.customer_email, 'kerenortohami@gmail.com');
assert.strictEqual(a.transaction.customer_phone, '0522886077');
assert.strictEqual(a.transaction.payment_method, 'Bit');
assert.strictEqual(a.transaction.product, 'מאסטר קלאס קלוד קוד');
assert.strictEqual(a.transaction.session, '28.9 בשעות 18:00-20:30');
assert.strictEqual(a.transaction.occurred_at, '2026-09-17 12:46'); // שעון ישראל
console.log('✓ מייל רגיל');

/* --- 2. המקרה הקריטי: כתובת המייל קיימת רק כקישור mailto ב-HTML.
       בלי הנפילה חזרה ל-HTML השורה נראית ריקה והלקוחה מאבדת זיהוי. --- */
const noEmailInText = plain.replace('| מייל: kerenortohami@gmail.com |\n', '');
const html = `<table><tr><td>מייל: <a href="mailto:Sharfori@gmail.com">Sharfori@gmail.com</a></td></tr></table>`;

const b = parsePaymentEmail({
  subject: SUBJECT,
  text: noEmailInText,
  html,
  date: new Date('2026-09-17T09:46:16Z'),
  messageId: '<b@grow>',
});

assert.ok(b.ok, `הפרסור נכשל: ${b.reason}`);
assert.strictEqual(b.transaction.customer_email, 'sharfori@gmail.com');
console.log('✓ כתובת מייל שמגיעה רק כקישור mailto');

/* --- 3. הוראת קבע בתשלומים, בלי שורת "מייל" בכלל --- */
const standing = `| אנחנו שמחים לעדכן אותך שבוצע תשלום של 220 ש"ח ב- 6 תשלומים. |
| שם: דרור ויקטור |
| טלפון: 0547916941 |
| סוג עסקה: הוראת קבע |
| אמצעי תשלום: אשראי |
| אשראי: 5911...Visa |
| אסמכתא: 511111111 |
| עבור שירות: מחזור ספטמבר 2026 ONE WOMAN SHOW |`;

const c = parsePaymentEmail({
  subject: SUBJECT,
  text: standing,
  html: '',
  date: new Date('2026-09-07T02:19:17Z'),
  messageId: '<c@grow>',
});

assert.ok(c.ok, `הפרסור נכשל: ${c.reason}`);
assert.strictEqual(c.transaction.amount, 220);
assert.strictEqual(c.transaction.installments, 6);
assert.strictEqual(c.transaction.tx_type, 'הוראת קבע');
assert.strictEqual(c.transaction.customer_email, '');
assert.strictEqual(c.transaction.product, 'ONE WOMAN SHOW');
assert.strictEqual(c.transaction.session, 'מחזור ספטמבר 2026');
console.log('✓ הוראת קבע בתשלומים, בלי שורת מייל');

/* --- 4. מייל פגום — חייב להיכשל במפורש, לא להיכנס בשקט עם נתונים חלקיים --- */
const broken = parsePaymentEmail({
  subject: SUBJECT,
  text: '| שם: מישהי | טלפון: 050 |',
  html: '',
  date: new Date(),
  messageId: '<d@grow>',
});
assert.strictEqual(broken.ok, false);
console.log(`✓ מייל פגום נדחה ("${broken.reason}")`);

/* --- 5. המקרה שהפיל את הפרסור בפועל: plain text בלי מפרידי "|",
       שזורם ברצף ונשבר באמצע שורה. כאן "אסמכתא" ו"עבור שירות" יושבים
       על אותה שורה, שם הלקוחה באמצע שורה, והחתימה "בברכה," נדבקת לשם
       המוצר. אם זה נשבר — האסמכתא יוצאת פגומה וההגנה מפני כפילויות
       מפסיקה לעבוד, ועסקאות נספרות פעמיים. --- */
const flowed = `היי קארין לחיאני, אנחנו שמחים לעדכן אותך שבוצע תשלום של 450 ש"ח. ממי התשלום שם: עגור אלחריזי טלפון: 0505466042 מייל: agurel08@gmail.com עוד פרטים על העסקה סוג
עסקה: רגיל אמצעי תשלום: Bit אשראי: 2128...Visa אסמכתא: 174825447 עבור שירות:
28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד בברכה,
צוות Grow

שם המוצר כמות מחיר סה״כ מאסטר קלאס קלוד קוד1₪450.00₪450.00 סה״כ שולם ₪450.00`;

const e = parsePaymentEmail({
  subject: SUBJECT,
  text: flowed,
  html: '',
  date: new Date('2026-09-16T07:11:20Z'),
  messageId: '<e@grow>',
});

assert.ok(e.ok, `הפרסור נכשל: ${e.reason}`);
assert.strictEqual(e.transaction.asmachta, '174825447'); // ולא "174825447 עבור שירות:"
assert.strictEqual(e.transaction.customer_name, 'עגור אלחריזי');
assert.strictEqual(e.transaction.customer_phone, '0505466042'); // ולא הטלפון + כל שאר השורה
assert.strictEqual(e.transaction.customer_email, 'agurel08@gmail.com');
assert.strictEqual(e.transaction.payment_method, 'Bit');
assert.strictEqual(e.transaction.card, '2128...Visa');
assert.strictEqual(e.transaction.service, '28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד');
assert.strictEqual(e.transaction.product, 'מאסטר קלאס קלוד קוד'); // ולא "...קוד בברכה,"
assert.strictEqual(e.transaction.session, '28.9 בשעות 18:00-20:30');
console.log('✓ טקסט זורם בלי מפרידים — האסמכתא והשם נשלפים נקי');

/* --- 6. אותו מבנה, אבל השירות הוא מנוי בלי מועד --- */
const sub = flowed
  .replace('אסמכתא: 174825447', 'אסמכתא: 517479071')
  .replace('28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד בברכה,', 'מנוי מתחדש OWS בברכה,');

const f = parsePaymentEmail({ subject: SUBJECT, text: sub, html: '', date: new Date(), messageId: '<f@grow>' });
assert.ok(f.ok, `הפרסור נכשל: ${f.reason}`);
assert.strictEqual(f.transaction.asmachta, '517479071');
assert.strictEqual(f.transaction.product, 'מנוי מתחדש OWS');
assert.strictEqual(f.transaction.session, '');
console.log('✓ מנוי בלי מועד — בלי "בברכה," נדבק');

/* --- 6ב. Grow שובר שורות לפי רוחב, ולפעמים באמצע הערך עצמו.
       עצירה בשבירת השורה הייתה מחזירה "מנוי" במקום "מנוי מתחדש OWS",
       כלומר ממציאה מוצר שלא קיים ומפצלת את ההכנסות בין שניים. --- */
const wrapped = sub.replace('עבור שירות:\n מנוי מתחדש OWS בברכה,', 'עבור שירות: מנוי\nמתחדש OWS בברכה,')
  .replace('עבור שירות:\nמנוי מתחדש OWS בברכה,', 'עבור שירות: מנוי\nמתחדש OWS בברכה,');

const g = parsePaymentEmail({ subject: SUBJECT, text: wrapped, html: '', date: new Date(), messageId: '<g@grow>' });
assert.ok(g.ok, `הפרסור נכשל: ${g.reason}`);
assert.strictEqual(g.transaction.service, 'מנוי מתחדש OWS');
assert.strictEqual(g.transaction.product, 'מנוי מתחדש OWS');
console.log('✓ ערך שנשבר באמצע לשתי שורות מאוחה בחזרה');

/* --- 7. פיצול עמוד מכירה למוצר + מועד --- */
const cases = [
  ['16.9 בשעות 10:00-12:30 מאסטר קלאס קלוד קוד', 'מאסטר קלאס קלוד קוד', '16.9 בשעות 10:00-12:30'],
  ['21.10 מאסטר קלאס קלוד קוד', 'מאסטר קלאס קלוד קוד', '21.10'],
  ['מאסטר קלאס קלוד קוד', 'מאסטר קלאס קלוד קוד', ''],
];
for (const [raw, product, session] of cases) {
  const out = splitService(raw);
  assert.strictEqual(out.product, product, `מוצר שגוי עבור "${raw}": ${out.product}`);
  assert.strictEqual(out.session, session, `מועד שגוי עבור "${raw}": ${out.session}`);
}
console.log('✓ שלושת עמודי המכירה מתאחדים למוצר אחד');

console.log('\nכל הבדיקות עברו.');
