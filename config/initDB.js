// ============================================================
// config/initDB.js — Create Database Schema & Seed Data
// Run with: node config/initDB.js
// ============================================================

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function initDB() {
  let conn;
  try {
    // Connect WITHOUT specifying the database first (to create it)
    conn = await mysql.createConnection({
      host:     process.env.DB_HOST     || 'localhost',
      port:     process.env.DB_PORT     || 3306,
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || 'Divssqlpass@26',
    });

    const DB = process.env.DB_NAME || 'civicpulse';
    console.log(`🔧  Initialising database: ${DB}`);

    // ── Create database ──
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\``);
    await conn.query(`USE \`${DB}\``);

    // ── USERS ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(100)  NOT NULL,
        email         VARCHAR(150)  NOT NULL UNIQUE,
        password_hash VARCHAR(255)  NOT NULL,
        phone         VARCHAR(20),
        role          ENUM('citizen','officer','admin') NOT NULL DEFAULT 'citizen',
        avatar_url    VARCHAR(255),
        is_active     TINYINT(1)    NOT NULL DEFAULT 1,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role  (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── DEPARTMENTS ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(100)  NOT NULL,
        code          VARCHAR(20)   NOT NULL UNIQUE,
        icon          VARCHAR(10)   NOT NULL DEFAULT '🏢',
        description   TEXT,
        sla_hours     INT           NOT NULL DEFAULT 48,
        head_officer_id INT,
        is_active     TINYINT(1)    NOT NULL DEFAULT 1,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── ZONES ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(100)  NOT NULL,
        code          VARCHAR(20)   NOT NULL UNIQUE,
        city          VARCHAR(100)  NOT NULL DEFAULT 'Meerut',
        latitude      DECIMAL(10,7),
        longitude     DECIMAL(10,7),
        risk_score    ENUM('low','medium','high') DEFAULT 'low',
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── COMPLAINTS ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        complaint_no    VARCHAR(20)   NOT NULL UNIQUE,
        title           VARCHAR(200)  NOT NULL,
        description     TEXT,
        category        ENUM('roads','water','sanitation','electricity','parks','other') NOT NULL,
        priority        ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
        status          ENUM('open','progress','resolved','closed') NOT NULL DEFAULT 'open',
        citizen_id      INT           NOT NULL,
        department_id   INT,
        assigned_officer_id INT,
        zone_id         INT,
        latitude        DECIMAL(10,7),
        longitude       DECIMAL(10,7),
        address         VARCHAR(300),
        image_url       VARCHAR(255),
        sla_deadline    DATETIME,
        resolved_at     DATETIME,
        closed_at       DATETIME,
        resolution_note TEXT,
        feedback_rating TINYINT,
        feedback_text   TEXT,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status      (status),
        INDEX idx_priority    (priority),
        INDEX idx_category    (category),
        INDEX idx_citizen     (citizen_id),
        INDEX idx_officer     (assigned_officer_id),
        INDEX idx_department  (department_id),
        INDEX idx_zone        (zone_id),
        INDEX idx_created     (created_at),
        FOREIGN KEY (citizen_id)           REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id)        REFERENCES departments(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_officer_id)  REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (zone_id)              REFERENCES zones(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── COMPLAINT TIMELINE ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS complaint_timeline (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        complaint_id  INT           NOT NULL,
        actor_id      INT,
        action        VARCHAR(100)  NOT NULL,
        description   TEXT,
        status_from   VARCHAR(30),
        status_to     VARCHAR(30),
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_complaint (complaint_id),
        FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id)     REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── SLA RULES ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sla_rules (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT           NOT NULL,
        category      ENUM('roads','water','sanitation','electricity','parks','other') NOT NULL,
        priority      ENUM('low','medium','high') NOT NULL,
        sla_hours     INT           NOT NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dept_cat_pri (department_id, category, priority),
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── NOTIFICATIONS ──
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        user_id       INT           NOT NULL,
        complaint_id  INT,
        type          ENUM('sla_breach','sla_warn','assigned','status_update','feedback') NOT NULL,
        title         VARCHAR(200)  NOT NULL,
        message       TEXT,
        is_read       TINYINT(1)    NOT NULL DEFAULT 0,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user    (user_id),
        INDEX idx_unread  (user_id, is_read),
        FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('✅  All tables created');
// 🌱 Insert Dummy Data

const seedData = async () => {
  try {
    // Users
    await connection.query(`
      INSERT INTO users (name, email, password, role)
      VALUES
      ('Admin User', 'admin@civicpulse.com', '123456', 'admin'),
      ('Riya Sharma', 'riya@gmail.com', '123456', 'citizen'),
      ('Amit Kumar', 'amit@gmail.com', '123456', 'citizen')
    `);

    // Departments
    await connection.query(`
      INSERT INTO departments (name)
      VALUES
      ('Sanitation'),
      ('Electricity'),
      ('Roads')
    `);

    // Zones
    await connection.query(`
      INSERT INTO zones (name)
      VALUES
      ('Zone A'),
      ('Zone B'),
      ('Zone C')
    `);

    // Complaints
    await connection.query(`
      INSERT INTO complaints (title, description, status, user_id)
      VALUES
      ('Garbage not collected', 'Trash hasn’t been picked for 3 days', 'pending', 2),
      ('Street light broken', 'Light not working at night', 'in_progress', 3),
      ('Potholes on road', 'Huge potholes causing traffic', 'resolved', 2)
    `);

    console.log("🌱 Dummy data inserted!");
  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
  }
};


    // ──────────────────────────────────────────────
    // SEED DATA
    // ──────────────────────────────────────────────

    // Zones
    await conn.query(`
      INSERT IGNORE INTO zones (name, code, city, latitude, longitude, risk_score) VALUES
      ('Zone 1 – Civil Lines',    'Z1', 'Meerut', 28.9845, 77.7064, 'high'),
      ('Zone 2 – Hapur Road',     'Z2', 'Meerut', 28.9756, 77.7215, 'medium'),
      ('Zone 3 – Begumpul',       'Z3', 'Meerut', 28.9612, 77.6958, 'high'),
      ('Zone 4 – Shastri Nagar',  'Z4', 'Meerut', 29.0012, 77.7189, 'low')
    `);

    // Departments
    await conn.query(`
      INSERT IGNORE INTO departments (name, code, icon, description, sla_hours) VALUES
      ('Roads & Infrastructure', 'ROADS', '🛣',  'Manages road repair, potholes, and civil infrastructure.', 48),
      ('Water Supply',           'WATER', '💧',  'Handles water pipeline issues and supply interruptions.',  24),
      ('Sanitation',             'SANIT', '🗑',  'Garbage collection, sewage, and public cleanliness.',      48),
      ('Electricity',            'ELECT', '⚡',  'Street lights, power outages, and electrical hazards.',    24),
      ('Parks & Gardens',        'PARKS', '🌳',  'Maintenance of public parks and green spaces.',            72)
    `);

    // Users – admin, officers, citizens
    const adminHash   = await bcrypt.hash('Admin@123',   10);
    const officerHash = await bcrypt.hash('Officer@123', 10);
    const citizenHash = await bcrypt.hash('Citizen@123', 10);

    await conn.query(`
      INSERT IGNORE INTO users (name, email, password_hash, phone, role) VALUES
      ('Super Admin',    'admin@civicpulse.in',    '${adminHash}',   '9999000001', 'admin'),
      ('Ravi Kumar',     'ravi@civicpulse.in',     '${officerHash}', '9999000002', 'officer'),
      ('Suresh Patel',   'suresh@civicpulse.in',   '${officerHash}', '9999000003', 'officer'),
      ('Priya Singh',    'priya@civicpulse.in',    '${officerHash}', '9999000004', 'officer'),
      ('Amit Verma',     'amit@civicpulse.in',     '${officerHash}', '9999000005', 'officer'),
      ('Rahul Das',      'rahul@civicpulse.in',    '${officerHash}', '9999000006', 'officer'),
      ('Anjali Sharma',  'anjali@example.com',     '${citizenHash}', '9876543210', 'citizen'),
      ('Rohan Gupta',    'rohan@example.com',      '${citizenHash}', '9876543211', 'citizen'),
      ('Sunita Yadav',   'sunita@example.com',     '${citizenHash}', '9876543212', 'citizen')
    `);

    // SLA Rules
    await conn.query(`
      INSERT IGNORE INTO sla_rules (department_id, category, priority, sla_hours)
      SELECT d.id, c.cat, p.pri, p.hrs
      FROM departments d
      CROSS JOIN (SELECT 'roads' AS cat UNION SELECT 'water' UNION SELECT 'sanitation' UNION SELECT 'electricity' UNION SELECT 'parks' UNION SELECT 'other') c
      CROSS JOIN (
        SELECT 'high'   AS pri, 12  AS hrs UNION
        SELECT 'medium',         48       UNION
        SELECT 'low',            72
      ) p
    `);

    // Sample Complaints
    await conn.query(`
      INSERT IGNORE INTO complaints
        (complaint_no, title, description, category, priority, status, citizen_id, department_id, zone_id, sla_deadline, created_at)
      VALUES
      ('CP-2847','Broken streetlight near school','Street light outside DAV school has been broken for 3 days.','electricity','high','progress',7,4,1, DATE_ADD(NOW(), INTERVAL 18 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR)),
      ('CP-2846','Sewage overflow on main road','Raw sewage overflowing onto MG Road causing health hazard.','sanitation','high','open',8,3,1, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
      ('CP-2845','Large pothole on MG Road','Dangerous 2-feet wide pothole near Gandhi Chowk.','roads','medium','progress',9,1,2, DATE_ADD(NOW(), INTERVAL 36 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR)),
      ('CP-2844','Park garbage not collected','Garbage not collected in Shastri Nagar park for 4 days.','sanitation','low','resolved',7,3,4, DATE_ADD(NOW(), INTERVAL 48 HOUR), DATE_SUB(NOW(), INTERVAL 24 HOUR)),
      ('CP-2843','Water supply cut for 24 hours','No water supply in Sector 12 area for over 24 hours.','water','high','progress',8,2,2, DATE_ADD(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
      ('CP-2842','Electricity pole leaning dangerously','High-tension pole leaning at dangerous angle near school.','electricity','high','resolved',9,4,1, DATE_ADD(NOW(), INTERVAL 24 HOUR), DATE_SUB(NOW(), INTERVAL 48 HOUR))
    `);

    // Sample Timeline entries
    await conn.query(`
      INSERT IGNORE INTO complaint_timeline (complaint_id, actor_id, action, description, status_from, status_to, created_at)
      SELECT c.id, 7, 'Complaint Submitted', 'Complaint registered by citizen.', NULL, 'open', c.created_at
      FROM complaints c
    `);

    console.log('✅  Seed data inserted');
    console.log('');
    console.log('🔑  Default credentials:');
    console.log('    Admin   → admin@civicpulse.in   / Admin@123');
    console.log('    Officer → ravi@civicpulse.in    / Officer@123');
    console.log('    Citizen → anjali@example.com    / Citizen@123');
    console.log('');
    console.log('🚀  Run `npm run dev` to start the server.');

  } catch (err) {
    console.error('❌  Init failed:', err.message);
    console.error(err);
  } finally {
    if (conn) await conn.end();
  }
}

initDB();
