const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * שינוי "המוצר במוקד". מחרוזת ריקה = להציג את כל המוצרים ביחד.
 * זו רק בחירת תצוגה — הקליטה ממשיכה לאסוף כל עסקה מ-Grow בלי קשר.
 */
router.post('/focus', requireAdmin, (req, res) => {
  const product = String((req.body && req.body.product) || '').trim();

  if (product) {
    const exists = db
      .prepare("SELECT 1 FROM transactions WHERE product = ? AND status = 'charged' LIMIT 1")
      .get(product);
    if (!exists) return res.status(400).json({ error: 'לא נמצא מוצר בשם הזה' });
  }

  db.setSetting('focus_product', product);
  res.json({ focus: product });
});

module.exports = router;
