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

// 查看留言列表（简化为标题 + 点赞数 + 评论数）
async function listFeedback(req, res) {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT f.id, f.user_id, f.user_name, f.page_key, f.page_name, f.title, f.created_at,
              (SELECT COUNT(*) FROM feedback_likes l WHERE l.feedback_id = f.id) AS like_count,
              (SELECT COUNT(*) FROM feedback_comments c WHERE c.feedback_id = f.id) AS comment_count
       FROM feedback f ORDER BY f.created_at DESC LIMIT 200`
    );
    // 转为数字
    rows.forEach(r => {
      r.like_count = Number(r.like_count || 0);
      r.comment_count = Number(r.comment_count || 0);
    });
    res.json({ feedback: rows });
  } catch (err) {
    console.error('查询留言列表失败:', err);
    res.status(500).json({ error: err.message || '查询失败' });
  }
}

// 标题模糊搜索（输入时调用）
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

// 留言详情（留言主体 + 点赞数/当前用户是否点赞 + 评论列表）
async function getFeedbackDetail(req, res) {
  try {
    const { id } = req.params || {};
    const userId = req.user && req.user.id;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const pool = getPool();

    const [fbRows] = await pool.query(`SELECT * FROM feedback WHERE id = ?`, [id]);
    if (fbRows.length === 0) return res.status(404).json({ error: '留言不存在' });
    const fb = fbRows[0];

    const [[likeRow]] = await pool.query(
      `SELECT COUNT(*) AS c FROM feedback_likes WHERE feedback_id = ?`,
      [id]
    );
    const likeCount = Number(likeRow.c || 0);

    let likedByMe = false;
    if (userId) {
      const [[myLike]] = await pool.query(
        `SELECT 1 AS v FROM feedback_likes WHERE feedback_id = ? AND user_id = ? LIMIT 1`,
        [id, userId]
      );
      likedByMe = !!myLike;
    }

    const [comments] = await pool.query(
      `SELECT c.id, c.user_id, c.user_name, c.content, c.created_at
       FROM feedback_comments c WHERE c.feedback_id = ? ORDER BY c.created_at ASC`,
      [id]
    );

    res.json({
      feedback: fb,
      likeCount,
      likedByMe,
      comments
    });
  } catch (err) {
    console.error('查询留言详情失败:', err);
    res.status(500).json({ error: err.message || '查询失败' });
  }
}

// 点赞切换（有则取消，无则添加）
async function toggleLike(req, res) {
  try {
    const { id } = req.params || {};
    const user = req.user || {};
    const userId = user.id;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    if (!userId) return res.status(401).json({ error: '未登录' });

    const pool = getPool();
    const [[exist]] = await pool.query(
      `SELECT id FROM feedback_likes WHERE feedback_id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    );

    let liked;
    if (exist) {
      await pool.query(`DELETE FROM feedback_likes WHERE id = ?`, [exist.id]);
      liked = false;
    } else {
      await pool.query(
        `INSERT INTO feedback_likes (id, feedback_id, user_id) VALUES (?, ?, ?)`,
        [uuidv4(), id, userId]
      );
      liked = true;
    }

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS c FROM feedback_likes WHERE feedback_id = ?`,
      [id]
    );
    res.json({ liked, likeCount: Number(countRow.c || 0) });
  } catch (err) {
    console.error('点赞操作失败:', err);
    res.status(500).json({ error: err.message || '操作失败' });
  }
}

// 添加评论（评价）
async function addComment(req, res) {
  try {
    const { id } = req.params || {};
    const user = req.user || {};
    const userId = user.id;
    const userName = user.name;
    const { content } = req.body || {};

    if (!id) return res.status(400).json({ error: '缺少 id' });
    if (!userId) return res.status(401).json({ error: '未登录' });
    if (!userName) return res.status(400).json({ error: '缺少用户名' });
    if (!content || !content.trim()) return res.status(400).json({ error: '请填写评论内容' });

    const pool = getPool();
    // 确认留言存在
    const [[fb]] = await pool.query(`SELECT 1 AS v FROM feedback WHERE id = ? LIMIT 1`, [id]);
    if (!fb) return res.status(404).json({ error: '留言不存在' });

    const cid = uuidv4();
    await pool.query(
      `INSERT INTO feedback_comments (id, feedback_id, user_id, user_name, content) VALUES (?, ?, ?, ?, ?)`,
      [cid, id, userId, userName, content.trim()]
    );
    const [rows] = await pool.query(`SELECT * FROM feedback_comments WHERE id = ?`, [cid]);
    res.json({ ok: true, comment: rows[0] });
  } catch (err) {
    console.error('添加评论失败:', err);
    res.status(500).json({ error: err.message || '操作失败' });
  }
}

module.exports = {
  saveFeedback, listFeedback, searchFeedback,
  getFeedbackDetail, toggleLike, addComment
};
