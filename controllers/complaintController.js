// ============================================================
// controllers/complaintController.js — Full Complaint CRUD
// ============================================================

const pool = require('../config/db');
const { asyncHandler, createError } = require('../middleware/errorHandler');

// ── Helper: Build complaint_no ─────────────────────────────
const buildComplaintNo = (id) => `CP-${String(id).padStart(4, '0')}`;

// ── Helper: Compute SLA deadline ──────────────────────────
const getSLADeadline = async (departmentId, category, priority) => {
  const [rows] = await pool.execute(
    `SELECT sla_hours FROM sla_rules
     WHERE department_id = ? AND category = ? AND priority = ?`,
    [departmentId, category, priority]
  );
  const hours = rows.length ? rows[0].sla_hours : 48;
  const dl    = new Date();
  dl.setHours(dl.getHours() + hours);
  return dl;
};

// ── Helper: Auto-assign department by category ────────────
const getDeptByCategory = async (category) => {
  const map = {
    roads: 'ROADS', water: 'WATER', sanitation: 'SANIT',
    electricity: 'ELECT', parks: 'PARKS', other: 'ROADS',
  };
  const [rows] = await pool.execute(
    'SELECT id FROM departments WHERE code = ?', [map[category] || 'ROADS']
  );
  return rows.length ? rows[0].id : null;
};

// ── Helper: Append timeline entry ─────────────────────────
const addTimeline = async (conn, complaintId, actorId, action, description, statusFrom = null, statusTo = null) => {
  await conn.execute(
    `INSERT INTO complaint_timeline
       (complaint_id, actor_id, action, description, status_from, status_to)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [complaintId, actorId, action, description, statusFrom, statusTo]
  );
};

// ══════════════════════════════════════════════════════════
// PUBLIC
// ══════════════════════════════════════════════════════════

// ── GET /api/complaints/:id/public ── (no auth, for tracking)
exports.getPublic = asyncHandler(async (req, res) => {
  const { id } = req.params; // can be numeric id or complaint_no

  const isNo  = id.startsWith('CP-');
  const field = isNo ? 'complaint_no' : 'c.id';
  const val   = isNo ? id.toUpperCase() : parseInt(id);

  const [rows] = await pool.execute(
    `SELECT c.id, c.complaint_no, c.title, c.category, c.priority, c.status,
            c.zone_id, c.sla_deadline, c.created_at, c.resolved_at,
            c.feedback_rating,
            z.name AS zone_name,
            d.name AS department_name,
            u.name AS officer_name
     FROM complaints c
     LEFT JOIN zones       z ON z.id = c.zone_id
     LEFT JOIN departments d ON d.id = c.department_id
     LEFT JOIN users       u ON u.id = c.assigned_officer_id
     WHERE ${field} = ?`,
    [val]
  );

  if (!rows.length) throw createError('Complaint not found.', 404);

  const [timeline] = await pool.execute(
    `SELECT action, description, status_from, status_to, created_at
     FROM complaint_timeline WHERE complaint_id = ? ORDER BY created_at ASC`,
    [rows[0].id]
  );

  res.json({ success: true, complaint: rows[0], timeline });
});

// ══════════════════════════════════════════════════════════
// CITIZEN
// ══════════════════════════════════════════════════════════

// ── POST /api/complaints ──────────────────────────────────
exports.create = asyncHandler(async (req, res) => {
  const { title, description, category, priority = 'medium', zone_id, latitude, longitude, address } = req.body;
  const citizen_id   = req.user.id;
  const image_url    = req.file ? `/uploads/${req.file.filename}` : null;
  const department_id = await getDeptByCategory(category);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert complaint (complaint_no updated after we have the id)
    const [result] = await conn.execute(
      `INSERT INTO complaints
         (complaint_no, title, description, category, priority, citizen_id,
          department_id, zone_id, latitude, longitude, address, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'TEMP', title, description || null, category, priority, citizen_id,
        department_id, zone_id || null, latitude || null, longitude || null,
        address || null, image_url
      ]
    );

    const cid = result.insertId;
    const no  = buildComplaintNo(cid);

    // Set complaint_no and SLA
    let sla_deadline = null;
    if (department_id) {
      sla_deadline = await getSLADeadline(department_id, category, priority);
    }

    await conn.execute(
      'UPDATE complaints SET complaint_no = ?, sla_deadline = ? WHERE id = ?',
      [no, sla_deadline, cid]
    );

    // Timeline: submitted
    await addTimeline(conn, cid, citizen_id, 'Complaint Submitted',
      'Complaint registered by citizen. Assigned to department.', null, 'open');

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      complaint_no: no,
      complaint_id: cid,
      sla_deadline,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ── GET /api/complaints/my ────────────────────────────────
exports.getMy = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = 'WHERE c.citizen_id = ?';
  const params = [req.user.id];

  if (status) { where += ' AND c.status = ?'; params.push(status); }

  const [complaints] = await pool.execute(
    `SELECT c.id, c.complaint_no, c.title, c.category, c.priority, c.status,
            c.sla_deadline, c.created_at, c.resolved_at,
            z.name AS zone_name, d.name AS department_name
     FROM complaints c
     LEFT JOIN zones       z ON z.id = c.zone_id
     LEFT JOIN departments d ON d.id = c.department_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM complaints c ${where}`, params
  );

  res.json({ success: true, complaints, total, page: parseInt(page), limit: parseInt(limit) });
});

