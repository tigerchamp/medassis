/**
 * 修正 hospitals 表中名称的中文数字转换错误
 * 用法: node src/scripts/fix_hospital_names.js
 */
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

const CN_DIGITS = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
};

function normalizeName(name) {
  if (!name) return name;

  let result = name.replace(/Ｏ/g, 'O').replace(/０/g, '0').replace(/○/g, 'O');

  result = result.replace(/([一二三四五六七八九])[O0]+(?=[一二三四五六七八九])/g,
    (m, before) => before + m.slice(1).replace(/[O0]/g, '零'));
  result = result.replace(/([一二三四五六七八九])[O0]+/g,
    (m, before) => before + m.slice(1).replace(/[O0]/g, '零'));
  result = result.replace(/[O0]+([一二三四五六七八九])/g,
    (m, after) => m.slice(0, -1).replace(/[O0]/g, '零') + after);

  result = result.replace(/O/g, '0');

  result = result.replace(/(\d)(零+)(?=\d)/g,
    (m, before, zeros) => before + zeros.replace(/零/g, '0'));

  result = result.replace(/[零一二三四五六七八九]{3,}/g, (match) => {
    const digits = [];
    for (const ch of match) {
      if (CN_DIGITS[ch] !== undefined) digits.push(CN_DIGITS[ch]);
    }
    if (digits.every(d => d === 0)) return match;
    const numStr = digits.join('').replace(/^0+/, '');
    if (!numStr) return match;
    return numStr;
  });

  return result;
}

function getPinyinAbbr(name) {
  if (!name || typeof name !== 'string') return '';
  const py = pinyin(name, { pattern: 'first', toneType: 'none' });
  return py.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

async function main() {
  const pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 5 });

  try {
    const [rows] = await pool.query('SELECT id, name, pinyin_abbr FROM hospitals');
    console.log(`共 ${rows.length} 条记录需要检查`);

    let fixed = 0;
    let skipped = 0;
    let conflicts = 0;

    for (const row of rows) {
      const newName = normalizeName(row.name);

      if (newName === row.name) {
        // 名称没变，但拼音可能需要更新
        const newPy = getPinyinAbbr(newName);
        if (newPy !== (row.pinyin_abbr || '')) {
          await pool.query('UPDATE hospitals SET pinyin_abbr = ? WHERE id = ?', [newPy, row.id]);
        }
        continue;
      }

      console.log(`  修正: "${row.name}" → "${newName}"`);

      // 检查新名称是否已存在（唯一约束）
      const [existing] = await pool.query('SELECT id FROM hospitals WHERE name = ? AND id != ?', [newName, row.id]);
      if (existing.length > 0) {
        console.log(`    冲突! "${newName}" 已存在(id=${existing[0].id})，删除旧记录`);
        await pool.query('DELETE FROM hospitals WHERE id = ?', [row.id]);
        conflicts++;
        continue;
      }

      const newPy = getPinyinAbbr(newName);
      await pool.query('UPDATE hospitals SET name = ?, pinyin_abbr = ? WHERE id = ?', [newName, newPy, row.id]);
      fixed++;
    }

    console.log(`修正完成: 修正 ${fixed} 条, 冲突删除 ${conflicts} 条, 未变 ${rows.length - fixed - conflicts} 条`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('修正失败:', err);
  process.exit(1);
});
