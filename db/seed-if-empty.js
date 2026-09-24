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

// המנהלת מסונכרנת מהסביבה בכל עלייה — לא רק בזריעה הראשונה. בלי זה, שינוי
// ADMIN_EMAIL / ADMIN_PASSWORD ב-Render אחרי הדיפלוי הראשון לא משפיע, והכניסה
// נחסמת. מסנכרנים רק כשהשניים מוגדרים במפורש, כדי לא לדרוס סיסמה לברירת מחדל.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const { syncAdmin } = require('./admin');
  const email = syncAdmin({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'קארין',
  });
  console.log(`משתמש המנהלת סונכרן מהסביבה: ${email}`);
}

// חובה לפני סיום התהליך — ראי ההסבר ב-db/seed.js
db.close();
