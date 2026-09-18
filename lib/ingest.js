/**
 * שליפת מיילי התשלום מ-Grow דרך IMAP וכתיבתם למסד הנתונים.
 *
 * למה IMAP ולא API של גוגל: זה דורש רק "סיסמת אפליקציה" של ג'ימייל
 * (אותו דבר שכבר הוגדר ל-SMTP ב-ows-crm), בלי פרויקט Google Cloud
 * ובלי מסך הרשאות. קריאה בלבד — המערכת לא מוחקת ולא משנה שום מייל.
 *
 * הגנה מפני כפילויות: `asmachta` הוא UNIQUE בטבלה, ולכן אפשר לסרוק
 * בחפיפה על תקופה שכבר נקלטה בלי לספור עסקה פעמיים.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('../db');
const { PAY_SUBJECT, parsePaymentEmail } = require('./growParser');

const GROW_SENDER = 'grow.security';
const { SINCE_KEY } = db;

function config() {
  return {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,
  };
}

function isConfigured() {
  return Boolean(process.env.IMAP_USER && process.env.IMAP_PASS);
}

/**
 * מאיזה תאריך לסרוק. ברירת המחדל היא תאריך הייצוא הרשמי — כל מה שלפניו
 * כבר נזרע מהייצוא, ומיילים ישנים ממילא נמחקו חלקית מהתיבה.
 */
function since() {
  const value = db.getSetting(SINCE_KEY, '2026-09-17');
  const d = new Date(`${value}T00:00:00+03:00`);
  return Number.isNaN(d.valueOf()) ? new Date('2026-09-17T00:00:00+03:00') : d;
}

/**
 * ה-statements מוכנים רק כשבאמת סורקים, ולא בטעינת המודול.
 * statement שנשאר פתוח כשתהליך קצר-חיים נסגר גורם ל-better-sqlite3 להרוס
 * אותו אחרי שסביבת Node כבר נהרסה — וזה מפיל את התהליך ב-SIGABRT.
 */
let statements = null;
function prepared() {
  if (statements) return statements;
  statements = {
    insert: db.prepare(`
  INSERT INTO transactions (
    asmachta, occurred_at, customer_name, customer_email, customer_phone,
    amount, fee, net, installments, payment_method, tx_type, card,
    service, product, session, status, source, message_id, parse_ok, raw_excerpt, created_at
  ) VALUES (
    @asmachta, @occurred_at, @customer_name, @customer_email, @customer_phone,
    @amount, @fee, @net, @installments, @payment_method, @tx_type, @card,
    @service, @product, @session, @status, @source, @message_id, @parse_ok, @raw_excerpt, @created_at
  )
`),
    recordFailure: db.prepare(`
      INSERT INTO ingest_failures (message_id, occurred_at, reason, raw_excerpt, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET reason = excluded.reason, raw_excerpt = excluded.raw_excerpt
    `),
  };
  return statements;
}

async function runIngest() {
  const startedAt = new Date().toISOString();
  const run = db
    .prepare('INSERT INTO ingest_runs (started_at) VALUES (?)')
    .run(startedAt);
  const runId = run.lastInsertRowid;

  const stats = { scanned: 0, added: 0, duplicates: 0, failed: 0 };
  const { insert, recordFailure } = prepared();

  if (!isConfigured()) {
    const error = 'לא הוגדרו פרטי חיבור לתיבת המייל (IMAP_USER / IMAP_PASS)';
    db.prepare('UPDATE ingest_runs SET finished_at = ?, error = ? WHERE id = ?')
      .run(new Date().toISOString(), error, runId);
    return { ...stats, error };
  }

  const client = new ImapFlow(config());

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP SINCE מתעלם משעה ומשווה לפי יום, ולכן הסריקה תמיד קצת חופפת —
      // וזה בכוונה. הכפילויות נחסמות על ידי האסמכתא.
      const uids = await client.search({ since: since(), from: GROW_SENDER }, { uid: true });

      for await (const message of client.fetch(
        uids.length ? uids : '1:0',
        { uid: true, source: true },
        { uid: true }
      )) {
        stats.scanned += 1;
        let parsed;
        try {
          parsed = await simpleParser(message.source);
        } catch (e) {
          stats.failed += 1;
          recordFailure.run(String(message.uid), null, `שגיאת פענוח מייל: ${e.message}`, null, new Date().toISOString());
          continue;
        }

        if (!String(parsed.subject || '').includes(PAY_SUBJECT)) continue;

        const result = parsePaymentEmail({
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html || '',
          date: parsed.date,
          messageId: parsed.messageId || String(message.uid),
        });

        if (!result.ok) {
          stats.failed += 1;
          recordFailure.run(
            parsed.messageId || String(message.uid),
            parsed.date ? parsed.date.toISOString() : null,
            result.reason,
            result.excerpt,
            new Date().toISOString()
          );
          continue;
        }

        try {
          insert.run({ ...result.transaction, created_at: new Date().toISOString() });
          stats.added += 1;
        } catch (e) {
          // UNIQUE על האסמכתא — העסקה כבר במערכת (מהייצוא או מסריקה קודמת)
          if (String(e.message).includes('UNIQUE')) stats.duplicates += 1;
          else throw e;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    db.prepare(
      'UPDATE ingest_runs SET finished_at = ?, scanned = ?, added = ?, duplicates = ?, failed = ? WHERE id = ?'
    ).run(new Date().toISOString(), stats.scanned, stats.added, stats.duplicates, stats.failed, runId);

    return stats;
  } catch (e) {
    try {
      await client.close();
    } catch (_) {
      /* the connection is already gone — nothing to clean up */
    }
    const error = e && e.message ? e.message : String(e);
    db.prepare('UPDATE ingest_runs SET finished_at = ?, scanned = ?, error = ? WHERE id = ?')
      .run(new Date().toISOString(), stats.scanned, error, runId);
    return { ...stats, error };
  }
}

let timer = null;

function startScheduler() {
  const minutes = Number(process.env.INGEST_INTERVAL_MINUTES || 15);
  if (!isConfigured()) {
    console.log('קליטת מיילים כבויה — חסרים IMAP_USER / IMAP_PASS');
    return;
  }
  if (timer) clearInterval(timer);
  const tick = () => {
    runIngest()
      .then((s) => {
        if (s.error) console.error('קליטת מיילים נכשלה:', s.error);
        else if (s.added) console.log(`נקלטו ${s.added} עסקאות חדשות`);
      })
      .catch((e) => console.error('קליטת מיילים נכשלה:', e));
  };
  timer = setInterval(tick, minutes * 60 * 1000);
  tick();
  console.log(`קליטת מיילים פעילה — כל ${minutes} דקות`);
}

module.exports = { runIngest, startScheduler, isConfigured, SINCE_KEY };
