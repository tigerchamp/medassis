/**
 * 导入全国医院信息到数据库
 * 用法: node src/scripts/import_hospitals.js
 */
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { pinyin } = require('pinyin-pro');
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
 * 1. 全角Ｏ/０ → 半角
 * 2. 仅在中文数字上下文中将 O/0 转为"零"（如 二O三 → 二零三）
 *    阿拉伯数字序列中的 0/O 保持不变（如 5701 不变，664OO → 66400）
 * 3. 剩余 O → 0
 * 4. 零在阿拉伯数字之间时回转为 0（修正旧数据：57零1 → 5701）
 * 5. 连续的中文数字（3位及以上）转为阿拉伯数字
 *    例：三O九 → 三零九 → 309；二零三 → 203
 *    注意：第二、第三这种不转换（仅2位中文数字）
 */
function normalizeName(name) {
  if (!name) return name;

  // 1. 全角/特殊符号转半角
  let result = name.replace(/Ｏ/g, 'O').replace(/０/g, '0').replace(/○/g, 'O');

  // 2. 在中文数字上下文中，O/0 → 零
  //    O/0 紧邻中文数字（一~九）时，属于中文数字序列，转为零
  //    先处理 O/0 在两个中文数字之间
  result = result.replace(/([一二三四五六七八九])[O0]+(?=[一二三四五六七八九])/g,
    (m, before) => before + m.slice(1).replace(/[O0]/g, '零'));
  //    O/0 紧跟在中文数字后面
  result = result.replace(/([一二三四五六七八九])[O0]+/g,
    (m, before) => before + m.slice(1).replace(/[O0]/g, '零'));
  //    O/0 紧邻中文数字前面
  result = result.replace(/[O0]+([一二三四五六七八九])/g,
    (m, after) => m.slice(0, -1).replace(/[O0]/g, '零') + after);

  // 3. 剩余 O → 0（不在中文数字上下文中的O，属于阿拉伯数字序列的一部分）
  result = result.replace(/O/g, '0');

  // 4. 零在阿拉伯数字之间时回转为0（修正旧数据中错误转换的情况）
  result = result.replace(/(\d)(零+)(?=\d)/g,
    (m, before, zeros) => before + zeros.replace(/零/g, '0'));

  // 5. 连续的中文数字（3位及以上）转为阿拉伯数字
  result = result.replace(/[零一二三四五六七八九]{3,}/g, (match) => {
    const digits = [];
    for (const ch of match) {
      if (CN_DIGITS[ch] !== undefined) {
        digits.push(CN_DIGITS[ch]);
      }
    }

    if (digits.every(d => d === 0)) return match;

    const numStr = digits.join('').replace(/^0+/, '');
    if (!numStr) return match;

    return numStr;
  });

  return result;
}

/**
 * 获取医院名称的拼音首字母缩写（如 北京医院 → BJYY）
 */
function getPinyinAbbr(name) {
  if (!name || typeof name !== 'string') return '';
  const py = pinyin(name, { pattern: 'first', toneType: 'none' });
  return py.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
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
        pinyin_abbr VARCHAR(100) DEFAULT NULL,
        address VARCHAR(500) DEFAULT NULL,
        postcode VARCHAR(10) DEFAULT NULL,
        phone VARCHAR(200) DEFAULT NULL,
        UNIQUE INDEX idx_name (name),
        INDEX idx_pinyin (pinyin_abbr)
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

      const pinyinAbbr = getPinyinAbbr(name);

      batch.push([uuidv4(), name, pinyinAbbr, address, postcode, phone]);

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
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = batch.flat();
    await pool.query(
      `INSERT IGNORE INTO hospitals (id, name, pinyin_abbr, address, postcode, phone) VALUES ${placeholders}`,
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
            'INSERT IGNORE INTO hospitals (id, name, pinyin_abbr, address, postcode, phone) VALUES (?, ?, ?, ?, ?, ?)',
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
