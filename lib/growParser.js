/**
 * פרסור מייל "בוצע תשלום עבור בעל העסק" מ-Grow לעסקה בודדת.
 *
 * מבנה הגוף של המייל (טבלאות HTML; ה-plain text יוצא כשורות עם "|"):
 *   בוצע תשלום של 450 ש"ח
 *   שם: ...      טלפון: ...      מייל: ...
 *   סוג עסקה: ...  אמצעי תשלום: ...  אשראי: ...  אסמכתא: ...
 *   עבור שירות: 28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד
 *
 * "עבור שירות" הוא **שם עמוד המכירה**, לא שם המוצר — ולכן הוא מפוצל
 * למוצר + מועד, כדי שכל עמודי המכירה של אותה סדנה יתאחדו למוצר אחד.
 */

const PAY_SUBJECT = 'בוצע תשלום עבור בעל העסק';

/** תבניות "מועד" שמופיעות בתחילת שם עמוד המכירה ונקלפות ממנו */
const SESSION_PATTERNS = [
  /^(\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?)\s*/,
  /^(בשעות?\s*\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})\s*/,
  /^(בשעה\s*\d{1,2}:\d{2})\s*/,
  /^(מחזור\s+\S+(?:\s+\d{2,4})?)\s*/,
];

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h\d|table)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function grab(text, re) {
  const m = String(text || '').match(re);
  return m ? String(m[1]).trim() : '';
}

/**
 * כל התוויות והמשפטים הקבועים שמסמנים "כאן נגמר הערך של השדה הקודם".
 *
 * זה הלב של הפרסור: ב-plain text של Grow אין מפריד עקבי. בחלק מהמיילים
 * השדות מופרדים ב-"|", ובחלק הטקסט זורם ברצף ונשבר באמצע שורה — ואז
 * "אסמכתא: 517737452 עבור שירות: ..." יושב הכול על שורה אחת. בלי רשימת
 * העצירה הזו, הערך של כל שדה בולע את השדות שאחריו.
 *
 * ממוין מהארוך לקצר, כדי ש-"שם המוצר" ייבדק לפני "שם".
 */
const STOP_WORDS = [
  'עוד פרטים על העסקה',
  'אמצעי תשלום',
  'יש לך שאלה',
  'ממי התשלום',
  'עבור שירות',
  'שם המוצר',
  'צוות Grow',
  'סוג עסקה',
  'אסמכתא',
  'אימייל',
  'בברכה',
  'אשראי',
  'טלפון',
  'מחיר',
  'כמות',
  'מייל',
  'סה״כ',
  'סה"כ',
  'שם',
].sort((a, b) => b.length - a.length);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STOP_RE = STOP_WORDS.map(escapeRe).join('|');

/**
 * שולף ערך של שדה לפי התווית שלו.
 *
 * הערך נמשך **גם מעבר לשבירת שורה**, ועוצר רק בתווית הבאה, במפריד "|",
 * בשורה ריקה או בסוף הטקסט. זה הכרחי כי Grow שובר שורות לפי רוחב ולא
 * לפי שדות, ולפעמים השבירה נופלת באמצע הערך עצמו:
 *
 *     עבור שירות: מנוי
 *     מתחדש OWS בברכה,
 *
 * עצירה בשבירת השורה הייתה מחזירה כאן "מנוי" — מוצר אחר לגמרי.
 */
function field(text, label) {
  const re = new RegExp(
    `${escapeRe(label)}\\s*:\\s*([\\s\\S]*?)\\s*(?=(?:${STOP_RE})\\s*:?|\\n\\s*\\n|\\||$)`
  );
  return grab(text, re).replace(/\s+/g, ' ').replace(/[,\s]+$/, '');
}

