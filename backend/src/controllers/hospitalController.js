const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { getPinyinAbbr } = require('../utils/pinyin');

/**
 * 搜索医院库
 * GET /api/hospitals/search?q=xxx&limit=20
 *
 * 匹配规则：同时匹配 名称/简称/别名/拼音首字母
 */
async function search(req, res) {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!q || q.trim() === '') {
      return res.json({ hospitals: [] });
    }
    const kw = q.trim();

    const [rows] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias, address, postcode, phone
       FROM hospitals
       WHERE name LIKE ? OR abbreviation LIKE ? OR alias LIKE ? OR pinyin_abbr LIKE ?
       ORDER BY CASE
         WHEN name = ? THEN 0
         WHEN abbreviation = ? THEN 1
         WHEN alias = ? THEN 2
         WHEN pinyin_abbr = ? THEN 3
         WHEN name LIKE ? THEN 4
         WHEN pinyin_abbr LIKE ? THEN 5
         ELSE 6
       END, name
       LIMIT ?`,
      [`%${kw}%`, `%${kw}%`, `%${kw}%`, `${kw}%`, kw, kw, kw, kw, `${kw}%`, `${kw}%`, limit]
    );

    res.json({
      hospitals: rows.map(r => ({
        id: r.id,
        name: r.name,
        pinyinAbbr: r.pinyin_abbr,
        abbreviation: r.abbreviation || '',
        alias: r.alias || '',
        address: r.address || '',
        postcode: r.postcode || '',
        phone: r.phone || ''
      }))
    });
  } catch (err) {
    console.error('Hospital search error:', err);
    res.status(500).json({ error: '搜索医院失败' });
  }
}

/**
 * 精确查询医院是否存在（按名称/简称/别名匹配）
 * GET /api/hospitals/check?name=xxx
 * 返回：{ exists: bool, hospital: {...}|null, similar: [...] }
 */
async function check(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ exists: false, hospital: null, similar: [] });

    // 精确匹配 name/abbreviation/alias
    const [exact] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias FROM hospitals WHERE name = ? OR abbreviation = ? OR alias = ? LIMIT 1`,
      [name, name, name]
    );
    if (exact.length > 0) {
      return res.json({ exists: true, hospital: exact[0] });
    }
    // 不存在则返回相似项
    const [similar] = await getPool().query(
      `SELECT id, name, abbreviation, alias FROM hospitals WHERE name LIKE ? OR alias LIKE ? ORDER BY name LIMIT 8`,
      [`%${name}%`, `%${name}%`]
    );
    res.json({ exists: false, hospital: null, similar });
  } catch (err) {
    console.error('Hospital check error:', err);
    res.status(500).json({ error: '校验医院失败' });
  }
}

/**
 * 添加新医院
 * POST /api/hospitals/add  body: { name, abbreviation?, alias? }
 * 自动生成拼音首字母作为 pinyin_abbr
 */
async function add(req, res) {
  try {
    const { name, abbreviation, alias } = req.body;
    const trimmed = (name || '').trim();
    if (!trimmed) return res.status(400).json({ error: '医院名称不能为空' });

    // 已存在则直接返回
    const [existing] = await getPool().query('SELECT * FROM hospitals WHERE name = ? LIMIT 1', [trimmed]);
    if (existing.length > 0) {
      return res.json({ hospital: { id: existing[0].id, name: existing[0].name, pinyinAbbr: existing[0].pinyin_abbr } });
    }

    const id = uuidv4();
    const pinyinAbbr = getPinyinAbbr(trimmed);
    await getPool().query(
      `INSERT INTO hospitals (id, name, pinyin_abbr, abbreviation, alias) VALUES (?, ?, ?, ?, ?)`,
      [id, trimmed, pinyinAbbr, (abbreviation || '').trim() || null, (alias || '').trim() || null]
    );
    res.json({ hospital: { id, name: trimmed, pinyinAbbr, abbreviation: (abbreviation || '').trim(), alias: (alias || '').trim() } });
  } catch (err) {
    console.error('Add hospital error:', err);
    res.status(500).json({ error: '添加医院失败' });
  }
}

module.exports = { search, check, add };
