const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');
const submitEl = document.getElementById('submit');

// Already signed in (the session cookie lasts 30 days) — skip straight to the dashboard.
fetch('/api/me')
  .then((r) => { if (r.ok) location.replace('/'); })
  .catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  submitEl.disabled = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ההתחברות נכשלה');
    location.replace('/');
  } catch (err) {
    errorEl.textContent = err.message;
    submitEl.disabled = false;
  }
});
