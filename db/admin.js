const bcrypt = require('bcryptjs');
const db = require('./index');

/**
 * יוצרת או מעדכנת את משתמש המנהלת לפי ADMIN_EMAIL / ADMIN_PASSWORD.
 * רצה בכל עלייה (דרך seed-if-empty), כך שהערכים בלוח הבקרה של Render הם
 * מקור האמת — שינוי שלהם שם נכנס לתוקף בדיפלוי/ריסטארט הבא, ולא רק בזריעה
 * הראשונה על דיסק ריק.
 */
function syncAdmin({ email, password, name }) {
  const normalizedEmail = email.trim().toLowerCase();
  const hash = bcrypt.hashSync(password.trim().toLowerCase(), 10);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?').run(name, hash, existing.id);
  } else {
    db.prepare('INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)')
      .run(name, normalizedEmail, 'admin', hash);
  }
  return normalizedEmail;
}

module.exports = { syncAdmin };
