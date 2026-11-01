/* דשבורד הרשמות OWS — כל הפרונטאנד. ללא framework, ללא שלב build:
   כל תצוגה היא פונקציה שמחזירה HTML, בדיוק כמו ב-ows-crm. */

const app = document.getElementById('app');
let state = { tab: 'overview', dashboard: null, transactions: null, failures: null, filters: {} };

/* ---------- עזרי תצוגה ---------- */

const shekel = (n) =>
  `${Math.round(Number(n) || 0).toLocaleString('he-IL')}<span class="cur">₪</span>`;

const plain = (n) => (Number(n) || 0).toLocaleString('he-IL');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** "2026-09-17 13:26" -> "17.09.26 13:26" */
function niceDate(value) {
  const s = String(value || '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return esc(s);
  return `${m[3]}.${m[2]}.${m[1].slice(2)}${m[4] ? ` ${m[4]}` : ''}`;
}

/** "28.9 בשעות 18:00-20:30" -> מספר למיון כרונולוגי (חודש*100+יום). מועד בלי תאריך — בסוף. */
function sessionOrder(session) {
  const m = String(session || '').match(/^(\d{1,2})[.\/](\d{1,2})/);
  return m ? Number(m[2]) * 100 + Number(m[1]) : 9999;
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (res.status === 401) {
    location.replace('/login.html');
    throw new Error('לא מחוברת');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'אירעה שגיאה');
  return data;
}

/* ---------- סקירה ---------- */

function statsView(d) {
  const t = d.totals;
  return `
    <div class="stats">
      <div class="stat">
        <div class="label">סך הכל הרשמות</div>
        <div class="value">${plain(t.count)}</div>
        <div class="sub">${
          d.focus ? esc(d.focus) : t.products === 1 ? 'מוצר אחד' : `${plain(t.products)} מוצרים`
        }</div>
      </div>
      <div class="stat">
        <div class="label">סך הכל הכנסות</div>
        <div class="value">${shekel(t.revenue)}</div>
        <div class="sub">ברוטו, לפני עמלות סליקה</div>
      </div>
      <div class="stat">
        <div class="label">עסקה ממוצעת</div>
        <div class="value">${shekel(t.avg)}</div>
        <div class="sub">לכל הרשמה</div>
      </div>
      <div class="stat">
        <div class="label">נטו לבנק</div>
        <div class="value">${t.net ? shekel(t.net) : '<span class="dim">—</span>'}</div>
        <div class="sub">${t.net ? 'אחרי עמלות ומע״מ' : 'ידוע רק מייצוא רשמי'}</div>
      </div>
    </div>`;
}

function productsView(d) {
  if (!d.products.length) return '<div class="empty">אין עדיין עסקאות.</div>';

  return d.products
    .map((p) => {
      const max = Math.max(...p.sessions.map((s) => s.count), 1);
      const rows = p.sessions
        .map(
          (s) => `
          <tr>
            <td class="strong">${esc(s.session)}</td>
            <td class="num">${plain(s.count)}</td>
            <td style="width:34%"><div class="bar"><span style="width:${(s.count / max) * 100}%"></span></div></td>
            <td class="num strong">${shekel(s.revenue)}</td>
            <td class="num dim" dir="ltr">${niceDate(s.first_sale)} – ${niceDate(s.last_sale)}</td>
          </tr>`
        )
        .join('');

      return `
        <section class="product">
          <div class="product-head">
            <h3>${esc(p.product)}</h3>
            <span class="count">${plain(p.count)} הרשמות</span>
            <span class="rev">${shekel(p.revenue)}</span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr><th>מועד / עמוד מכירה</th><th>הרשמות</th><th></th><th>הכנסות</th><th>טווח מכירות</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>`;
    })
    .join('');
}

function methodsView(d) {
  if (!d.methods.length) return '';
  const rows = d.methods
    .map(
      (m) => `<tr>
        <td class="strong">${esc(m.method)}</td>
        <td class="num">${plain(m.count)}</td>
        <td class="num">${shekel(m.revenue)}</td>
      </tr>`
    )
    .join('');
  return `
    <section class="product">
      <div class="product-head"><h3>לפי אמצעי תשלום</h3></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>אמצעי</th><th>הרשמות</th><th>הכנסות</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function noticesView(d) {
  const out = [];

  if (d.ingest.failures) {
    const one = d.ingest.failures === 1;
    out.push(`<div class="notice">
      <strong>${one ? 'מייל אחד לא נקלט' : `${plain(d.ingest.failures)} מיילים לא נקלטו`}</strong> —
      הפרסור נכשל ${one ? 'עליו' : 'עליהם'}. הפירוט בטאב "קליטת מיילים".
    </div>`);
  }

  if (!d.ingest.configured) {
    out.push(`<div class="notice">
      <strong>קליטת המיילים עדיין לא מחוברת.</strong>
      המספרים כאן הם מהייצוא הרשמי של Grow בלבד. הוראות החיבור בטאב "קליטת מיילים".
    </div>`);
  }

  return out.join('');
}

function focusPicker(d) {
  const options = (d.allProducts || [])
    .map((p) => `<option value="${esc(p)}" ${d.focus === p ? 'selected' : ''}>${esc(p)}</option>`)
    .join('');
  return `
    <label class="focus">
      <span>מוצר במוקד</span>
      <select id="focus"><option value="" ${d.focus ? '' : 'selected'}>כל המוצרים</option>${options}</select>
    </label>`;
}

function overviewView() {
  const d = state.dashboard;
  const sources = d.sources || {};
  return `
    <div class="section">
      <div class="section-head">
        <div>
          <span class="eyebrow"><span class="ln"></span> ${d.focus ? esc(d.focus) : 'כל המוצרים'}</span>
          <h2 class="display">הרשמות והכנסות</h2>
        </div>
        ${focusPicker(d)}
        <span class="note">
          ${plain(sources.export || 0)} מהייצוא הרשמי · ${plain(sources.email || 0)} ממיילים
        </span>
      </div>
      ${noticesView(d)}
      ${statsView(d)}
      <div style="height:34px"></div>
      <div class="section-head"><h2 class="display">${d.focus ? 'פר מועד' : 'פר מוצר'}</h2></div>
      ${productsView(d)}
      ${methodsView(d)}
    </div>`;
}

/* ---------- עסקאות ---------- */

function transactionsView() {
  const data = state.transactions;
  const products = state.dashboard?.allProducts || [];
  const f = state.filters;

  const options = products
    .map((p) => `<option value="${esc(p)}" ${f.product === p ? 'selected' : ''}>${esc(p)}</option>`)
    .join('');

  // סינון לפי סדנה — כל מועד בנפרד. מופיע רק כשנבחר מוצר שיש לו יותר ממועד אחד.
  const sessions = (data?.sessions || []).slice().sort((a, b) => sessionOrder(a.session) - sessionOrder(b.session));
  const sessionSelect =
    f.product && sessions.length > 1
      ? `<select id="session"><option value="">כל המועדים</option>${sessions
          .map(
            (s) =>
              `<option value="${esc(s.session)}" ${f.session === s.session ? 'selected' : ''}>${esc(s.session)} · ${plain(s.count)}</option>`
          )
          .join('')}</select>`
      : '';

  const rows = !data
    ? ''
    : data.rows
        .map(
          (r) => `<tr>
            <td class="num dim">${niceDate(r.occurred_at)}</td>
            <td class="strong">${esc(r.customer_name || '—')}</td>
            <td class="dim">${esc(r.customer_email || '—')}</td>
            <td class="num">${esc(r.customer_phone || '—')}</td>
            <td class="nowrap">${esc(r.session || '—')}</td>
            <td class="num strong">${shekel(r.amount)}</td>
            <td>${esc(r.payment_method || '—')}</td>
            <td class="num dim">${esc(r.asmachta)}</td>
            <td>
              ${r.status === 'credited' ? '<span class="pill credited">זוכתה</span>' : ''}
              <span class="pill ${r.source === 'email' ? 'email' : ''}">${r.source === 'email' ? 'מייל' : 'ייצוא'}</span>
            </td>
          </tr>`
        )
        .join('');

  return `
    <div class="section">
      <div class="section-head">
        <div>
          <span class="eyebrow"><span class="ln"></span> עסקאות</span>
          <h2 class="display">כל ההרשמות</h2>
        </div>
      </div>

      <div class="filters">
        <input type="search" id="q" placeholder="חיפוש שם, מייל, טלפון או אסמכתא" value="${esc(f.q || '')}">
        <select id="product"><option value="">כל המוצרים</option>${options}</select>
        ${sessionSelect}
        <a class="btn ghost" href="/api/export">ייצוא CSV</a>
        <span class="result">${data ? `${plain(data.count)} תוצאות` : 'טוען…'}</span>
      </div>

      <div class="product">
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>תאריך</th><th>שם</th><th>מייל</th><th>טלפון</th><th>מועד</th>
                  <th>סכום</th><th>אמצעי</th><th>אסמכתא</th><th>מקור</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${data && !data.count ? '<div class="empty">לא נמצאו עסקאות שמתאימות לסינון.</div>' : ''}
        </div>
      </div>
    </div>`;
}

/* ---------- קליטת מיילים ---------- */

function ingestView() {
  const ing = state.dashboard.ingest;
  const run = ing.lastRun;
  const failures = state.failures;

  const setup = ing.configured
    ? ''
    : `<div class="notice">
        <strong>איך מחברים את התיבה</strong><br>
        1. ליצור סיסמת אפליקציה לג'ימייל ב-<a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" style="border-bottom:1px solid var(--pink)">myaccount.google.com/apppasswords</a><br>
        2. למלא ב-Render (או בקובץ <code>.env</code> מקומית): <code>IMAP_USER</code> = כתובת הג'ימייל,
           <code>IMAP_PASS</code> = סיסמת האפליקציה.<br>
        3. להפעיל מחדש. המערכת תסרוק כל 15 דקות לבד.<br>
        <span class="dim">הסיסמה נשמרת רק אצלך בהגדרות השרת — לא בקוד ולא במסד הנתונים.</span>
      </div>`;

  const runRow = !run
    ? '<div class="empty">עוד לא רצה שליפה.</div>'
    : `<table>
        <tbody>
          <tr><td class="dim">רצה לאחרונה</td><td class="strong num">${niceDate(
            (run.finished_at || run.started_at || '').replace('T', ' ').slice(0, 16)
          )}</td></tr>
          <tr><td class="dim">מיילים שנסרקו</td><td class="num">${plain(run.scanned)}</td></tr>
          <tr><td class="dim">עסקאות חדשות</td><td class="num strong">${plain(run.added)}</td></tr>
          <tr><td class="dim">כבר היו במערכת</td><td class="num">${plain(run.duplicates)}</td></tr>
          <tr><td class="dim">נכשלו בפרסור</td><td class="num">${plain(run.failed)}</td></tr>
          ${run.error ? `<tr><td class="dim">שגיאה</td><td style="color:var(--pink-deep)">${esc(run.error)}</td></tr>` : ''}
        </tbody>
      </table>`;

  const failureRows = !failures
    ? ''
    : failures.rows
        .map(
          (r) => `<tr>
            <td class="num dim">${niceDate((r.occurred_at || '').replace('T', ' ').slice(0, 16))}</td>
            <td class="strong">${esc(r.reason)}</td>
            <td class="dim" style="font-size:12.5px">${esc((r.raw_excerpt || '').slice(0, 160))}</td>
          </tr>`
        )
        .join('');

  return `
    <div class="section">
      <div class="section-head">
        <div>
          <span class="eyebrow"><span class="ln"></span> קליטה</span>
          <h2 class="display">קליטת מיילים מ-Grow</h2>
        </div>
        <span class="note">${ing.configured ? 'מחובר · כל 15 דקות' : 'לא מחובר'}</span>
      </div>

      ${setup}

      <div class="notice quiet">
        המערכת קוראת מיילים בנושא <strong>"בוצע תשלום עבור בעל העסק"</strong> מ-Grow,
        החל מ-<strong>${esc(ing.since || '—')}</strong> והלאה. כל מה שלפני התאריך הזה מגיע
        מהייצוא הרשמי — חלק מהמיילים הישנים כבר נמחקו מהתיבה ואי אפשר לשחזר אותם ממנה.
        <br>עסקה מזוהה לפי <strong>אסמכתא</strong>, ולכן סריקה חוזרת לא סופרת אף הרשמה פעמיים.
      </div>

      <div style="margin-bottom:22px">
        <button class="btn" id="refresh" ${ing.configured ? '' : 'disabled'}>רענון עכשיו</button>
      </div>

      <section class="product">
        <div class="product-head"><h3>השליפה האחרונה</h3></div>
        <div class="table-scroll">${runRow}</div>
      </section>

      <section class="product">
        <div class="product-head">
          <h3>מיילים שלא נקלטו</h3>
          <span class="count">${failures ? plain(failures.count) : '…'}</span>
        </div>
        <div class="table-scroll">
          ${
            failures && failures.count
              ? `<table><thead><tr><th>תאריך</th><th>סיבה</th><th>תחילת המייל</th></tr></thead><tbody>${failureRows}</tbody></table>`
              : '<div class="empty">אין מיילים שנכשלו. 🎉</div>'
          }
        </div>
      </section>
    </div>`;
}

/* ---------- ניתוב ותצוגה ---------- */

function render() {
  if (!state.dashboard) {
    app.innerHTML = '<p class="loading">טוען…</p>';
    return;
  }

  if (state.tab === 'overview') app.innerHTML = overviewView();
  if (state.tab === 'transactions') app.innerHTML = transactionsView();
  if (state.tab === 'ingest') app.innerHTML = ingestView();

  app.insertAdjacentHTML(
    'beforeend',
    `<footer>הנתונים מ-Grow. הכנסות ברוטו, לפני עמלות סליקה. עסקאות שזוכו אינן נספרות.</footer>`
  );

  wireUp();
}

function wireUp() {
  const q = document.getElementById('q');
  if (q) {
    let timer;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.filters.q = q.value.trim();
        loadTransactions().then(render);
      }, 250);
    });
  }

  const product = document.getElementById('product');
  if (product) {
    product.addEventListener('change', () => {
      state.filters.product = product.value;
      state.filters.session = ''; // מועדים שייכים למוצר — מתחילים מחדש
      loadTransactions().then(render);
    });
  }

  const session = document.getElementById('session');
  if (session) {
    session.addEventListener('change', () => {
      state.filters.session = session.value;
      loadTransactions().then(render);
    });
  }

  const focus = document.getElementById('focus');
  if (focus) focus.addEventListener('change', () => setFocus(focus.value));

  const refresh = document.getElementById('refresh');
  if (refresh) {
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = 'שולף…';
      try {
        const stats = await api('/api/ingest/run', { method: 'POST' });
        await Promise.all([loadDashboard(), loadFailures()]);
        render();
        if (stats.error) alert(`השליפה נכשלה: ${stats.error}`);
        else alert(`נסרקו ${stats.scanned} מיילים · ${stats.added} עסקאות חדשות`);
      } catch (e) {
        alert(e.message);
        refresh.disabled = false;
        refresh.textContent = 'רענון עכשיו';
      }
    });
  }
}

async function loadDashboard() {
  state.dashboard = await api('/api/dashboard');
}

/** שינוי המוצר במוקד. נשמר בשרת, כך שהוא נשאר גם בפתיחה הבאה ובנייד. */
async function setFocus(product) {
  try {
    await api('/api/settings/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product }),
    });
    // טבלת העסקאות מסוננת לפי המוקד, אז היא צריכה להיטען מחדש
    state.transactions = null;
    state.filters.product = undefined;
    state.filters.session = '';
    await loadDashboard();
    render();
  } catch (e) {
    alert(e.message);
  }
}

async function loadTransactions() {
  // בפתיחה הראשונה הטבלה מסוננת למוצר שבמוקד, כדי שתראה את אותו דבר
  // שהמספרים בסקירה מדברים עליו. אפשר לשנות בסלקט שמעל הטבלה.
  if (state.filters.product === undefined) {
    state.filters.product = state.dashboard?.focus || '';
  }
  const params = new URLSearchParams();
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.product) params.set('product', state.filters.product);
  if (state.filters.product && state.filters.session) params.set('session', state.filters.session);
  state.transactions = await api(`/api/transactions?${params}`);
}

async function loadFailures() {
  state.failures = await api('/api/transactions/failures');
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.tab = tab.dataset.tab;

    // הטאבים טוענים את הנתונים שלהם רק כשנכנסים אליהם בפעם הראשונה
    if (state.tab === 'transactions' && !state.transactions) await loadTransactions();
    if (state.tab === 'ingest' && !state.failures) await loadFailures();
    render();
  });
});

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.replace('/login.html');
});

(async function start() {
  try {
    const me = await api('/api/me');
    document.getElementById('who').textContent = me.name;
    await loadDashboard();
    render();
  } catch (e) {
    if (e.message !== 'לא מחוברת') app.innerHTML = `<p class="loading">${esc(e.message)}</p>`;
  }
})();
