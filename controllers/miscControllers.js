// ============================================================
// controllers/departmentController.js
// ============================================================

const pool = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');

// GET /api/departments
exports.getAll = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM departments WHERE is_active = 1 ORDER BY name'
  );
  res.json({ success: true, departments: rows });
});

// GET /api/departments/:id
exports.getOne = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM departments WHERE id = ?', [req.params.id]
  );
  if (!rows.length) throw createError('Department not found.', 404);
  res.json({ success: true, department: rows[0] });
});

// POST /api/departments  (admin only)
exports.create = asyncHandler(async (req, res) => {
  const { name, code, icon, description, sla_hours } = req.body;
  const [result] = await pool.execute(
    'INSERT INTO departments (name, code, icon, description, sla_hours) VALUES (?, ?, ?, ?, ?)',
    [name, code.toUpperCase(), icon || '🏢', description || null, sla_hours || 48]
  );
  res.status(201).json({ success: true, message: 'Department created.', id: result.insertId });
});

// PUT /api/departments/:id  (admin only)
exports.update = asyncHandler(async (req, res) => {
  const { name, icon, description, sla_hours } = req.body;
  await pool.execute(
    'UPDATE departments SET name = ?, icon = ?, description = ?, sla_hours = ? WHERE id = ?',
    [name, icon, description || null, sla_hours, req.params.id]
  );
  res.json({ success: true, message: 'Department updated.' });
});

// DELETE /api/departments/:id  (admin only)
exports.remove = asyncHandler(async (req, res) => {
  await pool.execute('UPDATE departments SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Department deactivated.' });
});

// GET /api/departments/:id/officers
exports.getOfficers = asyncHandler(async (req, res) => {
  // Officers don't have a department FK; we identify them by role
  // In a real app you'd have a department_officers junction table
  const [rows] = await pool.execute(
    `SELECT id, name, email, phone FROM users WHERE role = 'officer' AND is_active = 1 ORDER BY name`
  );
  res.json({ success: true, officers: rows });
});


// ============================================================
// controllers/zoneController.js
// ============================================================

exports.getAllZones = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM zones ORDER BY name');
  res.json({ success: true, zones: rows });
});

exports.updateRiskScore = asyncHandler(async (req, res) => {
  const { risk_score } = req.body;
  if (!['low', 'medium', 'high'].includes(risk_score)) {
    throw createError('Invalid risk score. Use: low, medium, high.', 400);
  }
  await pool.execute('UPDATE zones SET risk_score = ? WHERE id = ?', [risk_score, req.params.id]);
  res.json({ success: true, message: 'Risk score updated.' });
});


// ============================================================
// controllers/userController.js  (admin only)
// ============================================================

exports.getAllUsers = asyncHandler(async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (role) { where += ' AND role = ?'; params.push(role); }

  const [rows] = await pool.execute(
    `SELECT id, name, email, phone, role, is_active, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );
  res.json({ success: true, users: rows });
});

exports.toggleUserStatus = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT is_active FROM users WHERE id = ?', [req.params.id]);
  if (!rows.length) throw createError('User not found.', 404);
  const newStatus = rows[0].is_active ? 0 : 1;
  await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
  res.json({ success: true, message: `User ${newStatus ? 'activated' : 'deactivated'}.` });
});

exports.createOfficer = asyncHandler(async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { name, email, password, phone } = req.body;

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw createError('Email already registered.', 409);

  const password_hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
    [name, email.toLowerCase(), password_hash, phone || null, 'officer']
  );
  res.status(201).json({ success: true, message: 'Officer account created.', id: result.insertId });
});


// ============================================================
// controllers/notificationController.js
// ============================================================

exports.getMyNotifications = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT n.*, c.complaint_no
     FROM notifications n
     LEFT JOIN complaints c ON c.id = n.complaint_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 30`,
    [req.user.id]
  );
  const unreadCount = rows.filter(r => !r.is_read).length;
  res.json({ success: true, notifications: rows, unread: unreadCount });
});

exports.markRead = asyncHandler(async (req, res) => {
  await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?',
    [req.user.id, req.params.id]
  );
  res.json({ success: true, message: 'Notification marked as read.' });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
    [req.user.id]
  );
  res.json({ success: true, message: 'All notifications marked as read.' });
});


// ============================================================
// controllers/slaController.js  (admin only)
// ============================================================

exports.getSLARules = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT s.*, d.name AS department_name
     FROM sla_rules s
     JOIN departments d ON d.id = s.department_id
     ORDER BY d.name, s.category, s.priority`
  );
  res.json({ success: true, rules: rows });
});

exports.updateSLARule = asyncHandler(async (req, res) => {
  const { sla_hours } = req.body;
  await pool.execute('UPDATE sla_rules SET sla_hours = ? WHERE id = ?', [sla_hours, req.params.id]);
  res.json({ success: true, message: 'SLA rule updated.' });
});
