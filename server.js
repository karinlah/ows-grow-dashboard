require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const transactionsRoutes = require('./routes/transactions');
const ingestRoutes = require('./routes/ingest');
const exportRoutes = require('./routes/export');
const settingsRoutes = require('./routes/settings');
const { startScheduler } = require('./lib/ingest');

const app = express();
const PORT = process.env.PORT || 3100;
const isProduction = process.env.NODE_ENV === 'production';

// Render terminates HTTPS at a proxy in front of the app — this tells Express to trust that
// proxy's headers so the secure session cookie actually works.
if (isProduction) app.set('trust proxy', 1);

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ows-grow-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30, secure: isProduction }, // 30 days
  })
);

app.use('/api', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/settings', settingsRoutes);

app.use(express.static(path.join(__dirname, 'public')));

// Always answer the frontend with JSON — Express's default HTML error page would reach res.json()
// on the client and surface as an unhelpful parse failure instead of the real message.
app.use((err, req, res, next) => {
  console.error(err);
  const message = (err && err.message) || '';
  const isOwnMessage = /[֐-׿]/.test(message);
  res.status(err.status || 500).json({ error: isOwnMessage ? message : 'אירעה שגיאה בשרת — נא לנסות שוב' });
});

app.listen(PORT, () => {
  console.log(`דשבורד Grow רץ על http://localhost:${PORT}`);
  startScheduler();
});