// ── POST /api/complaints/:id/feedback ─────────────────────
exports.submitFeedback = asyncHandler(async (req, res) => {
  const { rating, feedback_text } = req.body;
  const { id } = req.params;

  const [rows] = await pool.execute(
    'SELECT * FROM complaints WHERE id = ? AND citizen_id = ?',
    [id, req.user.id]
  );
  if (!rows.length) throw createError('Complaint not found.', 404);
  if (rows[0].status !== 'resolved') throw createError('Feedback can only be given on resolved complaints.', 400);
  if (rows[0].feedback_rating)       throw createError('Feedback already submitted.', 409);

  await pool.execute(
    `UPDATE complaints SET feedback_rating = ?, feedback_text = ?, status = 'closed', closed_at = NOW()
     WHERE id = ?`,
    [rating, feedback_text || null, id]
  );

  res.json({ success: true, message: 'Feedback submitted. Complaint closed.' });
});

// ══════════════════════════════════════════════════════════
// OFFICER
// ══════════════════════════════════════════════════════════

// ── GET /api/complaints/assigned ─────────────────────────
exports.getAssigned = asyncHandler(async (req, res) => {
  const { status, priority, page = 1, limit = 15 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [req.user.id];
  let where = 'WHERE c.assigned_officer_id = ?';

  if (status)   { where += ' AND c.status = ?';   params.push(status); }
  if (priority) { where += ' AND c.priority = ?'; params.push(priority); }

  const [complaints] = await pool.execute(
    `SELECT c.id, c.complaint_no, c.title, c.category, c.priority, c.status,
            c.sla_deadline, c.created_at,
            CASE WHEN c.sla_deadline < NOW() AND c.status NOT IN ('resolved','closed')
                 THEN 1 ELSE 0 END AS sla_breached,
            z.name AS zone_name,
            u.name AS citizen_name
     FROM complaints c
     LEFT JOIN zones z ON z.id = c.zone_id
     LEFT JOIN users u ON u.id = c.citizen_id
     ${where}
     ORDER BY c.priority DESC, c.created_at ASC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  res.json({ success: true, complaints });
});

// ── PUT /api/complaints/:id/status ────────────────────────
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status, resolution_note } = req.body;
  const { id } = req.params;
  const actor  = req.user;

  const allowed = {
    officer: ['progress', 'resolved'],
    admin:   ['open', 'progress', 'resolved', 'closed'],
  };

  if (!allowed[actor.role]?.includes(status)) {
    throw createError(`Cannot set status to '${status}' with your role.`, 403);
  }

  const [rows] = await pool.execute('SELECT * FROM complaints WHERE id = ?', [id]);
  if (!rows.length) throw createError('Complaint not found.', 404);

  const prev = rows[0];

  // Officer can only update their own assigned complaints
  if (actor.role === 'officer' && prev.assigned_officer_id !== actor.id) {
    throw createError('You are not assigned to this complaint.', 403);
  }

  const extra = {};
  if (status === 'resolved') {
    extra.resolved_at     = new Date();
    extra.resolution_note = resolution_note || null;
  }

  await pool.execute(
    `UPDATE complaints
     SET status = ?, resolved_at = ?, resolution_note = ?
     WHERE id = ?`,
    [status, extra.resolved_at || null, extra.resolution_note || null, id]
  );

  const conn = await pool.getConnection();
  try {
    await addTimeline(conn, id, actor.id, 'Status Updated',
      `Status changed to '${status}'. ${resolution_note || ''}`.trim(),
      prev.status, status
    );
  } finally {
    conn.release();
  }

  res.json({ success: true, message: `Status updated to '${status}'.` });
});

// ── GET /api/complaints/:id ───────────────────────────────
exports.getOne = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user   = req.user;

  const [rows] = await pool.execute(
    `SELECT c.*,
            z.name AS zone_name, d.name AS department_name,
            u.name AS citizen_name, u.phone AS citizen_phone,
            o.name AS officer_name
     FROM complaints c
     LEFT JOIN zones       z ON z.id = c.zone_id
     LEFT JOIN departments d ON d.id = c.department_id
     LEFT JOIN users       u ON u.id = c.citizen_id
     LEFT JOIN users       o ON o.id = c.assigned_officer_id
     WHERE c.id = ?`,
    [id]
  );

  if (!rows.length) throw createError('Complaint not found.', 404);

  const c = rows[0];
  // Citizens can only view their own
  if (user.role === 'citizen' && c.citizen_id !== user.id) {
    throw createError('Access denied.', 403);
  }

  const [timeline] = await pool.execute(
    `SELECT t.*, u.name AS actor_name
     FROM complaint_timeline t
     LEFT JOIN users u ON u.id = t.actor_id
     WHERE t.complaint_id = ? ORDER BY t.created_at ASC`,
    [id]
  );

  res.json({ success: true, complaint: c, timeline });
});

// ══════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════

// ── GET /api/complaints ─── (admin / officer)
exports.getAll = asyncHandler(async (req, res) => {
  const { status, priority, category, zone_id, department_id, page, limit, search } = req.query;

  // ✅ Safe pagination (prevents NaN SQL crash)
  const pageNum  = Math.max(parseInt(page)  || 1, 1);
  const limitNum = Math.max(parseInt(limit) || 20, 1);
  const offset   = (pageNum - 1) * limitNum;

  const params = [];
  let where = 'WHERE 1=1';

  if (status) {
    where += ' AND c.status = ?';
    params.push(status);
  }

  if (priority) {
    where += ' AND c.priority = ?';
    params.push(priority);
  }

  if (category) {
    where += ' AND c.category = ?';
    params.push(category);
  }

  if (zone_id) {
    where += ' AND c.zone_id = ?';
    params.push(parseInt(zone_id));
  }

  if (department_id) {
    where += ' AND c.department_id = ?';
    params.push(parseInt(department_id));
  }

  // ✅ Safe search (prevents %undefined%)
  if (search && search.trim()) {
    where += ' AND (c.title LIKE ? OR c.complaint_no LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // 🔍 Debug (optional – remove later)
  console.log("QUERY PARAMS:", params, "LIMIT:", limitNum, "OFFSET:", offset);

  const [complaints] = await pool.query(
    `SELECT 
        c.id,
        c.complaint_no,
        c.title,
        c.category,
        c.priority,
        c.status,
        c.sla_deadline,
        c.created_at,

        CASE 
          WHEN c.sla_deadline < NOW() AND c.status NOT IN ('resolved','closed')
          THEN 1 ELSE 0 
        END AS sla_breached,

        z.name AS zone_name,
        d.name AS department_name,
        u.name AS citizen_name,
        o.name AS officer_name

     FROM complaints c
     LEFT JOIN zones       z ON z.id = c.zone_id
     LEFT JOIN departments d ON d.id = c.department_id
     LEFT JOIN users       u ON u.id = c.citizen_id
     LEFT JOIN users       o ON o.id = c.assigned_officer_id

     ${where}

     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM complaints c ${where}`,
    params
  );

  res.json({
    success: true,
    complaints,
    total,
    page: pageNum,
    limit: limitNum
  });
});


// ── PUT /api/complaints/:id/assign ────────────────────────
exports.assign = asyncHandler(async (req, res) => {
  const { officer_id, department_id } = req.body;
  const { id } = req.params;

  const [rows] = await pool.execute('SELECT * FROM complaints WHERE id = ?', [id]);
  if (!rows.length) throw createError('Complaint not found.', 404);

  await pool.execute(
    'UPDATE complaints SET assigned_officer_id = ?, department_id = ? WHERE id = ?',
    [officer_id || null, department_id || rows[0].department_id, id]
  );

  const conn = await pool.getConnection();
  try {
    await addTimeline(conn, id, req.user.id, 'Officer Assigned',
      `Complaint assigned to officer ID ${officer_id}.`, rows[0].status, rows[0].status);
  } finally {
    conn.release();
  }

  res.json({ success: true, message: 'Complaint assigned successfully.' });
});

// ── DELETE /api/complaints/:id ────────────────────────────
exports.remove = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT id FROM complaints WHERE id = ?', [req.params.id]);
  if (!rows.length) throw createError('Complaint not found.', 404);
  await pool.execute('DELETE FROM complaints WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Complaint deleted.' });
});
