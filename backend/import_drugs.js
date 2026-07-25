/**
 * 药品 Excel 导入 MySQL 脚本
 *
 * 将"国家药品目录"下的国产药品和进口药品两个 Excel 表导入 MySQL。
 *
 * 表结构字段（英文）：code(主键), approval_number, name, pinyin_abbr, dosage_form, specification, manufacturer
 *
 * 处理要求：
 * 1. 连接数据库，表不存在则创建
 * 2. 插入前判断药品编码是否存在，存在则跳过
 * 3. 以药品编码(code)为主键
 * 4. 产品名称拼音缩写为首字缩写（如 三黄片 -> SHP）
 * 5. 生产单位优先使用"上市许可持有人"（进口表为"上市许可持有人中文"），
 *    为空或无意义字符(如"---")时使用"生产单位"（进口表为"上市许可持有人英文"）
 * 6. 药品编码含多个编码(分号分隔)时按编码拆分多行，规格按"药品编码备注"解析
 *
 * 用法:
 *   node import_drugs.js            # 增量导入（已存在的编码会跳过）
 *   node import_drugs.js --rebuild  # 先删除旧表再重建并全量导入
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const path = require('path');
const { pinyin } = require('pinyin-pro');

// ==================== 配置 ====================

const DB_NAME = process.env.DB_NAME || 'family_health';
const TABLE_NAME = 'drugs';

const EXCEL_DIR = path.join(__dirname, '..', '国家药品目录', '国家药品编码本位码（截至2026年3月31日）');
const DOMESTIC_FILE = path.join(EXCEL_DIR, '国家药品编码本位码信息（国产药品）.xlsx');
const IMPORTED_FILE = path.join(EXCEL_DIR, '国家药品编码本位码信息（进口药品）.xlsx');

const BATCH_SIZE = 1000; // 批量插入大小

const REBUILD = process.argv.includes('--rebuild');

// ==================== 工具函数 ====================

/**
 * 获取产品名称的拼音首字母缩写（如 三黄片 -> SHP）
 */
function getPinyinAbbr(name) {
  if (!name || typeof name !== 'string') return '';
  // pattern: 'first' 取每个汉字拼音首字母, toneType: 'none' 去声调
  const py = pinyin(name, { pattern: 'first', toneType: 'none' });
  // 去除空格，仅保留字母并大写
  return py.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

/**
 * 判断字段是否为空或无意义字符（如 "---", "--", "-", "－" 等）
 */
function isMeaningless(value) {
  if (value == null) return true;
  const s = String(value).trim();
  if (s === '') return true;
  // 仅由 - － _ . 空格 等组成的视为无意义
  if (/^[\-－_·.\s]+$/.test(s)) return true;
  return false;
}

/**
 * 将可能的数字/日期单元格统一转为字符串
 */
function toStr(val) {
  if (val == null) return '';
  return String(val).trim();
}

/**
 * 按中英文分号拆分字符串，去除空白项
 */
function splitBySemicolon(str) {
  if (!str) return [];
  return String(str)
    .split(/[；;]/)
    .map(s => s.trim())
    .filter(s => s !== '');
}

/**
 * 根据药品编码从"药品编码备注"中解析对应的规格
 * 备注格式: code[spec]；code[spec]
 * 返回解析到的规格字符串；若未匹配则返回 null
 */
function parseSpecFromRemark(code, remark) {
  if (!code || !remark) return null;
  const codeStr = String(code).trim();
  const remarkStr = String(remark);
  // 匹配 code[内容]，中英文括号均支持
  // 使用转义的 code 作为正则片段
  const escaped = codeStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped + '\\s*[\\[【]\\s*([^\\]】]*)[\\]】]');
  const m = remarkStr.match(pattern);
  if (m) {
    const spec = m[1].trim();
    return spec;
  }
  return null;
}

// ==================== 数据库 ====================

async function getConnection() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
    charset: 'utf8mb4'
  });
  return conn;
}

