const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { isConfigured, SINCE_KEY } = require('../lib/ingest');

const router = express.Router();

router.use(requireLogin);

/**
 * כל הצבירות נספרות על עסקאות בתוקף בלבד (`status = 'charged'`).
 * עסקה שזוכתה נשמרת במסד לצורך תיעוד, אבל לא נכנסת להרשמות ולא להכנסות.
 */
const CHARGED = "status = 'charged'";

/**
 * "מוצר במוקד" — המוצר שהמספרים הגדולים בראש הדשבורד מדברים עליו.
 * הקליטה ממשיכה לאסוף *כל* עסקה מ-Grow, כך שאם ייפתח מוצר נוסף הוא כבר
 * יהיה במסד; הוא פשוט יוצג בנפרד ולא יתערבב בסך הכל. ערך ריק = הכול ביחד.
 */
const FOCUS_KEY = 'focus_product';

router.get('/', (req, res) => {
  const focus = db.getSetting(FOCUS_KEY, '');
  const focusFilter = focus ? 'AND product = @focus' : '';
  const params = focus ? { focus } : {};

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS revenue,
              COALESCE(SUM(net), 0) AS net,
              COUNT(DISTINCT product) AS products
         FROM transactions WHERE ${CHARGED} ${focusFilter}`
    )
    .get(params);

  const products = db
    .prepare(
      `SELECT product,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS revenue
         FROM transactions WHERE ${CHARGED} ${focusFilter}
         GROUP BY product
         ORDER BY revenue DESC`
    )
    .all(params);

  // המוצרים שמחוץ למוקד — נאספים ומוצגים בנפרד, כדי שלא ייעלמו בשקט
  const others = focus
    ? db
        .prepare(
          `SELECT product, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS revenue
             FROM transactions WHERE ${CHARGED} AND product <> @focus
             GROUP BY product ORDER BY revenue DESC`
        )
        .all({ focus })
    : [];

  const allProducts = db
    .prepare(`SELECT DISTINCT product FROM transactions WHERE ${CHARGED} ORDER BY product`)
    .all()
    .map((r) => r.product);

  const sessions = db
    .prepare(
      `SELECT product,
              CASE WHEN session IS NULL OR session = '' THEN '—' ELSE session END AS session,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS revenue,
              MIN(occurred_at) AS first_sale,
              MAX(occurred_at) AS last_sale
         FROM transactions WHERE ${CHARGED} ${focusFilter}
         GROUP BY product, session
         ORDER BY revenue DESC`
    )
    .all(params);

  const byProduct = products.map((p) => ({
    ...p,
    sessions: sessions.filter((s) => s.product === p.product),
  }));

  const methods = db
    .prepare(
      `SELECT CASE WHEN payment_method IS NULL OR payment_method = '' THEN 'לא ידוע' ELSE payment_method END AS method,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS revenue
         FROM transactions WHERE ${CHARGED} ${focusFilter}
         GROUP BY method ORDER BY count DESC`
    )
    .all(params);

  const credited = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
         FROM transactions WHERE status = 'credited' ${focusFilter}`
    )
    .get(params);

  const sources = db
    .prepare(`SELECT source, COUNT(*) AS count FROM transactions WHERE ${CHARGED} ${focusFilter} GROUP BY source`)
    .all(params);

  const failures = db.prepare('SELECT COUNT(*) AS n FROM ingest_failures').get().n;

  const lastRun = db
    .prepare('SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 1')
    .get();

  res.json({
    totals: {
      count: totals.count,
      revenue: totals.revenue,
      net: totals.net,
      products: totals.products,
      avg: totals.count ? totals.revenue / totals.count : 0,
    },
    focus,
    allProducts,
    others,
    products: byProduct,
    methods,
    credited,
    sources: Object.fromEntries(sources.map((s) => [s.source, s.count])),
    ingest: {
      configured: isConfigured(),
      since: db.getSetting(SINCE_KEY, null),
      lastRun: lastRun || null,
      failures,
    },
  });
});

module.exports = router;
