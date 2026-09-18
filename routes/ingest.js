const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { runIngest } = require('../lib/ingest');

const router = express.Router();

/** "רענון עכשיו" — שליפה מיידית במקום להמתין לסבב האוטומטי */
router.post('/run', requireAdmin, async (req, res, next) => {
  try {
    const stats = await runIngest();
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
