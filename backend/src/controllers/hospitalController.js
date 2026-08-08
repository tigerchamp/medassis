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
 * 搜索医院库
 * GET /api/hospitals/search?q=xxx&limit=20
 *
 * 可见范围：标准共享数据 + 当前用户及其家庭组的私有数据
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
    const familyUserIds = await _getFamilyUserIds(req);

    const [rows] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias, address, postcode, phone
       FROM hospitals
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR ? LIKE CONCAT('%', name, '%')
              OR abbreviation LIKE ? OR alias LIKE ? OR pinyin_abbr LIKE ?)
       ORDER BY CASE
         WHEN name = ? THEN 0
         WHEN abbreviation = ? THEN 1
         WHEN alias = ? THEN 2
         WHEN pinyin_abbr = ? THEN 3
         WHEN name LIKE ? THEN 4
         WHEN ? LIKE CONCAT('%', name, '%') THEN 5
         WHEN pinyin_abbr LIKE ? THEN 6
         ELSE 7
       END, name
       LIMIT ?`,
      [familyUserIds, `%${kw}%`, kw, `%${kw}%`, `%${kw}%`, `${kw}%`, kw, kw, kw, kw, `${kw}%`, kw, `${kw}%`, limit]
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
 * 精确查询医院是否存在（按名称/简称/别名匹配，限定在可见范围内）
 * GET /api/hospitals/check?name=xxx
 * 返回：{ exists: bool, hospital: {...}|null, similar: [...] }
 */
async function check(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ exists: false, hospital: null, similar: [] });
    const familyUserIds = await _getFamilyUserIds(req);

    // 精确匹配 name/abbreviation/alias（仅在可见范围内）
    const [exact] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias FROM hospitals
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name = ? OR abbreviation = ? OR alias = ?) LIMIT 1`,
      [familyUserIds, name, name, name]
    );
    if (exact.length > 0) {
      return res.json({ exists: true, hospital: exact[0] });
    }
    // 不存在则返回相似项（同样限定可见范围）
    const [similar] = await getPool().query(
      `SELECT id, name, abbreviation, alias FROM hospitals
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR alias LIKE ?) ORDER BY name LIMIT 8`,
      [familyUserIds, `%${name}%`, `%${name}%`]
    );
    res.json({ exists: false, hospital: null, similar });
  } catch (err) {
    console.error('Hospital check error:', err);
    res.status(500).json({ error: '校验医院失败' });
  }
}

/**
 * 添加新医院（仅当前用户及其家庭组可用）
 * POST /api/hospitals/add  body: { name, abbreviation?, alias?, phone?, address? }
 * 自动生成拼音首字母作为 pinyin_abbr，owner_user_id 记录创建者
 */
