/**
 * ONE WOMAN SHOW — דשבורד הרשמות מ-Grow
 * ------------------------------------------------------------------
 * רץ כולו על השרתים של גוגל (Apps Script):
 *   • קורא את מיילי "בוצע תשלום עבור בעל העסק" מ-Grow ישירות מהג'ימייל
 *   • שומר כל עסקה בגיליון גוגל פרטי (מקור אמת + גיבוי)
 *   • מגיש דשבורד ווב שרק קארין רואה
 * לא תלוי במחשב של קארין — עובד גם כשהוא כבוי.
 */

var PROP        = PropertiesService.getScriptProperties();
var SS_KEY      = 'SPREADSHEET_ID';
var LAST_KEY    = 'LAST_INGEST_EPOCH';
var SHEET_TX    = 'transactions';

var GROW_SENDER    = 'grow.security';
var PAY_SUBJECT    = 'בוצע תשלום עבור בעל העסק';
var CREDIT_SUBJECT = 'חשבונית זיכוי';
var TZ             = 'Asia/Jerusalem';

/** חלון חפיפה בשליפה מצטברת (מיילים יכולים להגיע באיחור) */
var OVERLAP_DAYS = 3;

var HEADERS = [
  'message_id', 'date', 'name', 'email', 'phone', 'amount', 'installments',
  'payment_method', 'tx_type', 'card', 'asmachta', 'service', 'product',
  'session', 'parse_ok'
];

/* ==================================================================
 *  התקנה — להריץ פעם אחת
 * ================================================================== */

function setup() {
  var ss = getSpreadsheet_();          // יוצר גיליון אם אין
  installTrigger_();                   // טריגר כל 15 דקות
  var res = fullResync();              // שליפה היסטורית מלאה
  Logger.log('הגיליון: ' + ss.getUrl());
  Logger.log('נקלטו: ' + res.added + ' עסקאות חדשות, סה"כ בגיליון: ' + res.total);
  return ss.getUrl();
}

function installTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ingest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ingest').timeBased().everyMinutes(15).create();
}

/* ==================================================================
 *  שליפה
 * ================================================================== */

/** שליפה מצטברת — זו שרצה אוטומטית כל 15 דקות */
function ingest() {
  var last = Number(PROP.getProperty(LAST_KEY) || 0);
  var since = last ? last - OVERLAP_DAYS * 86400 : 0;
  return ingest_(since);
}

/** שליפה היסטורית מלאה — לסריקה מחדש של הכול */
function fullResync() {
  return ingest_(0);
}

function ingest_(sinceEpoch) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { added: 0, total: 0, skipped: 'locked' };

  try {
    var sheet = getTxSheet_();
    var known = existingIds_(sheet);

    var q = 'in:anywhere from:' + GROW_SENDER + ' subject:"' + PAY_SUBJECT + '"';
    if (sinceEpoch > 0) q += ' after:' + Math.floor(sinceEpoch);

    var rows = [];
    var threads = searchAll_(q);

    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        if (msg.getSubject().indexOf(PAY_SUBJECT) === -1) return;   // אותו thread עלול לאסוף מיילים אחרים
        var id = msg.getId();
        if (known[id]) return;
        known[id] = true;
        rows.push(toRow_(id, msg));
      });
    });

    if (rows.length) {
      rows.sort(function (a, b) { return a[1] - b[1]; });
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
      sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
    }

    PROP.setProperty(LAST_KEY, String(Math.floor(Date.now() / 1000)));
    return { added: rows.length, total: Math.max(0, sheet.getLastRow() - 1) };
  } finally {
    lock.releaseLock();
  }
}

function searchAll_(query) {
  var out = [], start = 0, page;
  do {
    page = GmailApp.search(query, start, 100);
    out = out.concat(page);
    start += page.length;
  } while (page.length === 100 && start < 2000);
  return out;
}

function existingIds_(sheet) {
  var map = {};
  var n = sheet.getLastRow() - 1;
  if (n <= 0) return map;
  sheet.getRange(2, 1, n, 1).getValues().forEach(function (r) {
    if (r[0]) map[String(r[0])] = true;
  });
  return map;
}

/* ==================================================================
 *  פרסור מייל בודד
 * ================================================================== */

