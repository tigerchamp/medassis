const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 用户注册
async function register(req, res) {
  try {
    const { name, phone, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: '姓名和密码不能为空' });
    }

    // 检查手机号是否已注册
    if (phone) {
      const [existing] = await getPool().query('SELECT id FROM users WHERE phone = ?', [phone]);
      if (existing.length > 0) {
        return res.status(400).json({ error: '手机号已被注册' });
      }
    }

    // 创建家庭
    const familyId = uuidv4();
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await getPool().query(
      'INSERT INTO families (id, name, invite_code) VALUES (?, ?, ?)',
      [familyId, '我的家庭', inviteCode]
    );

    // 创建用户
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const avatar = name.charAt(0);
    await getPool().query(
      'INSERT INTO users (id, name, phone, password, role, family_id, avatar, authorized) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, name, phone || null, hashedPassword, 'admin', familyId, avatar, true]
    );

    // 自动创建一条"自己"的成员档案
    const selfElderId = uuidv4();
    await getPool().query(
      'INSERT INTO elders (id, family_id, user_id, name, gender, avatar, relation) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [selfElderId, familyId, userId, name, '男', avatar, 'self']
    );

    // 生成token
    const token = jwt.sign(
      { userId, familyId },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: userId, name, phone, role: 'admin', familyId, avatar, authorized: true },
      family: { id: familyId, name: '我的家庭', inviteCode }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
}

// 用户登录
async function login(req, res) {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    const [users] = await getPool().query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (users.length === 0) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }

    // 获取家庭信息
    const [families] = await getPool().query('SELECT * FROM families WHERE id = ?', [user.family_id]);

    const token = jwt.sign(
      { userId: user.id, familyId: user.family_id },
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        familyId: user.family_id,
        avatar: user.avatar,
        authorized: !!user.authorized
      },
      family: families[0] || null
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
}

// 获取当前用户信息
async function getProfile(req, res) {
  try {
    const user = req.user;
    const [families] = await getPool().query('SELECT * FROM families WHERE id = ?', [user.family_id]);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        familyId: user.family_id,
        avatar: user.avatar,
        authorized: !!user.authorized
      },
      family: families[0] || null
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
}

// 更新个人资料
async function updateProfile(req, res) {
  try {
    const { name, phone } = req.body;
    const userId = req.user.id;

    if (name) {
      await getPool().query('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
    }
    if (phone) {
      // 检查手机号是否被他人使用
      const [existing] = await getPool().query('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userId]);
      if (existing.length > 0) {
        return res.status(400).json({ error: '手机号已被使用' });
      }
      await getPool().query('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);
    }

    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: '更新失败' });
  }
}

// 加入家庭
async function joinFamily(req, res) {
  try {
    const { inviteCode, name } = req.body;
    const userId = req.user.id;

    if (!inviteCode) {
      return res.status(400).json({ error: '邀请码不能为空' });
    }

    const [families] = await getPool().query('SELECT * FROM families WHERE invite_code = ?', [inviteCode]);
    if (families.length === 0) {
      return res.status(404).json({ error: '邀请码无效' });
    }

    const family = families[0];
    await getPool().query('UPDATE users SET family_id = ?, role = ? WHERE id = ?', [family.id, 'member', userId]);

    res.json({
      message: '加入成功',
      family: { id: family.id, name: family.name }
    });
  } catch (err) {
    console.error('Join family error:', err);
    res.status(500).json({ error: '加入家庭失败' });
  }
}

// 获取家庭成员
async function getFamilyMembers(req, res) {
  try {
    const familyId = req.familyId;
    const [members] = await getPool().query(
      'SELECT id, name, phone, role, authorized, avatar, created_at FROM users WHERE family_id = ?',
      [familyId]
    );

    res.json({ members });
  } catch (err) {
    console.error('Get family members error:', err);
    res.status(500).json({ error: '获取家庭成员失败' });
  }
}

// 更新家庭组信息
async function updateFamily(req, res) {
  try {
    const familyId = req.familyId;
    const { name } = req.body;

    if (name) {
      await getPool().query('UPDATE families SET name = ? WHERE id = ?', [name, familyId]);
    }

    const [families] = await getPool().query('SELECT * FROM families WHERE id = ?', [familyId]);
    res.json({ family: families[0] || null });
  } catch (err) {
    console.error('Update family error:', err);
    res.status(500).json({ error: '更新家庭信息失败' });
  }
}

// 切换成员授权状态
async function toggleAuthorization(req, res) {
  try {
    const { userId } = req.params;
    const familyId = req.familyId;

    // 检查目标用户是否在同一家庭
    const [users] = await getPool().query('SELECT * FROM users WHERE id = ? AND family_id = ?', [userId, familyId]);
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const newStatus = !users[0].authorized;
    await getPool().query('UPDATE users SET authorized = ? WHERE id = ?', [newStatus, userId]);

    res.json({ userId, authorized: newStatus });
  } catch (err) {
    console.error('Toggle authorization error:', err);
    res.status(500).json({ error: '更新授权状态失败' });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  joinFamily,
  getFamilyMembers,
  updateFamily,
  toggleAuthorization
};
