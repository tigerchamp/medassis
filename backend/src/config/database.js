const USE_MOCK = process.argv.includes('--mock') || process.argv.includes('--mock-data');

if (USE_MOCK) {
  const { fakePool } = require('../mock/fakePool');
  module.exports = {
    getPool: () => fakePool,
    checkDatabase: async () => { console.log('✓ Mock模式: 使用内存数据库'); },
    initDatabase: async () => { console.log('✓ Mock模式: 跳过数据库初始化'); },
    rebuildDatabase: async () => { fakePool._reset(); console.log('✓ Mock模式: 内存数据库已重置'); }
  };
  return;
}

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
        record_no VARCHAR(20) DEFAULT NULL COMMENT '记录编号（BL/CF/JC+日期+字母序号）',
        visit_date DATE,
        hospital VARCHAR(100),
        department VARCHAR(50),
        diagnosis TEXT,
        chief_complaint TEXT,
        findings TEXT COMMENT '检查所见（报告类型）',
        conclusion TEXT COMMENT '报告结论（报告类型）',
        metrics JSON,
        orders TEXT,
        doctor VARCHAR(50) COMMENT '主治医生',
        image_url TEXT,
        confidence DECIMAL(4,2),
        notes JSON,
        ocr_text LONGTEXT COMMENT 'OCR识别原文（扫描保存时留存）',
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
        drug_code VARCHAR(50) COMMENT '关联药品库 drugs.code',
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
        INDEX idx_status (status),
        INDEX idx_drug_code (drug_code)
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
        drug_code VARCHAR(50) COMMENT '关联药品库 drugs.code',
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
        INDEX idx_expiry (expiry_date),
        INDEX idx_drug_code (drug_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 7.1 药品库表（国家药品编码本位码库，由 import_drugs.js 导入）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS drugs (
        code VARCHAR(50) NOT NULL COMMENT '药品编码(主键)',
        approval_number VARCHAR(100) DEFAULT NULL COMMENT '批准文号/注册证号',
        name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '产品名称',
        pinyin_abbr VARCHAR(50) DEFAULT '' COMMENT '产品名称拼音首字母缩写',
        generic_name VARCHAR(255) DEFAULT NULL COMMENT '通用名',
        category VARCHAR(100) DEFAULT NULL COMMENT '药品分类',
        dosage_form VARCHAR(100) DEFAULT NULL COMMENT '剂型',
        specification VARCHAR(500) DEFAULT NULL COMMENT '规格',
        spec_dosage DECIMAL(10,3) DEFAULT NULL COMMENT '规格数值（每片/袋含量，如0.25）',
        spec_dosage_unit ENUM('g','mg','ml','μg') DEFAULT NULL COMMENT '规格单位',
        unit_capacity INT DEFAULT NULL COMMENT '单位容量数值（每包装含量，如20）',
        unit_capacity_unit ENUM('片','粒','袋','支','瓶','贴') DEFAULT NULL COMMENT '包装单位',
        manufacturer VARCHAR(255) DEFAULT NULL COMMENT '生产单位',
        indication TEXT DEFAULT NULL COMMENT '适应症',
        contraindication TEXT DEFAULT NULL COMMENT '禁忌症',
        dosage_instruction TEXT DEFAULT NULL COMMENT '用法用量',
        adverse_reaction TEXT DEFAULT NULL COMMENT '不良反应',
        drug_interaction TEXT DEFAULT NULL COMMENT '药物相互作用',
        precaution TEXT DEFAULT NULL COMMENT '注意事项',
        storage TEXT DEFAULT NULL COMMENT '贮藏',
        type1 VARCHAR(100) DEFAULT NULL COMMENT '药品类别（如感冒、消炎）',
        syz TEXT DEFAULT NULL COMMENT '适应症',
        jx VARCHAR(100) DEFAULT NULL COMMENT '剂型',
        wyy TINYINT(1) DEFAULT 0 COMMENT '是否外用：0=否，1=是',
        fl VARCHAR(50) DEFAULT NULL COMMENT '中西药：中药/西药',
        description LONGTEXT DEFAULT NULL COMMENT '药品说明',
        description_fetched_at DATETIME DEFAULT NULL COMMENT '说明书获取时间',
        PRIMARY KEY (code),
        INDEX idx_pinyin (pinyin_abbr),
        INDEX idx_name (name),
        INDEX idx_approval (approval_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='药品目录表'
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

    // 8. 实体文件关联表（统一管理病历/检查报告/处方/药品等图片）
    await connection.query(`
      CREATE TABLE IF NOT EXISTS entity_files (
        id VARCHAR(36) PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL COMMENT '实体类型：record/medication/drug_inventory',
        entity_id VARCHAR(36) NOT NULL COMMENT '实体ID',
        file_id VARCHAR(36) NOT NULL COMMENT '关联 files 表ID',
        sort_order INT DEFAULT 0 COMMENT '排序',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_entity (entity_type, entity_id),
        INDEX idx_file (file_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
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

  // 检查并创建 files 表（如不存在）
  const [filesTableExists] = await p.query(`SHOW TABLES LIKE 'files'`);
  if (filesTableExists.length === 0) {
    await p.query(`
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
    console.log('已创建 files 文件表');
  }

  // 检查并创建 entity_files 表（如不存在）
  const [efTableExists] = await p.query(`SHOW TABLES LIKE 'entity_files'`);
  if (efTableExists.length === 0) {
    await p.query(`
      CREATE TABLE IF NOT EXISTS entity_files (
        id VARCHAR(36) PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL COMMENT '实体类型：record/medication/drug_inventory',
        entity_id VARCHAR(36) NOT NULL COMMENT '实体ID',
        file_id VARCHAR(36) NOT NULL COMMENT '关联 files 表ID',
        sort_order INT DEFAULT 0 COMMENT '排序',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_entity (entity_type, entity_id),
        INDEX idx_file (file_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('已创建 entity_files 关联表');
  }

  // 检查并创建 hospitals 表（如不存在）
  const [hospTableExists] = await p.query(`SHOW TABLES LIKE 'hospitals'`);
  if (hospTableExists.length === 0) {
    await p.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        pinyin_abbr VARCHAR(100) DEFAULT NULL,
        address VARCHAR(500) DEFAULT NULL,
        postcode VARCHAR(10) DEFAULT NULL,
        phone VARCHAR(200) DEFAULT NULL,
        UNIQUE INDEX idx_name (name),
        INDEX idx_pinyin (pinyin_abbr)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('已创建 hospitals 医院信息表');
  }

  // 检查hospitals表是否缺少pinyin_abbr列
  const [hospPyCols] = await p.query(`SHOW COLUMNS FROM hospitals LIKE 'pinyin_abbr'`);
  if (hospPyCols.length === 0) {
    await p.query(`ALTER TABLE hospitals ADD COLUMN pinyin_abbr VARCHAR(100) DEFAULT NULL AFTER name, ADD INDEX idx_pinyin (pinyin_abbr)`);
    console.log('已补充 hospitals 表的 pinyin_abbr 列');
  }
  // 检查hospitals表是否缺少abbreviation(简称)/alias(别名)列
  const [hospAbbrCols] = await p.query(`SHOW COLUMNS FROM hospitals LIKE 'abbreviation'`);
  if (hospAbbrCols.length === 0) {
    await p.query(`ALTER TABLE hospitals ADD COLUMN abbreviation VARCHAR(100) DEFAULT NULL COMMENT '简称' AFTER pinyin_abbr`);
    await p.query(`ALTER TABLE hospitals ADD COLUMN alias VARCHAR(200) DEFAULT NULL COMMENT '别名' AFTER abbreviation`);
    console.log('已补充 hospitals 表的 abbreviation/alias 列');
  }
  // 检查hospitals表是否缺少owner_user_id列（用户私有数据隔离：NULL=标准共享数据，非NULL=创建者私有）
  const [hospOwnerCols] = await p.query(`SHOW COLUMNS FROM hospitals LIKE 'owner_user_id'`);
  if (hospOwnerCols.length === 0) {
    await p.query(`ALTER TABLE hospitals ADD COLUMN owner_user_id VARCHAR(36) DEFAULT NULL COMMENT '创建者用户ID(NULL=标准共享数据)' AFTER alias`);
    await p.query(`ALTER TABLE hospitals ADD INDEX idx_owner (owner_user_id)`);
    console.log('已补充 hospitals 表的 owner_user_id 列');
  }
  // 将 hospitals.name 的唯一索引改为普通索引，支持不同用户/家庭添加同名私有医院
  const [hospNameUnique] = await p.query(`SHOW INDEX FROM hospitals WHERE Key_name = 'idx_name' AND Non_unique = 0`);
  if (hospNameUnique.length > 0) {
    await p.query(`ALTER TABLE hospitals DROP INDEX idx_name, ADD INDEX idx_name (name)`);
    console.log('已将 hospitals.idx_name 从唯一索引改为普通索引');
  }

  // 创建 departments 科室表
  await p.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      pinyin_abbr VARCHAR(50) DEFAULT NULL,
      category VARCHAR(20) DEFAULT NULL,
      UNIQUE INDEX idx_name (name),
      INDEX idx_pinyin (pinyin_abbr),
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 检查departments表是否缺少abbreviation(简称)/alias(别名)列
  const [deptAbbrCols] = await p.query(`SHOW COLUMNS FROM departments LIKE 'abbreviation'`);
  if (deptAbbrCols.length === 0) {
    await p.query(`ALTER TABLE departments ADD COLUMN abbreviation VARCHAR(50) DEFAULT NULL COMMENT '简称' AFTER pinyin_abbr`);
    await p.query(`ALTER TABLE departments ADD COLUMN alias VARCHAR(200) DEFAULT NULL COMMENT '别名' AFTER abbreviation`);
    console.log('已补充 departments 表的 abbreviation/alias 列');
  }
  // 检查departments表是否缺少owner_user_id列（用户私有数据隔离）
  const [deptOwnerCols] = await p.query(`SHOW COLUMNS FROM departments LIKE 'owner_user_id'`);
  if (deptOwnerCols.length === 0) {
    await p.query(`ALTER TABLE departments ADD COLUMN owner_user_id VARCHAR(36) DEFAULT NULL COMMENT '创建者用户ID(NULL=标准共享数据)' AFTER alias`);
    await p.query(`ALTER TABLE departments ADD INDEX idx_owner (owner_user_id)`);
    console.log('已补充 departments 表的 owner_user_id 列');
  }
  // 将 departments.name 的唯一索引改为普通索引，支持不同用户/家庭添加同名私有科室
  const [deptNameUnique] = await p.query(`SHOW INDEX FROM departments WHERE Key_name = 'idx_name' AND Non_unique = 0`);
  if (deptNameUnique.length > 0) {
    await p.query(`ALTER TABLE departments DROP INDEX idx_name, ADD INDEX idx_name (name)`);
    console.log('已将 departments.idx_name 从唯一索引改为普通索引');
  }

  // 检查records表是否缺少record_no列（记录编号）
  const [recordNoCols] = await p.query(`SHOW COLUMNS FROM records LIKE 'record_no'`);
  if (recordNoCols.length === 0) {
    await p.query(`ALTER TABLE records ADD COLUMN record_no VARCHAR(20) DEFAULT NULL COMMENT '记录编号（BL/CF/JC+日期+字母序号）' AFTER type`);
    console.log('已补充 records 表的 record_no 列');
  }
  // 检查records表是否缺少findings和conclusion列
  const [cols] = await p.query(`SHOW COLUMNS FROM records LIKE 'findings'`);
  if (cols.length === 0) {
    await p.query(`ALTER TABLE records ADD COLUMN findings TEXT COMMENT '检查所见（报告类型）' AFTER chief_complaint`);
    await p.query(`ALTER TABLE records ADD COLUMN conclusion TEXT COMMENT '报告结论（报告类型）' AFTER findings`);
    console.log('已补充 records 表的 findings/conclusion 列');
  }
  // 检查records表是否缺少doctor列
  const [doctorCols] = await p.query(`SHOW COLUMNS FROM records LIKE 'doctor'`);
  if (doctorCols.length === 0) {
    await p.query(`ALTER TABLE records ADD COLUMN doctor VARCHAR(50) COMMENT '主治医生' AFTER orders`);
    console.log('已补充 records 表的 doctor 列');
  }
  // 检查records表是否缺少related_record_id列（关联病历）
  const [relatedCols] = await p.query(`SHOW COLUMNS FROM records LIKE 'related_record_id'`);
  if (relatedCols.length === 0) {
    await p.query(`ALTER TABLE records ADD COLUMN related_record_id VARCHAR(36) DEFAULT NULL COMMENT '关联病历ID' AFTER notes`);
    console.log('已补充 records 表的 related_record_id 列');
  }
  // 检查records表是否缺少ocr_text列（OCR识别原文）
  const [ocrTextCols] = await p.query(`SHOW COLUMNS FROM records LIKE 'ocr_text'`);
  if (ocrTextCols.length === 0) {
    await p.query(`ALTER TABLE records ADD COLUMN ocr_text LONGTEXT COMMENT 'OCR识别原文（扫描保存时留存）' AFTER notes`);
    console.log('已补充 records 表的 ocr_text 列');
  }
  // 检查medications表是否缺少specification/quantity列
  const [medSpecCols] = await p.query(`SHOW COLUMNS FROM medications LIKE 'specification'`);
  if (medSpecCols.length === 0) {
    await p.query(`ALTER TABLE medications ADD COLUMN specification VARCHAR(100) COMMENT '规格' AFTER name`);
    await p.query(`ALTER TABLE medications ADD COLUMN quantity INT DEFAULT 1 COMMENT '数量' AFTER dose`);
    console.log('已补充 medications 表的 specification/quantity 列');
  }
  // 检查medications表是否缺少dose_amount/dose_unit列
  const [medDoseCols] = await p.query(`SHOW COLUMNS FROM medications LIKE 'dose_amount'`);
  if (medDoseCols.length === 0) {
    await p.query(`ALTER TABLE medications ADD COLUMN dose_amount DECIMAL(10,3) DEFAULT NULL COMMENT '每次剂量数值' AFTER dose`);
    await p.query(`ALTER TABLE medications ADD COLUMN dose_unit VARCHAR(20) DEFAULT NULL COMMENT '每次剂量单位' AFTER dose_amount`);
    console.log('已补充 medications 表的 dose_amount/dose_unit 列');
  }
  // 检查medications表是否缺少quantity_unit列（数量单位：盒/瓶/袋等）
  const [medQtyUnitCols] = await p.query(`SHOW COLUMNS FROM medications LIKE 'quantity_unit'`);
  if (medQtyUnitCols.length === 0) {
    await p.query(`ALTER TABLE medications ADD COLUMN quantity_unit VARCHAR(10) DEFAULT NULL COMMENT '数量单位（盒/瓶/袋等）' AFTER quantity`);
    console.log('已补充 medications 表的 quantity_unit 列');
  }
  // 检查medications表的frequency列是否为VARCHAR，需改为INT
  const [freqCols] = await p.query(`SHOW COLUMNS FROM medications LIKE 'frequency'`);
  if (freqCols.length > 0 && freqCols[0].Type === 'varchar(50)') {
    // 先把中文频次转为数字
    await p.query(`UPDATE medications SET frequency = CASE
      WHEN frequency LIKE '%1次%' THEN '1'
      WHEN frequency LIKE '%2次%' THEN '2'
      WHEN frequency LIKE '%3次%' THEN '3'
      WHEN frequency LIKE '%4次%' THEN '4'
      WHEN frequency LIKE '%每晚%' THEN '1'
      WHEN frequency IS NOT NULL AND frequency != '' THEN '1'
      ELSE NULL END`);
    await p.query(`ALTER TABLE medications MODIFY COLUMN frequency INT DEFAULT NULL COMMENT '每日次数'`);
    console.log('已修改 medications 表的 frequency 列为 INT');
  }
  // 检查drug_inventory表是否缺少source_medication_id列
  const [diSrcCols] = await p.query(`SHOW COLUMNS FROM drug_inventory LIKE 'source_medication_id'`);
  if (diSrcCols.length === 0) {
    await p.query(`ALTER TABLE drug_inventory ADD COLUMN source_medication_id VARCHAR(36) COMMENT '来源用药ID' AFTER source_prescription_id`);
    console.log('已补充 drug_inventory 表的 source_medication_id 列');
  }
  // 检查drug_inventory表是否缺少quantity_unit列（数量单位：盒/瓶/袋等）
  const [diQtyUnitCols] = await p.query(`SHOW COLUMNS FROM drug_inventory LIKE 'quantity_unit'`);
  if (diQtyUnitCols.length === 0) {
    await p.query(`ALTER TABLE drug_inventory ADD COLUMN quantity_unit VARCHAR(10) DEFAULT NULL COMMENT '数量单位（盒/瓶/袋等）' AFTER quantity`);
    console.log('已补充 drug_inventory 表的 quantity_unit 列');
  }
  // 检查elders表是否缺少relation列
  const [relCols] = await p.query(`SHOW COLUMNS FROM elders LIKE 'relation'`);
  if (relCols.length === 0) {
    await p.query(`ALTER TABLE elders ADD COLUMN relation ENUM('self', 'parent', 'spouse_parent', 'spouse', 'other') DEFAULT 'other' COMMENT '与操作者的关系' AFTER avatar`);
    console.log('已补充 elders 表的 relation 列');
  }
  // 检查elders表是否缺少birth_date列
  const [bdCols] = await p.query(`SHOW COLUMNS FROM elders LIKE 'birth_date'`);
  if (bdCols.length === 0) {
    await p.query(`ALTER TABLE elders ADD COLUMN birth_date DATE DEFAULT NULL COMMENT '出生日期（替代age字段）' AFTER age`);
    console.log('已补充 elders 表的 birth_date 列');
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

  // 检查并创建 drugs 药品库表（如不存在）
  const [drugTableExists] = await p.query(`SHOW TABLES LIKE 'drugs'`);
  if (drugTableExists.length === 0) {
    await p.query(`
      CREATE TABLE drugs (
        code VARCHAR(50) NOT NULL COMMENT '药品编码(主键)',
        approval_number VARCHAR(100) DEFAULT NULL COMMENT '批准文号/注册证号',
        name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '产品名称',
        pinyin_abbr VARCHAR(50) DEFAULT '' COMMENT '产品名称拼音首字母缩写',
        generic_name VARCHAR(255) DEFAULT NULL COMMENT '通用名',
        category VARCHAR(100) DEFAULT NULL COMMENT '药品分类',
        dosage_form VARCHAR(100) DEFAULT NULL COMMENT '剂型',
        specification VARCHAR(500) DEFAULT NULL COMMENT '规格',
        spec_dosage DECIMAL(10,3) DEFAULT NULL COMMENT '规格数值',
        spec_dosage_unit ENUM('g','mg','ml','μg') DEFAULT NULL COMMENT '规格单位',
        unit_capacity INT DEFAULT NULL COMMENT '单位容量数值',
        unit_capacity_unit ENUM('片','粒','袋','支','瓶','贴') DEFAULT NULL COMMENT '包装单位',
        manufacturer VARCHAR(255) DEFAULT NULL COMMENT '生产单位',
        indication TEXT DEFAULT NULL COMMENT '适应症',
        contraindication TEXT DEFAULT NULL COMMENT '禁忌症',
        dosage_instruction TEXT DEFAULT NULL COMMENT '用法用量',
        adverse_reaction TEXT DEFAULT NULL COMMENT '不良反应',
        drug_interaction TEXT DEFAULT NULL COMMENT '药物相互作用',
        precaution TEXT DEFAULT NULL COMMENT '注意事项',
        storage TEXT DEFAULT NULL COMMENT '贮藏',
        type1 VARCHAR(100) DEFAULT NULL COMMENT '药品类别（如感冒、消炎）',
        syz TEXT DEFAULT NULL COMMENT '适应症',
        jx VARCHAR(100) DEFAULT NULL COMMENT '剂型',
        wyy TINYINT(1) DEFAULT 0 COMMENT '是否外用：0=否，1=是',
        fl VARCHAR(50) DEFAULT NULL COMMENT '中西药：中药/西药',
        description LONGTEXT DEFAULT NULL COMMENT '药品说明',
        description_fetched_at DATETIME DEFAULT NULL COMMENT '说明书获取时间',
        PRIMARY KEY (code),
        INDEX idx_pinyin (pinyin_abbr),
        INDEX idx_name (name),
        INDEX idx_approval (approval_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='药品目录表'
    `);
    console.log('已创建 drugs 药品库表');
  }

  // 为 drugs 表补充 spec_dosage / spec_dosage_unit / unit_capacity / unit_capacity_unit 列
  const drugColChecks = [
    { col: 'spec_dosage', ddl: `ALTER TABLE drugs ADD COLUMN spec_dosage DECIMAL(10,3) DEFAULT NULL COMMENT '规格数值（每片/袋含量，如0.25）' AFTER specification` },
    { col: 'spec_dosage_unit', ddl: `ALTER TABLE drugs ADD COLUMN spec_dosage_unit ENUM('g','mg','ml','μg') DEFAULT NULL COMMENT '规格单位' AFTER spec_dosage` },
    { col: 'unit_capacity', ddl: `ALTER TABLE drugs ADD COLUMN unit_capacity INT DEFAULT NULL COMMENT '单位容量数值（每包装含量，如20）' AFTER spec_dosage_unit` },
    { col: 'unit_capacity_unit', ddl: `ALTER TABLE drugs ADD COLUMN unit_capacity_unit ENUM('片','粒','袋','支','瓶','贴') DEFAULT NULL COMMENT '包装单位' AFTER unit_capacity` },
    { col: 'generic_name', ddl: `ALTER TABLE drugs ADD COLUMN generic_name VARCHAR(255) DEFAULT NULL COMMENT '通用名' AFTER pinyin_abbr` },
    { col: 'category', ddl: `ALTER TABLE drugs ADD COLUMN category VARCHAR(100) DEFAULT NULL COMMENT '药品分类' AFTER generic_name` },
    { col: 'indication', ddl: `ALTER TABLE drugs ADD COLUMN indication TEXT DEFAULT NULL COMMENT '适应症' AFTER manufacturer` },
    { col: 'contraindication', ddl: `ALTER TABLE drugs ADD COLUMN contraindication TEXT DEFAULT NULL COMMENT '禁忌症' AFTER indication` },
    { col: 'dosage_instruction', ddl: `ALTER TABLE drugs ADD COLUMN dosage_instruction TEXT DEFAULT NULL COMMENT '用法用量' AFTER contraindication` },
    { col: 'adverse_reaction', ddl: `ALTER TABLE drugs ADD COLUMN adverse_reaction TEXT DEFAULT NULL COMMENT '不良反应' AFTER dosage_instruction` },
    { col: 'drug_interaction', ddl: `ALTER TABLE drugs ADD COLUMN drug_interaction TEXT DEFAULT NULL COMMENT '药物相互作用' AFTER adverse_reaction` },
    { col: 'precaution', ddl: `ALTER TABLE drugs ADD COLUMN precaution TEXT DEFAULT NULL COMMENT '注意事项' AFTER drug_interaction` },
    { col: 'storage', ddl: `ALTER TABLE drugs ADD COLUMN storage TEXT DEFAULT NULL COMMENT '贮藏' AFTER precaution` },
  ];
  for (const { col, ddl } of drugColChecks) {
    const [rows] = await p.query(`SHOW COLUMNS FROM drugs LIKE '${col}'`);
    if (rows.length === 0) {
      await p.query(ddl);
      console.log(`已补充 drugs 表的 ${col} 列`);
    } else {
      // 已存在但类型可能为旧 VARCHAR，统一改为 ENUM
      const alterDDLs = {
        spec_dosage_unit: `ALTER TABLE drugs MODIFY COLUMN spec_dosage_unit ENUM('g','mg','ml','μg') DEFAULT NULL COMMENT '规格单位'`,
        unit_capacity_unit: `ALTER TABLE drugs MODIFY COLUMN unit_capacity_unit ENUM('片','粒','袋','支','瓶','贴') DEFAULT NULL COMMENT '包装单位'`,
      };
      if (alterDDLs[col]) {
        const [colInfo] = await p.query(`SHOW COLUMNS FROM drugs LIKE '${col}'`);
        const curType = (colInfo[0]?.Type || '').toLowerCase();
        if (curType.includes('varchar')) {
          // 先清空不在 ENUM 范围内的旧值（设为 NULL）
          const enumVals = {
            spec_dosage_unit: ['g', 'mg', 'ml', 'μg'],
            unit_capacity_unit: ['片', '粒', '袋', '支', '瓶', '贴'],
          };
          if (enumVals[col]) {
            const placeholders = enumVals[col].map(() => '?').join(',');
            await p.query(`UPDATE drugs SET ${col} = NULL WHERE ${col} IS NOT NULL AND ${col} != '' AND ${col} NOT IN (${placeholders})`, enumVals[col]);
            await p.query(`UPDATE drugs SET ${col} = NULL WHERE ${col} = ''`);
          }
          await p.query(alterDDLs[col]);
          console.log(`已将 drugs 表的 ${col} 列从 VARCHAR 迁移为 ENUM`);
        }
      }
    }
  }

  // 为 drugs 表补充 owner_user_id 列（用户私有数据隔离：NULL=标准共享数据，非NULL=创建者私有）
  const [drugOwnerCols] = await p.query(`SHOW COLUMNS FROM drugs LIKE 'owner_user_id'`);
  if (drugOwnerCols.length === 0) {
    await p.query(`ALTER TABLE drugs ADD COLUMN owner_user_id VARCHAR(36) DEFAULT NULL COMMENT '创建者用户ID(NULL=标准共享数据)' AFTER storage`);
    await p.query(`ALTER TABLE drugs ADD INDEX idx_owner (owner_user_id)`);
    console.log('已补充 drugs 表的 owner_user_id 列');
  }

  // 为 drugs 表补充 type1/syz/jx/wyy/fl/description/description_fetched_at 列（ShowAPI 药品说明书字段）
  const drugInfoColChecks = [
    { col: 'type1', ddl: `ALTER TABLE drugs ADD COLUMN type1 VARCHAR(100) DEFAULT NULL COMMENT '药品类别（如感冒、消炎）' AFTER storage` },
    { col: 'syz', ddl: `ALTER TABLE drugs ADD COLUMN syz TEXT DEFAULT NULL COMMENT '适应症' AFTER type1` },
    { col: 'jx', ddl: `ALTER TABLE drugs ADD COLUMN jx VARCHAR(100) DEFAULT NULL COMMENT '剂型' AFTER syz` },
    { col: 'wyy', ddl: `ALTER TABLE drugs ADD COLUMN wyy TINYINT(1) DEFAULT 0 COMMENT '是否外用：0=否，1=是' AFTER jx` },
    { col: 'fl', ddl: `ALTER TABLE drugs ADD COLUMN fl VARCHAR(50) DEFAULT NULL COMMENT '中西药：中药/西药' AFTER wyy` },
    { col: 'description', ddl: `ALTER TABLE drugs ADD COLUMN description LONGTEXT DEFAULT NULL COMMENT '药品说明' AFTER fl` },
    { col: 'description_fetched_at', ddl: `ALTER TABLE drugs ADD COLUMN description_fetched_at DATETIME DEFAULT NULL COMMENT '说明书获取时间' AFTER description` },
  ];
  for (const { col, ddl } of drugInfoColChecks) {
    const [rows] = await p.query(`SHOW COLUMNS FROM drugs LIKE '${col}'`);
    if (rows.length === 0) {
      await p.query(ddl);
      console.log(`已补充 drugs 表的 ${col} 列`);
    }
  }

  // 为 medications 表补充 drug_code 列（关联药品库）
  const [medDrugCodeCols] = await p.query(`SHOW COLUMNS FROM medications LIKE 'drug_code'`);
  if (medDrugCodeCols.length === 0) {
    await p.query(`ALTER TABLE medications ADD COLUMN drug_code VARCHAR(50) COMMENT '关联药品库 drugs.code' AFTER family_id`);
    await p.query(`ALTER TABLE medications ADD INDEX idx_drug_code (drug_code)`);
    console.log('已补充 medications 表的 drug_code 列');
  }

  // 为 drug_inventory 表补充 drug_code 列（关联药品库）
  const [invDrugCodeCols] = await p.query(`SHOW COLUMNS FROM drug_inventory LIKE 'drug_code'`);
  if (invDrugCodeCols.length === 0) {
    await p.query(`ALTER TABLE drug_inventory ADD COLUMN drug_code VARCHAR(50) COMMENT '关联药品库 drugs.code' AFTER elder_id`);
    await p.query(`ALTER TABLE drug_inventory ADD INDEX idx_drug_code (drug_code)`);
    console.log('已补充 drug_inventory 表的 drug_code 列');
  }
  // 为 drug_inventory 表补充 specification / manufacturer 列（旧表可能缺失）
  const [invSpecCols] = await p.query(`SHOW COLUMNS FROM drug_inventory LIKE 'specification'`);
  if (invSpecCols.length === 0) {
    await p.query(`ALTER TABLE drug_inventory ADD COLUMN specification VARCHAR(100) AFTER name`);
    console.log('已补充 drug_inventory 表的 specification 列');
  }
  const [invManuCols] = await p.query(`SHOW COLUMNS FROM drug_inventory LIKE 'manufacturer'`);
  if (invManuCols.length === 0) {
    await p.query(`ALTER TABLE drug_inventory ADD COLUMN manufacturer VARCHAR(100) AFTER specification`);
    console.log('已补充 drug_inventory 表的 manufacturer 列');
  }
  // 清理：drug_inventory 表的 unit_capacity 列已迁移到 drugs 表
  const [invCapCols] = await p.query(`SHOW COLUMNS FROM drug_inventory LIKE 'unit_capacity'`);
  if (invCapCols.length > 0) {
    await p.query(`ALTER TABLE drug_inventory DROP COLUMN unit_capacity`);
    console.log('已移除 drug_inventory 表的 unit_capacity 列（已迁移至 drugs 表）');
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
