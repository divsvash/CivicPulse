// ============================================================
// controllers/analyticsController.js — Dashboard & Reports
// ============================================================

const pool = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

// ── GET /api/analytics/overview ───────────────────────────
// Top-level KPI cards for the admin dashboard
exports.getOverview = asyncHandler(async (req, res) => {
  const [[totals]] = await pool.execute(`
    SELECT
      COUNT(*)                                                     AS total,
      SUM(status IN ('open','progress'))                           AS active,
      SUM(status = 'resolved' OR status = 'closed')               AS resolved,
      SUM(status = 'open')                                         AS open_count,
      SUM(status = 'progress')                                     AS in_progress,
      SUM(sla_deadline < NOW() AND status NOT IN ('resolved','closed')) AS sla_breaches,
      ROUND(AVG(
        CASE WHEN resolved_at IS NOT NULL
             THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at)
        END
      ), 1)                                                        AS avg_resolution_hours
    FROM complaints
  `);

  const [[{ today }]] = await pool.execute(
    `SELECT COUNT(*) AS today FROM complaints WHERE DATE(created_at) = CURDATE()`
  );

  const [[{ compliance }]] = await pool.execute(`
    SELECT ROUND(
      100.0 * SUM(resolved_at IS NOT NULL AND resolved_at <= sla_deadline)
            / NULLIF(SUM(resolved_at IS NOT NULL), 0), 1
    ) AS compliance
    FROM complaints
  `);

  res.json({
    success: true,
    overview: {
      ...totals,
      today_complaints: today,
      sla_compliance_pct: compliance || 0,
    },
  });
});

// ── GET /api/analytics/monthly-trend ──────────────────────
// Last 12 months complaint counts for bar chart
exports.getMonthlyTrend = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      DATE_FORMAT(created_at, '%b %Y') AS month,
      DATE_FORMAT(created_at, '%Y-%m') AS month_key,
      COUNT(*)                          AS total,
      SUM(status IN ('resolved','closed')) AS resolved
    FROM complaints
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    GROUP BY month_key, month
    ORDER BY month_key ASC
  `);

  res.json({ success: true, trend: rows });
});

// ── GET /api/analytics/by-category ────────────────────────
exports.getByCategory = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      category,
      COUNT(*) AS total,
      SUM(status IN ('resolved','closed')) AS resolved,
      ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)), 1) AS avg_hours
    FROM complaints
    GROUP BY category
    ORDER BY total DESC
  `);

  res.json({ success: true, categories: rows });
});

// ── GET /api/analytics/heatmap ────────────────────────────
// Zone-wise complaint density + risk score
exports.getHeatmap = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      z.id, z.name, z.code, z.latitude, z.longitude, z.risk_score,
      COUNT(c.id)                                    AS total_complaints,
      SUM(c.status = 'open')                         AS open_complaints,
      SUM(c.sla_deadline < NOW() AND c.status NOT IN ('resolved','closed')) AS sla_breaches,
      ROUND(AVG(TIMESTAMPDIFF(HOUR, c.created_at, c.resolved_at)), 1) AS avg_resolution_hours
    FROM zones z
    LEFT JOIN complaints c ON c.zone_id = z.id
    GROUP BY z.id
    ORDER BY total_complaints DESC
  `);

  res.json({ success: true, heatmap: rows });
});

// ── GET /api/analytics/department-leaderboard ─────────────
exports.getLeaderboard = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      d.id, d.name, d.icon,
      COUNT(c.id)                                     AS total_assigned,
      SUM(c.status IN ('resolved','closed'))           AS resolved,
      ROUND(AVG(TIMESTAMPDIFF(HOUR, c.created_at, c.resolved_at)), 1) AS avg_resolution_hours,
      ROUND(AVG(c.feedback_rating), 2)                AS avg_rating,
      SUM(c.sla_deadline < c.resolved_at)             AS sla_violations,
      ROUND(
        100.0 * SUM(c.resolved_at <= c.sla_deadline AND c.resolved_at IS NOT NULL)
              / NULLIF(SUM(c.resolved_at IS NOT NULL), 0), 1
      )                                               AS sla_compliance_pct,
      ROUND(
        100.0 * SUM(c.status IN ('resolved','closed')) / NULLIF(COUNT(c.id), 0), 1
      )                                               AS efficiency_pct
    FROM departments d
    LEFT JOIN complaints c ON c.department_id = d.id
    GROUP BY d.id
    ORDER BY efficiency_pct DESC, avg_resolution_hours ASC
  `);

  res.json({ success: true, leaderboard: rows });
});

// ── GET /api/analytics/sla-violations ─────────────────────
exports.getSLAViolations = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      c.id, c.complaint_no, c.title, c.category, c.priority,
      c.sla_deadline,
      TIMESTAMPDIFF(HOUR, c.sla_deadline, NOW()) AS hours_overdue,
      z.name AS zone_name, d.name AS department_name,
      u.name AS officer_name
    FROM complaints c
    LEFT JOIN zones       z ON z.id = c.zone_id
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN users       u ON u.id = c.assigned_officer_id
    WHERE c.sla_deadline < NOW()
      AND c.status NOT IN ('resolved','closed')
    ORDER BY hours_overdue DESC
    LIMIT 50
  `);

  res.json({ success: true, violations: rows, count: rows.length });
});

// ── GET /api/analytics/predictive ─────────────────────────
// Simple trend-based "AI" insight (last-30-days growth rate per zone+category)
exports.getPredictiveInsights = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      z.name AS zone_name, c.category,
      SUM(CASE WHEN c.created_at >= DATE_SUB(NOW(), INTERVAL 15 DAY) THEN 1 ELSE 0 END) AS last_15_days,
      SUM(CASE WHEN c.created_at < DATE_SUB(NOW(), INTERVAL 15 DAY)
               AND c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS prev_15_days
    FROM complaints c
    LEFT JOIN zones z ON z.id = c.zone_id
    WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY z.name, c.category
    HAVING last_15_days > 0 AND prev_15_days > 0
    ORDER BY (last_15_days - prev_15_days) DESC
    LIMIT 5
  `);

  const insights = rows.map((r) => {
    const growth = Math.round(((r.last_15_days - r.prev_15_days) / r.prev_15_days) * 100);
    return {
      zone: r.zone_name,
      category: r.category,
      growth_pct: growth,
      message: `${r.category.charAt(0).toUpperCase() + r.category.slice(1)} complaints in ${r.zone_name} likely to increase by ~${growth}% this week based on 30-day trend.`,
    };
  }).filter((i) => i.growth_pct > 0);

  res.json({ success: true, insights });
});