async function ensureTable(conn) {
  if (REBUILD) {
    await conn.query(`DROP TABLE IF EXISTS \`${TABLE_NAME}\``);
    console.log(`✓ 已删除旧表 ${TABLE_NAME}`);
  }
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`${TABLE_NAME}\` (
      \`code\` VARCHAR(50) NOT NULL COMMENT '药品编码(主键)',
      \`approval_number\` VARCHAR(100) DEFAULT NULL COMMENT '批准文号/注册证号',
      \`name\` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '产品名称',
      \`pinyin_abbr\` VARCHAR(50) DEFAULT '' COMMENT '产品名称拼音首字母缩写',
      \`dosage_form\` VARCHAR(100) DEFAULT NULL COMMENT '剂型',
      \`specification\` VARCHAR(500) DEFAULT NULL COMMENT '规格',
      \`manufacturer\` VARCHAR(255) DEFAULT NULL COMMENT '生产单位',
      PRIMARY KEY (\`code\`),
      INDEX \`idx_pinyin\` (\`pinyin_abbr\`),
      INDEX \`idx_name\` (\`name\`),
      INDEX \`idx_approval\` (\`approval_number\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='药品目录表'
  `);
  console.log(`✓ 表 ${TABLE_NAME} 已就绪`);
}

/**
 * 加载已有药品编码到 Set，用于快速判断是否存在
 */
async function loadExistingCodes(conn) {
  const [rows] = await conn.query(`SELECT \`code\` FROM \`${TABLE_NAME}\``);
  const set = new Set();
  for (const r of rows) set.add(String(r.code).trim());
  console.log(`✓ 已有药品编码 ${set.size} 条`);
  return set;
}

// ==================== Excel 处理 ====================

/**
 * 读取 Excel 文件，跳过标题行，返回表头映射后的数据行数组
 * @param {string} filePath
 * @param {'domestic'|'imported'} type
 */
function readExcel(filePath, type) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 返回数组的数组, defval 保证空单元格为 ''
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // 第1行为大标题，第2行为表头，数据从第3行开始
  const dataRows = rows.slice(2);

  if (type === 'domestic') {
    // [0]序号 [1]批准文号 [2]产品名称 [3]剂型 [4]规格 [5]上市许可持有人 [6]生产单位 [7]药品编码 [8]药品编码备注
    return dataRows.map(r => ({
      approval_number: toStr(r[1]),
      name: toStr(r[2]),
      dosage_form: toStr(r[3]),
      specification: toStr(r[4]),
      holder: toStr(r[5]),
      manufacturer_raw: toStr(r[6]),
      code: toStr(r[7]),
      code_remark: toStr(r[8])
    }));
  } else {
    // [0]序号 [1]注册证号 [2]产品名称 [3]上市许可持有人中文 [4]上市许可持有人英文 [5]公司名称中文 [6]公司名称英文 [7]剂型 [8]规格 [9]药品编码 [10]药品编码备注
    return dataRows.map(r => ({
      approval_number: toStr(r[1]),
      name: toStr(r[2]),
      holder_zh: toStr(r[3]),
      holder_en: toStr(r[4]),
      dosage_form: toStr(r[7]),
      specification: toStr(r[8]),
      code: toStr(r[9]),
      code_remark: toStr(r[10])
    }));
  }
}

/**
 * 将一行 Excel 数据按药品编码拆分为多条待插入记录
 * @returns {Array<{code, approval_number, name, pinyin_abbr, dosage_form, specification, manufacturer}>}
 */
