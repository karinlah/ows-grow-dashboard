const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin);

router.get('/', (req, res) => {
  const { product, session, q } = req.query;
  const where = [];
  const params = {};

  if (product) {
    where.push('product = @product');
    params.product = product;
  }
  if (session) {
    where.push("CASE WHEN session IS NULL OR session = '' THEN '—' ELSE session END = @session");
    params.session = session;
  }
  if (q) {
    where.push('(customer_name LIKE @q OR customer_email LIKE @q OR customer_phone LIKE @q OR asmachta LIKE @q)');
    params.q = `%${String(q).trim()}%`;
  }

  const rows = db
    .prepare(
      `SELECT id, asmachta, occurred_at, customer_name, customer_email, customer_phone,
              amount, installments, payment_method, tx_type, product, session, status, source
         FROM transactions
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY occurred_at DESC, id DESC`
    )
    .all(params);

  // המועדים של המוצר הנבחר, לסלקט "סדנה". נספרים בלי החיפוש והמועד עצמו,
  // כדי שהרשימה לא תתכווץ תוך כדי סינון.
  const sessions = product
    ? db
        .prepare(
          `SELECT CASE WHEN session IS NULL OR session = '' THEN '—' ELSE session END AS session,
                  COUNT(*) AS count
             FROM transactions WHERE status = 'charged' AND product = ?
             GROUP BY 1`
        )
        .all(product)
    : [];

  res.json({ count: rows.length, rows, sessions });
});

/** מיילים שהפרסור נכשל עליהם — כדי שאפשר יהיה לראות מה פוספס ולתקן */
router.get('/failures', (req, res) => {
  const rows = db.prepare('SELECT * FROM ingest_failures ORDER BY id DESC LIMIT 50').all();
  res.json({ count: rows.length, rows });
});

module.exports = router;