function num(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * "28.9 בשעות 18:00-20:30 מאסטר קלאס קלוד קוד"
 *   -> { product: "מאסטר קלאס קלוד קוד", session: "28.9 בשעות 18:00-20:30" }
 */
function splitService(raw) {
  let rest = String(raw || '').trim();
  if (!rest) return { product: '', session: '' };

  const session = [];
  let changed = true;
  while (changed && rest) {
    changed = false;
    for (const pattern of SESSION_PATTERNS) {
      const m = rest.match(pattern);
      if (m) {
        session.push(m[1].trim());
        rest = rest.slice(m[0].length);
        changed = true;
      }
    }
  }

  return { product: rest.trim() || String(raw).trim(), session: session.join(' ') };
}

/**
 * מפרסר מייל אחד.
 * @param {{subject:string, text:string, html:string, date:Date, messageId:string}} message
 * @returns {{ok:boolean, reason?:string, transaction?:object, excerpt:string}}
 */
function parsePaymentEmail(message) {
  const subject = String(message.subject || '');
  const html = String(message.html || '');
  let text = String(message.text || '');

  // ה-plain text של Grow לפעמים מגיע חסר או בלי שדות הטבלה — במקרה כזה
  // נופלים חזרה ל-HTML מנוקה, שם השדות תמיד קיימים.
  if (!text || text.indexOf('עבור שירות') === -1) {
    const fromHtml = htmlToText(html);
    if (fromHtml.indexOf('עבור שירות') !== -1 || !text) text = fromHtml;
  }

  const excerpt = text.slice(0, 1200);

  if (subject.indexOf(PAY_SUBJECT) === -1) {
    return { ok: false, reason: 'נושא המייל אינו "' + PAY_SUBJECT + '"', excerpt };
  }

  const amount = num(grab(text, /בוצע\s+תשלום\s+של\s*([\d,]+(?:\.\d+)?)/));
  const installments = num(grab(text, /ב-?\s*(\d+)\s*תשלומים/)) || 1;
  const name = field(text, 'שם');
  const phone = field(text, 'טלפון');
  const txType = field(text, 'סוג עסקה');
  const method = field(text, 'אמצעי תשלום');
  const card = field(text, 'אשראי');
  const asmachta = field(text, 'אסמכתא');
  const service = field(text, 'עבור שירות');

  // כתובת המייל של הלקוחה: בחלק מהמיילים היא טקסט רגיל אחרי "מייל:",
  // ובחלק היא מגיעה רק כקישור mailto: בתוך ה-HTML ואז השורה נראית ריקה.
  // בלי הנפילה חזרה ל-mailto מאבדים את הזיהוי של הלקוחה לגמרי.
  const email =
    grab(text, /מייל:\s*([^\s\n|<>"']+@[^\s\n|<>"']+)/) ||
    grab(html, /mailto:([^\s"'?<>]+@[^\s"'?<>]+)/) ||
    '';

  const { product, session } = splitService(service);

  if (!asmachta) return { ok: false, reason: 'חסרה אסמכתא', excerpt };
  if (!amount) return { ok: false, reason: 'לא נמצא סכום', excerpt };
  if (!service) return { ok: false, reason: 'חסר "עבור שירות" (שם עמוד המכירה)', excerpt };

  return {
    ok: true,
    excerpt,
    transaction: {
      asmachta,
      occurred_at: toIsoLocal(message.date),
      customer_name: name,
      customer_email: email.toLowerCase(),
      customer_phone: phone,
      amount,
      // המייל מדווח ברוטו בלבד — העמלה והנטו לבנק מופיעים רק בייצוא הרשמי.
      fee: 0,
      net: 0,
      installments,
      payment_method: method,
      tx_type: txType,
      card,
      service,
      product,
      session,
      status: 'charged',
      source: 'email',
      message_id: message.messageId || null,
      parse_ok: 1,
      raw_excerpt: null,
    },
  };
}

/** תאריך ISO בשעון ישראל (YYYY-MM-DD HH:mm) — השרת עצמו רץ ב-UTC */
function toIsoLocal(date) {
  const d = date instanceof Date && !Number.isNaN(date.valueOf()) ? date : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

module.exports = { PAY_SUBJECT, parsePaymentEmail, splitService, htmlToText, toIsoLocal };
