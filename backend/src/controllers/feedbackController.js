const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../config/database');

// 保存一条留言
async function saveFeedback(req, res) {
  try {
    const user = req.user || {};
    const userId = user.id;
    const userName = user.name || req.body.userName;
    const { pageKey, pageName, title, content } = req.body || {};

    if (!userId) return res.status(401).json({ error: '未登录' });
    if (!userName) return res.status(400).json({ error: '缺少用户名' });
    if (!title || !title.trim()) return res.status(400).json({ error: '请填写留言标题' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请填写留言内容' });

    const id = uuidv4();
    const pool = getPool();
    await pool.query(
      `INSERT INTO feedback (id, user_id, user_name, page_key, page_name, title, content) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, userName, pageKey || null, pageName || null, title.trim(), content.trim()]
    );

    const [rows] = await pool.query(`SELECT * FROM feedback WHERE id = ?`, [id]);
    res.json({ ok: true, feedback: rows[0] });
  } catch (err) {
    console.error('保存留言失败:', err);
    res.status(500).json({ error: err.message || '保存失败' });
  }
}

// 查看留言列表（所有用户可见，按时间倒序）
async function listFeedback(req, res) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, user_id, user_name, page_key, page_name, title, content, created_at
       FROM feedback ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ feedback: rows });
  } catch (err) {
    console.error('查询留言列表失败:', err);
    res.status(500).json({ error: err.message || '查询失败' });
  }
}

// 标题模糊搜索（匹配相似留言，输入时调用）
async function searchFeedback(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ matches: [] });
    const pool = getPool();
    const like = `%${q}%`;
    const [rows] = await pool.query(
      `SELECT id, user_name, title, content, created_at, page_name
       FROM feedback WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC LIMIT 10`,
      [like, like]
    );
    res.json({ matches: rows });
  } catch (err) {
    console.error('搜索留言失败:', err);
    res.status(500).json({ error: err.message || '搜索失败' });
  }
}

module.exports = { saveFeedback, listFeedback, searchFeedback };
