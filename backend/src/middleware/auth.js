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
      try {
        // 通过 user_families 表检查成员关系
        const [membership] = await getPool().query(
          'SELECT id FROM user_families WHERE user_id = ? AND family_id = ?',
          [users[0].id, overrideFamilyId]
        );
        if (membership.length > 0) {
          req.familyId = overrideFamilyId;
          return next();
        }
      } catch (e) {
        // user_families 表可能不存在，回退检查 users.family_id
        if (users[0].family_id === overrideFamilyId) {
          req.familyId = overrideFamilyId;
          return next();
        }
      }
      // 回退：检查 users.family_id（旧模型）
      if (users[0].family_id === overrideFamilyId) {
        req.familyId = overrideFamilyId;
        return next();
      }
      // 没有权限访问该家庭，使用默认家庭
      console.warn(`用户 ${users[0].id} 不是家庭 ${overrideFamilyId} 的成员，使用默认家庭`);
    }
    req.familyId = decoded.familyId || users[0].family_id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期' });
    }
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: '无效的token' });
  }
}

module.exports = { authMiddleware };
