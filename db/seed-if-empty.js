/**
 * רץ אוטומטית לפני `npm start`. זורע רק אם מסד הנתונים עדיין ריק, כדי
 * שדיפלוי ראשון על דיסק חדש יעלה עם הנתונים — ודיפלוי רגיל לא יגע בכלום.
 */

require('dotenv').config();

const db = require('../db');

const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
const hasTx = db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;

if (hasUsers && hasTx) {
  console.log(`מסד הנתונים כבר מאוכלס (${hasTx} עסקאות) — מדלגים על זריעה.`);
} else {
  console.log('מסד נתונים ריק — זורעים מהייצוא הרשמי.');
  require('./seed.js');
}

// חובה לפני סיום התהליך — ראי ההסבר ב-db/seed.js
db.close();
