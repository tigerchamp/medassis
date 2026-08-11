const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { getPinyinAbbr } = require('../utils/pinyin');

/**
 * 获取当前用户及其所在家庭组的全部用户ID（用于私有数据隔离）。
 * 标准共享数据 owner_user_id IS NULL，私有数据 owner_user_id 在家庭组成员内。
 */
async function _getFamilyUserIds(req) {
  const familyId = req.familyId || (req.user && req.user.family_id);
  let userIds = [req.user.id];
  if (familyId) {
    const [rows] = await getPool().query('SELECT id FROM users WHERE family_id = ?', [familyId]);
    const ids = rows.map(r => r.id);
    if (ids.length) userIds = ids;
    if (!userIds.includes(req.user.id)) userIds.push(req.user.id);
  }
  return userIds;
}

/**
 * 搜索科室
 * GET /api/departments/search?q=xxx&limit=20
 *
 * 可见范围：标准共享数据 + 当前用户及其家庭组的私有数据
 * 匹配 名称/简称/别名/拼音首字母
 */
async function search(req, res) {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!q || q.trim() === '') {
      return res.json({ departments: [] });
    }
    const kw = q.trim();
    const familyUserIds = await _getFamilyUserIds(req);

    const [rows] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias, category
       FROM departments
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR abbreviation LIKE ? OR alias LIKE ? OR pinyin_abbr LIKE ?)
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
      [familyUserIds, `%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`, kw, kw, kw, kw, `%${kw}%`, `%${kw}%`, limit]
    );

    res.json({
      departments: rows.map(r => ({
        id: r.id,
        name: r.name,
        pinyinAbbr: r.pinyin_abbr,
        abbreviation: r.abbreviation || '',
        alias: r.alias || '',
        category: r.category || ''
      }))
    });
  } catch (err) {
    console.error('Department search error:', err);
    res.status(500).json({ error: '搜索科室失败' });
  }
}

/**
 * 精确查询科室是否存在（限定在可见范围内）
 * GET /api/departments/check?name=xxx
 */
async function check(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ exists: false, department: null, similar: [] });
    const familyUserIds = await _getFamilyUserIds(req);

    const [exact] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias FROM departments
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name = ? OR abbreviation = ? OR alias = ?) LIMIT 1`,
      [familyUserIds, name, name, name]
    );
    if (exact.length > 0) {
      return res.json({ exists: true, department: exact[0] });
    }
    const [similar] = await getPool().query(
      `SELECT id, name, abbreviation, alias FROM departments
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR alias LIKE ?) ORDER BY name LIMIT 8`,
      [familyUserIds, `%${name}%`, `%${name}%`]
    );
    res.json({ exists: false, department: null, similar });
  } catch (err) {
    console.error('Department check error:', err);
    res.status(500).json({ error: '校验科室失败' });
  }
}

/**
 * 添加新科室（仅当前用户及其家庭组可用）
 * POST /api/departments/add  body: { name, abbreviation?, alias?, category? }
 * 自动生成拼音首字母作为 pinyin_abbr，owner_user_id 记录创建者
 */
async function add(req, res) {
  try {
    const { name, abbreviation, alias, category } = req.body;
    const trimmed = (name || '').trim();
    if (!trimmed) return res.status(400).json({ error: '科室名称不能为空' });

    const familyUserIds = await _getFamilyUserIds(req);
    const [existing] = await getPool().query(
      `SELECT * FROM departments WHERE (owner_user_id IS NULL OR owner_user_id IN (?)) AND name = ? LIMIT 1`,
      [familyUserIds, trimmed]
    );
    if (existing.length > 0) {
      return res.json({ department: { id: existing[0].id, name: existing[0].name, pinyinAbbr: existing[0].pinyin_abbr } });
    }

    const id = uuidv4();
    const pinyinAbbr = getPinyinAbbr(trimmed);
    const abbr = (abbreviation || '').trim() || null;
    const al = (alias || '').trim() || null;
    const cat = (category || '').trim() || null;
    await getPool().query(
      `INSERT INTO departments (id, name, pinyin_abbr, abbreviation, alias, category, owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, trimmed, pinyinAbbr, abbr, al, cat, req.user.id]
    );
    res.json({
      department: {
        id, name: trimmed, pinyinAbbr,
        abbreviation: abbr || '', alias: al || '', category: cat || ''
      }
    });
  } catch (err) {
    console.error('Add department error:', err);
    res.status(500).json({ error: '添加科室失败' });
  }
}

module.exports = { search, check, add };
