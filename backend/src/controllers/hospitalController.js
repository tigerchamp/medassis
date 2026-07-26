const { getPool } = require('../config/database');

/**
 * 搜索医院库
 * GET /api/hospitals/search?q=xxx&limit=20
 *
 * 匹配规则：
 * - 同时按 名称 LIKE 模糊匹配 和 拼音首字母缩写前缀匹配
 * - 拼音缩写前缀匹配优先排序
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
      `SELECT id, name, pinyin_abbr, address, postcode, phone
       FROM hospitals
       WHERE name LIKE ? OR pinyin_abbr LIKE ?
       ORDER BY CASE
         WHEN name = ? THEN 0
         WHEN pinyin_abbr = ? THEN 1
         WHEN name LIKE ? THEN 2
         WHEN pinyin_abbr LIKE ? THEN 3
         ELSE 4
       END, name
       LIMIT ?`,
      [`%${kw}%`, `${kw}%`, kw, kw, `${kw}%`, `${kw}%`, limit]
    );

    res.json({
      hospitals: rows.map(r => ({
        id: r.id,
        name: r.name,
        pinyinAbbr: r.pinyin_abbr,
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

module.exports = { search };
