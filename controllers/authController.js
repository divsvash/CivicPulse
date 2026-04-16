// ============================================================
// controllers/authController.js — Register, Login, Profile
// With full input validation + configurable token expiry
// ============================================================

const bcrypt             = require('bcryptjs');
const jwt                = require('jsonwebtoken');
const pool               = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');

// ── Validation helpers ─────────────────────────────────────

const validators = {
  // Name: 2–60 chars, letters/spaces/dots/hyphens only, no numbers
  name(value) {
    if (!value || typeof value !== 'string') return 'Name is required.';
    const v = value.trim();
    if (v.length < 2)  return 'Name must be at least 2 characters.';
    if (v.length > 60) return 'Name must be under 60 characters.';
    if (!/^[a-zA-Z\s.\-']+$/.test(v)) return 'Name can only contain letters, spaces, hyphens, and dots.';
    return null;
  },

  // Email: standard RFC format
  email(value) {
    if (!value || typeof value !== 'string') return 'Email is required.';
    const v = value.trim().toLowerCase();
    if (v.length > 150) return 'Email is too long.';
    // RFC-5321-ish pattern
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(v)) return 'Please enter a valid email address (e.g. user@example.com).';
    // Block obviously fake domains
    const blocked = ['test.com', 'fake.com', 'example.com', 'none.com'];
    const domain  = v.split('@')[1];
    if (blocked.includes(domain)) return `Email domain "${domain}" is not accepted.`;
    return null;
  },

  // Password: min 8 chars, must have uppercase, lowercase, digit, special char
  password(value) {
    if (!value || typeof value !== 'string') return 'Password is required.';
    if (value.length < 8)  return 'Password must be at least 8 characters.';
    if (value.length > 72) return 'Password must be under 72 characters.'; // bcrypt limit
    if (!/[A-Z]/.test(value))        return 'Password must contain at least one uppercase letter (A–Z).';
    if (!/[a-z]/.test(value))        return 'Password must contain at least one lowercase letter (a–z).';
    if (!/[0-9]/.test(value))        return 'Password must contain at least one number (0–9).';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Password must contain at least one special character (!@#$%^&*).';
    return null;
  },

  // Phone: optional, but if provided must be valid Indian mobile number
  // Accepts: 10 digits, optionally prefixed with +91 or 0
  phone(value) {
    if (!value || value.trim() === '') return null; // optional field
    const stripped = value.replace(/[\s\-().+]/g, '');
    // After stripping separators, allow +91 or 0 prefix, then 10 digits
    const cleaned = stripped.replace(/^(91|0)/, '');
    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      return 'Phone must be a valid 10-digit Indian mobile number (starts with 6–9).';
    }
    return null;
  },
};

// Collect all validation errors and return them together
function validateRegistration(body) {
  const { name, email, password, phone } = body;
  const errors = {};

  const nameErr     = validators.name(name);
  const emailErr    = validators.email(email);
  const passwordErr = validators.password(password);
  const phoneErr    = validators.phone(phone);

  if (nameErr)     errors.name     = nameErr;
  if (emailErr)    errors.email    = emailErr;
  if (passwordErr) errors.password = passwordErr;
  if (phoneErr)    errors.phone    = phoneErr;

  return Object.keys(errors).length > 0 ? errors : null;
}

// ── Helper: Sign JWT with expiry from .env ─────────────────
// TOKEN_EXPIRY options: '15m' '1h' '6h' '1d' '7d' '30d'
const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

// ── Helper: Compute expiry timestamp for client use ────────
const getExpiresAt = () => {
  const raw     = process.env.JWT_EXPIRES_IN || '24h';
  const unit    = raw.slice(-1);
  const amount  = parseInt(raw);
  const msMap   = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const ms      = (msMap[unit] || msMap['h']) * amount;
  return new Date(Date.now() + ms).toISOString();
};

// ── Helper: Safe user response (strip password hash) ───────
const safeUser = (user) => {
  const { password_hash, ...safe } = user;
  return safe;
};

// ══════════════════════════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════════════════════════
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role = 'citizen' } = req.body;

  // 1. Role guard — citizens only through self-registration
  if (role !== 'citizen') {
    throw createError('Self-registration is only available for citizens.', 403);
  }

  // 2. Validate all fields together, return ALL errors at once
  const errors = validateRegistration({ name, email, password, phone });
  if (errors) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed. Please fix the errors below.',
      errors,   // object: { name: '...', email: '...', password: '...', phone: '...' }
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName  = name.trim();
  const cleanPhone = phone ? phone.replace(/[\s\-().+]/g, '').replace(/^(91|0)/, '') : null;

  // 3. Duplicate email check
  const [existing] = await pool.execute(
    'SELECT id FROM users WHERE email = ?', [cleanEmail]
  );
  if (existing.length) {
    return res.status(409).json({
      success: false,
      message: 'Validation failed. Please fix the errors below.',
      errors: { email: 'This email address is already registered.' },
    });
  }

  // 4. Hash password and insert
  const password_hash = await bcrypt.hash(password, 12);

  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
    [cleanName, cleanEmail, password_hash, cleanPhone, 'citizen']
  );

  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
  const token  = signToken(rows[0]);

  res.status(201).json({
    success:    true,
    message:    'Registration successful. Welcome to CivicPulse!',
    token,
    expires_at: getExpiresAt(),
    user:       safeUser(rows[0]),
  });
});

// ══════════════════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════════════════
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw createError('Email and password are required.', 400);
  }

  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
    [email.trim().toLowerCase()]
  );

  // Use same message for both "not found" and "wrong password"
  // to prevent user enumeration attacks
  if (!rows.length) throw createError('Invalid email or password.', 401);

  const user    = rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw createError('Invalid email or password.', 401);

  const token = signToken(user);

  res.json({
    success:    true,
    message:    'Login successful.',
    token,
    expires_at: getExpiresAt(),
    user:       safeUser(user),
  });
});

// ══════════════════════════════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════════════════════════════
exports.getMe = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, avatar_url, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({ success: true, user: rows[0] });
});

// ══════════════════════════════════════════════════════════
// PUT /api/auth/profile
// ══════════════════════════════════════════════════════════
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const errors = {};

  const nameErr  = validators.name(name);
  const phoneErr = validators.phone(phone);
  if (nameErr)  errors.name  = nameErr;
  if (phoneErr) errors.phone = phoneErr;

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  const cleanPhone = phone ? phone.replace(/[\s\-().+]/g, '').replace(/^(91|0)/, '') : null;

  await pool.execute(
    'UPDATE users SET name = ?, phone = ? WHERE id = ?',
    [name.trim(), cleanPhone, req.user.id]
  );
  res.json({ success: true, message: 'Profile updated successfully.' });
});

// ══════════════════════════════════════════════════════════
// PUT /api/auth/change-password
// ══════════════════════════════════════════════════════════
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw createError('Both current and new passwords are required.', 400);
  }

  const passwordErr = validators.password(newPassword);
  if (passwordErr) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: { newPassword: passwordErr },
    });
  }

  if (currentPassword === newPassword) {
    throw createError('New password must be different from the current password.', 400);
  }

  const [rows]  = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!isMatch) throw createError('Current password is incorrect.', 401);

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

  res.json({ success: true, message: 'Password changed successfully.' });
});
