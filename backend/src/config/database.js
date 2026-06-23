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

    // 创建表...
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'member', 'readonly') DEFAULT 'member',
        family_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_family (family_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS families (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        invite_code VARCHAR(20) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS elders (
        id VARCHAR(36) PRIMARY KEY,
        family_id VARCHAR(36) NOT NULL,
        name VARCHAR(50) NOT NULL,
        gender ENUM('男', '女') DEFAULT '男',
        age INT DEFAULT 0,
        blood_type VARCHAR(20),
        allergies TEXT,
        conditions TEXT,
        phone VARCHAR(20),
        avatar VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_family (family_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

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
        metrics JSON,
        orders TEXT,
        image_url TEXT,
        confidence DECIMAL(4,2),
        notes JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_elder (elder_id),
        INDEX idx_family (family_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

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
        INDEX idx_family (family_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS med_logs (
        id VARCHAR(36) PRIMARY KEY,
        med_id VARCHAR(36) NOT NULL,
        scheduled_time DATETIME NOT NULL,
        actual_time DATETIME,
        marked_by VARCHAR(36),
        missed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_med (med_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

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

    console.log('数据库表初始化完成');

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

// 获取连接池（初始化后可用）
function getPool() {
  if (!pool) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return pool;
}

module.exports = { getPool, initDatabase, getPool };
