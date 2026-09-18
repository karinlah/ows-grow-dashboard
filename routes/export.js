const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const COLUMNS = [
  ['occurred_at', 'תאריך'],
  ['customer_name', 'שם'],
  ['customer_email', 'מייל'],
  ['customer_phone', 'טלפון'],
  ['amount', 'שולם'],
  ['installments', 'תשלומים'],
  ['payment_method', 'אמצעי תשלום'],
  ['tx_type', 'סוג עסקה'],
  ['product', 'מוצר'],
  ['session', 'מועד'],
  ['service', 'עמוד מכירה'],
  ['asmachta', 'אסמכתא'],
  ['status', 'סטטוס'],
  ['source', 'מקור'],
];

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM transactions ORDER BY occurred_at DESC, id DESC')
    .all();

  const header = COLUMNS.map(([, label]) => label).join(',');
  const body = rows
    .map((row) => COLUMNS.map(([key]) => csvCell(row[key])).join(','))
    .join('\n');

  // BOM כדי שאקסל בעברית יפתח את הקובץ ב-UTF-8 ולא יציג ג'יבריש
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="grow-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${header}\n${body}`);
});

module.exports = router;
