// ============================================================
// controllers/authController.js — Register, Login, Profile
// ============================================================

const bcrypt             = require('bcryptjs');
const jwt                = require('jsonwebtoken');
const pool               = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');

// ── Helper: Sign JWT ──────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ── Helper: Safe user response (strip password) ───────────
const safeUser = (user) => {
  const { password_hash, ...safe } = user;
  return safe;
};

// ── POST /api/auth/register ───────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role = 'citizen' } = req.body;

  // Prevent self-registration as admin/officer
  const allowedRoles = ['citizen'];
  if (!allowedRoles.includes(role)) {
    throw createError('You can only register as a citizen.', 403);
  }

  // Check duplicate email
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE email = ?', [email]
  );
  if (existing.length) throw createError('Email already registered.', 409);

  const password_hash = await bcrypt.hash(password, 12);

  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
    [name, email.toLowerCase(), password_hash, phone || null, role]
  );

  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
  const token  = signToken(rows[0]);

  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    token,
    user: safeUser(rows[0]),
  });
});

// ── POST /api/auth/login ──────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = ? AND is_active = 1', [email.toLowerCase()]
  );
  if (!rows.length) throw createError('Invalid email or password.', 401);

  const user    = rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw createError('Invalid email or password.', 401);

  const token = signToken(user);

  res.json({
    success: true,
    message: 'Login successful.',
    token,
    user: safeUser(user),
  });
});

// ── GET /api/auth/me ──────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, avatar_url, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({ success: true, user: rows[0] });
});

// ── PUT /api/auth/profile ─────────────────────────────────
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  await pool.execute(
    'UPDATE users SET name = ?, phone = ? WHERE id = ?',
    [name, phone || null, req.user.id]
  );
  res.json({ success: true, message: 'Profile updated.' });
});

// ── PUT /api/auth/change-password ─────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!isMatch) throw createError('Current password is incorrect.', 401);

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

  res.json({ success: true, message: 'Password changed successfully.' });
});
