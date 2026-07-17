const mysql = require('mysql2/promise');

// 先不指定 database，连接到 MySQL 服务器
const basePool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// 带数据库的连接池（初始化后使用）
let pool = null;

const DB_NAME = process.env.DB_NAME || 'family_health';

// 初始化数据库表
async function initDatabase() {
  const connection = await basePool.getConnection();
  try {
    // 创建数据库（如果不存在），指定 utf8mb4 字符集
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${DB_NAME}\``);

    // 1. 用户表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'member', 'readonly') DEFAULT 'member',
        family_id VARCHAR(36),
        authorized BOOLEAN DEFAULT FALSE,
        avatar VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_family (family_id),
        INDEX idx_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. 家庭表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS families (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL DEFAULT '我的家庭',
        invite_code VARCHAR(20) UNIQUE,
        invite_expiry DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 3. 成员档案表（含自己和老人）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS elders (
        id VARCHAR(36) PRIMARY KEY,
        family_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) COMMENT '关联用户ID（自己时非空）',
        name VARCHAR(50) NOT NULL,
        gender ENUM('男', '女', '未知') DEFAULT '未知',
        age INT DEFAULT 0,
        blood_type VARCHAR(20),
        allergies TEXT,
        conditions TEXT,
        phone VARCHAR(20),
        avatar VARCHAR(10),
        relation ENUM('self', 'parent', 'spouse_parent', 'spouse', 'other') DEFAULT 'other' COMMENT '与操作者的关系',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_family (family_id),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 4. 病历记录表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS records (
        id VARCHAR(36) PRIMARY KEY,
        elder_id VARCHAR(36) NOT NULL,
        family_id VARCHAR(36) NOT NULL,
        type ENUM('病历', '检查报告', '药方') DEFAULT '病历',
        visit_date DATE,
        hospital VARCHAR(100),
        department VARCHAR(50),
        diagnosis TEXT,
        chief_complaint TEXT,
        findings TEXT COMMENT '检查所见（报告类型）',
        conclusion TEXT COMMENT '报告结论（报告类型）',
        metrics JSON,
        orders TEXT,
        image_url TEXT,
        confidence DECIMAL(4,2),
        notes JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_elder (elder_id),
        INDEX idx_family (family_id),
        INDEX idx_visit_date (visit_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 5. 用药计划表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id VARCHAR(36) PRIMARY KEY,
        elder_id VARCHAR(36) NOT NULL,
        family_id VARCHAR(36) NOT NULL,
        name VARCHAR(100) NOT NULL,
        dose VARCHAR(50),
        frequency VARCHAR(50),
        times JSON,
        start_date DATE,
        end_date DATE,
        note TEXT,
        source_prescription_id VARCHAR(36),
        reminder BOOLEAN DEFAULT TRUE,
        status ENUM('active', 'ended') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_elder (elder_id),
        INDEX idx_family (family_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 6. 服药记录表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS med_logs (
        id VARCHAR(36) PRIMARY KEY,
        med_id VARCHAR(36) NOT NULL,
        scheduled_time DATETIME NOT NULL,
        actual_time DATETIME,
        marked_by VARCHAR(36),
        missed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_med (med_id),
        INDEX idx_scheduled (scheduled_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 7. 药品库存表（药箱）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS drug_inventory (
        id VARCHAR(36) PRIMARY KEY,
        family_id VARCHAR(36) NOT NULL,
        elder_id VARCHAR(36),
        name VARCHAR(100) NOT NULL,
        specification VARCHAR(100),
        manufacturer VARCHAR(100),
        quantity INT DEFAULT 1,
        expiry_date DATE,
        status ENUM('valid', 'expiring_soon', 'expired') DEFAULT 'valid',
        source_prescription_id VARCHAR(36),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_family (family_id),
        INDEX idx_elder (elder_id),
        INDEX idx_status (status),
        INDEX idx_expiry (expiry_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 8. 文件表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS files (
        id VARCHAR(36) PRIMARY KEY,
        family_id VARCHAR(36) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        minio_key VARCHAR(500) NOT NULL,
        size BIGINT,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_family (family_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 自动更新药品库存状态（已过期/即将过期）
    await connection.query(`
      UPDATE drug_inventory SET status = 'expired' WHERE expiry_date < CURDATE() AND status != 'expired'
    `);
    await connection.query(`
      UPDATE drug_inventory SET status = 'expiring_soon' WHERE expiry_date >= CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND status = 'valid'
    `);

    console.log('数据库表初始化完成');

    // 兼容旧表：添加 manufacturer 列（如已存在则跳过）
    try {
      await connection.query(`ALTER TABLE drug_inventory ADD COLUMN manufacturer VARCHAR(100) AFTER specification`);
      console.log('添加 manufacturer 列成功');
    } catch (e) {
      if (!e.message.includes('Duplicate column name')) console.error('添加 manufacturer 列:', e.message);
    }

    // 初始化完成后，创建带数据库的连接池
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

  } finally {
    connection.release();
  }
}

// 重建数据库（删除并重新创建所有表）
async function rebuildDatabase() {
  const connection = await basePool.getConnection();
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    console.log('数据库已删除，将重新创建...');
  } finally {
    connection.release();
  }
  await initDatabase();
  console.log('数据库重建完成');
}

// 检查数据库连通性并确保连接池可用，同时自动补充缺失的列
async function checkDatabase() {
  const connection = await basePool.getConnection();
  try {
    // 确保数据库存在
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    // 初始化连接池
    if (!pool) {
      pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });
    }
    // 简单查询验证连通性
    await pool.query('SELECT 1');
    // 自动补充缺失的列（兼容已有数据库）
    await _ensureColumns(pool);
  } finally {
    connection.release();
  }
}

// 自动检测并添加缺失的列
async function _ensureColumns(p) {
  // 先检查各表是否存在，不存在则创建
  const [tables] = await p.query(`SHOW TABLES`);
  const tableNames = tables.map(t => Object.values(t)[0]);

  // 如果核心表不存在，执行完整初始化
  const requiredTables = ['users', 'families', 'elders', 'records', 'medications', 'drug_inventory'];
  const missingTables = requiredTables.filter(t => !tableNames.includes(t));
  if (missingTables.length > 0) {
    console.log(`检测到缺失的表: ${missingTables.join(', ')}，执行初始化...`);
    await initDatabase();
    return;
  }

  // 检查records表是否缺少findings和conclusion列
  const [cols] = await p.query(`SHOW COLUMNS FROM records LIKE 'findings'`);
  if (cols.length === 0) {
    await p.query(`ALTER TABLE records ADD COLUMN findings TEXT COMMENT '检查所见（报告类型）' AFTER chief_complaint`);
    await p.query(`ALTER TABLE records ADD COLUMN conclusion TEXT COMMENT '报告结论（报告类型）' AFTER findings`);
    console.log('已补充 records 表的 findings/conclusion 列');
  }
  // 检查elders表是否缺少relation列
  const [relCols] = await p.query(`SHOW COLUMNS FROM elders LIKE 'relation'`);
  if (relCols.length === 0) {
    await p.query(`ALTER TABLE elders ADD COLUMN relation ENUM('self', 'parent', 'spouse_parent', 'spouse', 'other') DEFAULT 'other' COMMENT '与操作者的关系' AFTER avatar`);
    console.log('已补充 elders 表的 relation 列');
  }
  // 检查elders表是否缺少user_id列
  const [uidCols] = await p.query(`SHOW COLUMNS FROM elders LIKE 'user_id'`);
  if (uidCols.length === 0) {
    await p.query(`ALTER TABLE elders ADD COLUMN user_id VARCHAR(36) COMMENT '关联用户ID（自己时非空）' AFTER family_id`);
    await p.query(`ALTER TABLE elders ADD INDEX idx_user (user_id)`);
    console.log('已补充 elders 表的 user_id 列');
  }
  // 检查users表是否缺少authorized列
  const [authCols] = await p.query(`SHOW COLUMNS FROM users LIKE 'authorized'`);
  if (authCols.length === 0) {
    await p.query(`ALTER TABLE users ADD COLUMN authorized BOOLEAN DEFAULT TRUE AFTER role`);
    console.log('已补充 users 表的 authorized 列');
  }
  // 检查gender列是否包含'未知'选项
  const [genderCols] = await p.query(`SHOW COLUMNS FROM elders LIKE 'gender'`);
  if (genderCols.length > 0 && genderCols[0].Type && !genderCols[0].Type.includes('未知')) {
    await p.query(`ALTER TABLE elders MODIFY COLUMN gender ENUM('男', '女', '未知') DEFAULT '未知'`);
    console.log('已更新 elders 表 gender 列的 ENUM 值');
  }
}

// 获取连接池（初始化后可用）
function getPool() {
  if (!pool) {
    throw new Error('数据库未初始化，请先调用 checkDatabase()');
  }
  return pool;
}

module.exports = { getPool, checkDatabase, initDatabase, rebuildDatabase };
