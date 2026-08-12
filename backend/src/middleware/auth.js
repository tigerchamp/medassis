const jwt = require('jsonwebtoken');
const { getPool } = require('../config/database');

async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    const [users] = await getPool().query('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (users.length === 0) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.user = users[0];
    // 支持通过请求头 family-id 切换当前家庭组（如果用户是该家庭成员）
    const overrideFamilyId = req.headers['family-id'];
    if (overrideFamilyId) {
      // 检查用户是否是该家庭的成员
      const [membership] = await getPool().query(
        'SELECT id FROM user_families WHERE user_id = ? AND family_id = ?',
        [users[0].id, overrideFamilyId]
      );
      if (membership.length > 0) {
        req.familyId = overrideFamilyId;
        return next();
      }
      // 如果 user_families 表不存在或无记录，回退到 users.family_id
    }
    req.familyId = decoded.familyId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期' });
    }
    return res.status(401).json({ error: '无效的token' });
  }
}

module.exports = { authMiddleware };
