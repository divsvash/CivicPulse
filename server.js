// ============================================================
// server.js — CivicPulse Express Application Entry Point
// ============================================================
// Start:    npm run dev
// Init DB:  node config/initDB.js
// ============================================================

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Core Middleware ────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health Check ───────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ success: true, message: 'CivicPulse API 🚀', timestamp: new Date().toISOString() })
);

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/complaints',    require('./routes/complaints'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/departments',   require('./routes/departments'));
app.use('/api/zones',         require('./routes/zones'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/sla',           require('./routes/sla'));

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `${req.method} ${req.path} not found.` })
);

// ── Global Error Handler ───────────────────────────────────
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡ CivicPulse API → http://localhost:${PORT}  (${process.env.NODE_ENV || 'development'})\n`);
});

module.exports = app;
