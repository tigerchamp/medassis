const { getPool } = require('../config/database');

/**
 * 搜索科室
 * GET /api/departments/search?q=xxx&limit=20
 */
async function search(req, res) {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!q || q.trim() === '') {
      return res.json({ departments: [] });
    }
    const kw = q.trim();

    const [rows] = await getPool().query(
      `SELECT id, name, pinyin_abbr, category
       FROM departments
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
      departments: rows.map(r => ({
        id: r.id,
        name: r.name,
        pinyinAbbr: r.pinyin_abbr,
        category: r.category || ''
      }))
    });
  } catch (err) {
    console.error('Department search error:', err);
    res.status(500).json({ error: '搜索科室失败' });
  }
}

module.exports = { search };