async function add(req, res) {
  try {
    const { name, abbreviation, alias, phone, address } = req.body;
    const trimmed = (name || '').trim();
    if (!trimmed) return res.status(400).json({ error: '医院名称不能为空' });

    const familyUserIds = await _getFamilyUserIds(req);
    // 在可见范围内已存在则直接返回，避免重复添加
    const [existing] = await getPool().query(
      `SELECT * FROM hospitals WHERE (owner_user_id IS NULL OR owner_user_id IN (?)) AND name = ? LIMIT 1`,
      [familyUserIds, trimmed]
    );
    if (existing.length > 0) {
      return res.json({ hospital: { id: existing[0].id, name: existing[0].name, pinyinAbbr: existing[0].pinyin_abbr } });
    }

    const id = uuidv4();
    const pinyinAbbr = getPinyinAbbr(trimmed);
    const abbr = (abbreviation || '').trim() || null;
    const al = (alias || '').trim() || null;
    const ph = (phone || '').trim() || null;
    const addr = (address || '').trim() || null;
    await getPool().query(
      `INSERT INTO hospitals (id, name, pinyin_abbr, abbreviation, alias, phone, address, owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, trimmed, pinyinAbbr, abbr, al, ph, addr, req.user.id]
    );
    res.json({
      hospital: {
        id, name: trimmed, pinyinAbbr,
        abbreviation: abbr || '', alias: al || '', phone: ph || '', address: addr || ''
      }
    });
  } catch (err) {
    console.error('Add hospital error:', err);
    res.status(500).json({ error: '添加医院失败' });
  }
}

// ============ 分词匹配辅助函数 ============

/**
 * 生成 n-gram（默认2-gram）集合
 * 例如 "北京人民医院" → {"北京","京人","人民","民医","医院"}
 */
function _generateGrams(text, n = 2) {
  const grams = new Set();
  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.substring(i, i + n));
  }
  return grams;
}

/**
 * 计算查询名称与目标名称的 2-gram 相似度
 * 算法：统计匹配的 2-gram 数量，命中分词合计长度 / 查询名称长度 >= 0.6 才认为相似
 * @param {string} query 识别出的医院名称
 * @param {string} target 数据库中的医院名称
 * @returns {number} 相似度分数（0 表示不相似）
 */
function _calcSimilarity(query, target) {
  if (!query || !target) return 0;
  const queryGrams = _generateGrams(query, 2);
  const targetGrams = _generateGrams(target, 2);
  let matched = 0;
  for (const g of queryGrams) {
    if (targetGrams.has(g)) matched++;
  }
  const matchedChars = matched * 2;
  // 以查询名称长度为基准（如名称长10，命中分词合计长度6以上才相似）
  const score = matchedChars / Math.max(query.length, 1);
  return score >= 0.6 ? score : 0;
}

/**
 * 医院名称匹配（精确匹配 + 模糊双向LIKE + 2-gram分词匹配）
 * GET /api/hospitals/match?name=xxx
 *
 * 返回：{ exact: bool, hospital: {...}|null, similar: [...] }
 * - exact=true 时 hospital 为精确匹配的医院
 * - exact=false 时 similar 为模糊+分词匹配的相似医院列表（按相似度排序）
 */
async function match(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ exact: false, hospital: null, similar: [] });

    const familyUserIds = await _getFamilyUserIds(req);

    // 1. 精确匹配 name/abbreviation/alias
    const [exact] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias, phone, address FROM hospitals
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name = ? OR abbreviation = ? OR alias = ?) LIMIT 1`,
      [familyUserIds, name, name, name]
    );
    if (exact.length > 0) {
      return res.json({
        exact: true,
        hospital: {
          id: exact[0].id, name: exact[0].name,
          abbreviation: exact[0].abbreviation || '', alias: exact[0].alias || '',
          phone: exact[0].phone || '', address: exact[0].address || ''
        }
      });
    }

    // 2. 模糊双向 LIKE（名称包含查询 OR 查询包含名称）+ 简称/别名模糊
    const [fuzzy] = await getPool().query(
      `SELECT id, name, pinyin_abbr, abbreviation, alias, phone, address FROM hospitals
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR ? LIKE CONCAT('%', name, '%')
              OR abbreviation LIKE ? OR alias LIKE ?)
       ORDER BY
         CASE WHEN name LIKE ? THEN 0
              WHEN ? LIKE CONCAT('%', name, '%') THEN 1
              ELSE 2 END, name
       LIMIT 10`,
      [familyUserIds, `%${name}%`, name, `%${name}%`, `%${name}%`, `%${name}%`, name]
    );

    // 3. 2-gram 分词匹配（补充 LIKE 未覆盖的相似项）
    // 用查询名称的 2-gram 做 SQL 预筛选：只取包含至少一个 2-gram 的医院，确保不遗漏
    const queryGrams = [..._generateGrams(name, 2)];
    let gramScored = [];
    if (queryGrams.length > 0) {
      const gramConds = queryGrams.map(() => 'name LIKE ?').join(' OR ');
      const gramParams = queryGrams.map(g => `%${g}%`);
      const [gramHospitals] = await getPool().query(
        `SELECT id, name, pinyin_abbr, abbreviation, alias, phone, address FROM hospitals
         WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
           AND (${gramConds})
         ORDER BY CASE WHEN owner_user_id IS NOT NULL THEN 0 ELSE 1 END, name
         LIMIT 1000`,
        [familyUserIds, ...gramParams]
      );
      gramScored = gramHospitals
        .map(h => ({ ...h, _score: _calcSimilarity(name, h.name) }))
        .filter(h => h._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 10);
    }

    // 合并去重（fuzzy 优先，gram 补充）
    const seen = new Set();
    const similar = [];
    for (const h of [...fuzzy, ...gramScored]) {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        similar.push({
          id: h.id, name: h.name,
          abbreviation: h.abbreviation || '', alias: h.alias || '',
          phone: h.phone || '', address: h.address || ''
        });
      }
    }

    res.json({ exact: false, hospital: null, similar: similar.slice(0, 10) });
  } catch (err) {
    console.error('Hospital match error:', err);
    res.status(500).json({ error: '医院匹配失败' });
  }
}

module.exports = { search, check, add, match };