function toRow_(id, msg) {
  var text = messageText_(msg);
  var html = safeHtml_(msg);

  var amount       = num_(grab_(text, /בוצע\s+תשלום\s+של\s*([\d,]+(?:\.\d+)?)/));
  var installments = num_(grab_(text, /ב-?\s*(\d+)\s*תשלומים/));
  var name         = grab_(text, /(?:^|\n|\|)\s*שם:\s*([^\n|]+)/);
  var phone        = grab_(text, /טלפון:\s*([^\n|]+)/);
  var email        = grab_(text, /מייל:\s*([^\s\n|<>"']+@[^\s\n|<>"']+)/) ||
                     grab_(html, /mailto:([^\s"'?<>]+@[^\s"'?<>]+)/);
  var txType       = grab_(text, /סוג\s+עסקה:\s*([^\n|]+)/);
  var method       = grab_(text, /אמצעי\s+תשלום:\s*([^\n|]+)/);
  var card         = grab_(text, /(?:^|\n|\|)\s*אשראי:\s*([^\n|]+)/);
  var asmachta     = grab_(text, /אסמכתא:\s*([^\n|]+)/);
  var service      = grab_(text, /עבור\s+שירות:\s*([^\n|]+)/);

  var parts = splitService_(service);

  return [
    id,
    msg.getDate(),
    name,
    (email || '').toLowerCase(),
    phone,
    amount,
    installments || 1,
    method,
    txType,
    card,
    asmachta,
    service,
    parts.product,
    parts.session,
    (amount > 0 && !!service) ? 'ok' : 'CHECK'
  ];
}

/** טקסט המייל — נופל חזרה ל-HTML מנוקה אם ה-plain חסר */
function messageText_(msg) {
  var body = '';
  try { body = msg.getPlainBody() || ''; } catch (e) {}
  if (!body || body.indexOf('עבור שירות') === -1) {
    body = htmlToText_(safeHtml_(msg));
  }
  return body;
}

function safeHtml_(msg) {
  try { return msg.getBody() || ''; } catch (e) { return ''; }
}

function htmlToText_(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h\d|table)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function grab_(text, re) {
  var m = String(text || '').match(re);
  return m ? String(m[1]).trim() : '';
}

function num_(s) {
  if (!s) return 0;
  var n = parseFloat(String(s).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * מפריד "עבור שירות" לשם מוצר + מועד/מחזור.
 * "28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד" -> {product:"מאסטר קלאס קלוד קוד", session:"28.9 בשעות 18:00-20:30"}
 */
function splitService_(raw) {
  var rest = String(raw || '').trim();
  if (!rest) return { product: '', session: '' };

  var session = [];
  var patterns = [
    /^(\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?)\s*/,
    /^(בשעות?\s*\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})\s*/,
    /^(בשעה\s*\d{1,2}:\d{2})\s*/,
    /^(מחזור\s+\S+(?:\s+\d{2,4})?)\s*/
  ];

  var changed = true;
  while (changed && rest) {
    changed = false;
    for (var i = 0; i < patterns.length; i++) {
      var m = rest.match(patterns[i]);
      if (m) {
        session.push(m[1].trim());
        rest = rest.slice(m[0].length);
        changed = true;
      }
    }
  }

  return {
    product: rest.trim() || String(raw).trim(),
    session: session.join(' ')
  };
}

/* ==================================================================
 *  גיליון
 * ================================================================== */

function getSpreadsheet_() {
  var id = PROP.getProperty(SS_KEY);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  var ss = SpreadsheetApp.create('OWS — הרשמות Grow (מאגר)');
  ss.setSpreadsheetTimeZone(TZ);
  PROP.setProperty(SS_KEY, ss.getId());
  return ss;
}

function getTxSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_TX);
  if (!sheet) {
    sheet = ss.getSheets()[0].setName(SHEET_TX);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
         .setFontWeight('bold').setBackground('#052727').setFontColor('#ede0d5');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ==================================================================
 *  אפליקציית הווב
 * ================================================================== */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('OWS — דשבורד הרשמות')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function refreshNow() {
  ingest();
  return getDashboardData();
}

function getDashboardData() {
  var sheet  = getTxSheet_();
  var n      = sheet.getLastRow() - 1;
  var values = n > 0 ? sheet.getRange(2, 1, n, HEADERS.length).getValues() : [];

  var rows = values.map(function (r) {
    return {
      id:      r[0],
      date:    r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd HH:mm') : String(r[1] || ''),
      name:    r[2],
      email:   r[3],
      phone:   String(r[4] || ''),
      amount:  Number(r[5]) || 0,
      installments: Number(r[6]) || 1,
      method:  r[7],
      txType:  r[8],
      card:    String(r[9] || ''),
      asmachta: String(r[10] || ''),
      service: r[11],
      product: r[12] || 'ללא שיוך',
      session: r[13] || '',
      ok:      r[14] === 'ok'
    };
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  // צבירה לפי מוצר, ובתוכו לפי עמוד מכירה
  var byProduct = {};
  rows.forEach(function (r) {
    var p = byProduct[r.product] || (byProduct[r.product] = {
      product: r.product, count: 0, revenue: 0, sessionsMap: {}
    });
    p.count++;
    p.revenue += r.amount;

    var key = r.session || '—';
    var s = p.sessionsMap[key] || (p.sessionsMap[key] = { session: key, count: 0, revenue: 0 });
    s.count++;
    s.revenue += r.amount;
  });

  var products = Object.keys(byProduct).map(function (k) {
    var p = byProduct[k];
    p.sessions = Object.keys(p.sessionsMap).map(function (s) { return p.sessionsMap[s]; })
      .sort(function (a, b) { return b.count - a.count; });
    delete p.sessionsMap;
    return p;
  }).sort(function (a, b) { return b.revenue - a.revenue; });

  var revenue = rows.reduce(function (s, r) { return s + r.amount; }, 0);
  var problems = rows.filter(function (r) { return !r.ok; }).length;

  return {
    updatedAt: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'),
    totals: {
      count:    rows.length,
      revenue:  revenue,
      avg:      rows.length ? revenue / rows.length : 0,
      products: products.length
    },
    products: products,
    rows:     rows,
    credits:  countCredits_(),
    problems: problems,
    sheetUrl: getSpreadsheet_().getUrl()
  };
}

/** ספירת חשבוניות זיכוי — לא מנוכה אוטומטית, רק מסומן לתשומת לב */
function countCredits_() {
  try {
    return GmailApp.search(
      'in:anywhere from:' + GROW_SENDER + ' subject:"' + CREDIT_SUBJECT + '"', 0, 100
    ).length;
  } catch (e) {
    return 0;
  }
}