function expandRow(row, type) {
  const codes = splitBySemicolon(row.code);
  if (codes.length === 0) return [];

  // 确定生产单位（要求5）
  let manufacturer = '';
  if (type === 'domestic') {
    manufacturer = isMeaningless(row.holder) ? row.manufacturer_raw : row.holder;
    if (isMeaningless(manufacturer)) manufacturer = row.manufacturer_raw;
  } else {
    manufacturer = isMeaningless(row.holder_zh) ? row.holder_en : row.holder_zh;
    if (isMeaningless(manufacturer)) manufacturer = row.holder_en;
  }

  const approval_number = row.approval_number;
  const name = row.name;
  const pinyin_abbr = getPinyinAbbr(name);
  const dosage_form = row.dosage_form;
  const original_spec = row.specification;
  const remark = row.code_remark;

  const records = [];
  for (const code of codes) {
    // 规格按药品编码备注解析（要求6）
    let specification = parseSpecFromRemark(code, remark);
    if (specification === null) {
      // 备注未匹配到，使用原始规格字段
      specification = original_spec;
    }
    records.push({
      code: code,
      approval_number: approval_number,
      name: name,
      pinyin_abbr: pinyin_abbr,
      dosage_form: dosage_form,
      specification: specification,
      manufacturer: manufacturer
    });
  }
  return records;
}

// ==================== 主流程 ====================

async function main() {
  console.log('=== 药品 Excel 导入 MySQL ===');
  console.log(REBUILD ? '模式: 重建表并全量导入\n' : '模式: 增量导入\n');

  // 校验文件存在
  const fs = require('fs');
  for (const f of [DOMESTIC_FILE, IMPORTED_FILE]) {
    if (!fs.existsSync(f)) {
      throw new Error('Excel 文件不存在: ' + f);
    }
  }

  // 连接数据库
  const conn = await getConnection();
  console.log('✓ 数据库连接成功');

  try {
    await ensureTable(conn);
    const existingCodes = await loadExistingCodes(conn);

    const stats = {
      total_rows: 0,
      generated_records: 0,
      skipped_existing: 0,
      inserted: 0,
      failed: 0
    };

    let batch = [];

    async function flushBatch() {
      if (batch.length === 0) return;
      const values = batch.map(r => [
        r.code, r.approval_number, r.name, r.pinyin_abbr,
        r.dosage_form, r.specification, r.manufacturer
      ]);
      try {
        const [res] = await conn.query(
          `INSERT INTO \`${TABLE_NAME}\`
           (\`code\`, \`approval_number\`, \`name\`, \`pinyin_abbr\`, \`dosage_form\`, \`specification\`, \`manufacturer\`)
           VALUES ?`,
          [values]
        );
        stats.inserted += res.affectedRows;
      } catch (e) {
        // 批量插入失败时逐条重试，定位问题记录
        console.error('批量插入失败，改为逐条插入:', e.message);
        for (const v of values) {
          try {
            const [r2] = await conn.query(
              `INSERT INTO \`${TABLE_NAME}\`
               (\`code\`, \`approval_number\`, \`name\`, \`pinyin_abbr\`, \`dosage_form\`, \`specification\`, \`manufacturer\`)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              v
            );
            stats.inserted += r2.affectedRows;
          } catch (e2) {
            stats.failed++;
            if (stats.failed <= 10) {
              console.error('  插入失败:', v[0], e2.message);
            }
          }
        }
      }
      batch = [];
    }

    // 处理两个文件
    const tasks = [
      { file: DOMESTIC_FILE, type: 'domestic', label: '国产药品' },
      { file: IMPORTED_FILE, type: 'imported', label: '进口药品' }
    ];

    for (const task of tasks) {
      console.log(`\n--- 正在读取 ${task.label}: ${path.basename(task.file)} ---`);
      const rows = readExcel(task.file, task.type);
      console.log(`  读取 ${rows.length} 行`);

      let processed = 0;
      for (const row of rows) {
        stats.total_rows++;
        const records = expandRow(row, task.type);
        for (const rec of records) {
          stats.generated_records++;
          if (existingCodes.has(rec.code)) {
            stats.skipped_existing++;
            continue;
          }
          existingCodes.add(rec.code);
          batch.push(rec);
          if (batch.length >= BATCH_SIZE) {
            await flushBatch();
          }
        }
        processed++;
        if (processed % 10000 === 0) {
          console.log(`  已处理 ${processed}/${rows.length} 行`);
        }
      }
      console.log(`  ${task.label} 处理完成`);
    }

    // 插入剩余
    await flushBatch();

    console.log('\n=== 导入完成 ===');
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
