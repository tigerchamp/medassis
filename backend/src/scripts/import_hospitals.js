/**
 * 导入全国医院信息到数据库
 * 用法: node src/scripts/import_hospitals.js
 */
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'family_health',
};

// 中文数字映射
const CN_DIGITS = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
};

/**
 * 名称处理：
 * 1. 0和O统一转换为中文"零"
 * 2. 连续的中文数字（大于两位）转换为阿拉伯数字
 *    例：三O九 → 三零九 → 309
 *    注意：第二、第三这种不转换（连续中文数字后紧跟中文字符的跳过）
 */
function normalizeName(name) {
  if (!name) return name;

  // 1. 0和O统一转换为中文"零"
  let result = name.replace(/[0O]/g, '零');

  // 2. 将连续的中文数字（大于2位，即3位及以上）转换为阿拉伯数字
  result = result.replace(/[零一二三四五六七八九]{3,}/g, (match) => {
    // 检查匹配位置后面是否紧跟中文字符（如"第二、第三"这种情况）
    // 这种情况不转换
    // 但我们无法在这里获取位置上下文，改用整体策略

    // 如果序列全是由"零"组成，保持原样（如"零零"不太可能但安全起见）
    const digits = [];
    for (const ch of match) {
      if (CN_DIGITS[ch] !== undefined) {
        digits.push(CN_DIGITS[ch]);
      }
    }

    // 如果全部是零，可能是"零零"这类，不转换
    if (digits.every(d => d === 0)) return match;

    // 转为数字字符串，去掉前导零
    const numStr = digits.join('').replace(/^0+/, '');
    if (!numStr) return match; // 全零情况

    return numStr;
  });

  return result;
}

async function main() {
  const filePath = path.resolve(__dirname, '../../../全国医院信息.xlsx');
  console.log('读取文件:', filePath);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws);

  console.log(`共读取 ${data.length} 条医院记录`);

  const pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 5 });

  try {
    // 创建表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        address VARCHAR(500) DEFAULT NULL,
        postcode VARCHAR(10) DEFAULT NULL,
        phone VARCHAR(200) DEFAULT NULL,
        UNIQUE INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('表 hospitals 已就绪');

    let inserted = 0;
    let skipped = 0;
    let batch = [];

    for (const row of data) {
      const rawName = row['医院名称'] || '';
      const name = normalizeName(rawName.trim());
      if (!name) continue;

      const address = (row['地址'] || '').trim() || null;
      const postcode = (row['邮编'] || '').trim() || null;
      const phone = (row['联系电话'] || '').trim() || null;

      batch.push([uuidv4(), name, address, postcode, phone]);

      if (batch.length >= 500) {
        const count = await insertBatch(pool, batch);
        inserted += count;
        skipped += batch.length - count;
        batch = [];
      }
    }

    // 处理剩余
    if (batch.length > 0) {
      const count = await insertBatch(pool, batch);
      inserted += count;
      skipped += batch.length - count;
    }

    console.log(`导入完成: 成功 ${inserted} 条, 跳过(重名) ${skipped} 条`);
  } finally {
    await pool.end();
  }
}

async function insertBatch(pool, batch) {
  try {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = batch.flat();
    await pool.query(
      `INSERT IGNORE INTO hospitals (id, name, address, postcode, phone) VALUES ${placeholders}`,
      values
    );
    return batch.length;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      // 逐条插入以跳过重名
      let count = 0;
      for (const row of batch) {
        try {
          await pool.query(
            'INSERT IGNORE INTO hospitals (id, name, address, postcode, phone) VALUES (?, ?, ?, ?, ?)',
            row
          );
          count++;
        } catch (e) {
          // skip
        }
      }
      return count;
    }
    throw err;
  }
}

main().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
