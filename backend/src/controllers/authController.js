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
      [selfElderId, familyId, userId, name, '未知', avatar, 'self']
    );

    // 在 user_families 中创建默认关联
    try {
      const ufId = 'uf_' + userId.slice(0, 8) + '_' + familyId.slice(0, 8);
      await getPool().query(
        'INSERT INTO user_families (id, user_id, family_id, role, is_primary) VALUES (?, ?, ?, ?, 1)',
        [ufId, userId, familyId, 'admin']
      );
    } catch (e) { /* user_families 表可能不存在，跳过 */ }

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

    // 获取用户所有家庭组
    let userFamilies = [];
    try {
      const [ufRows] = await getPool().query(`
        SELECT f.id, f.name, f.invite_code, uf.role, uf.is_primary, uf.joined_at,
               (SELECT uf2.user_id FROM user_families uf2 WHERE uf2.family_id = f.id AND uf2.role = 'admin' LIMIT 1) as creator_id,
               (SELECT u2.name FROM users u2 INNER JOIN user_families uf2 ON uf2.user_id = u2.id WHERE uf2.family_id = f.id AND uf2.role = 'admin' LIMIT 1) as creator_name
        FROM user_families uf INNER JOIN families f ON f.id = uf.family_id
        WHERE uf.user_id = ? ORDER BY uf.is_primary DESC, uf.joined_at ASC
      `, [user.id]);
      userFamilies = ufRows;
    } catch (e) {
      // user_families 表可能不存在，跳过
    }

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
      family: families[0] || null,
      families: userFamilies
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
}

// 获取当前用户信息（含所有家庭组）
async function getProfile(req, res) {
  try {
    const user = req.user;
    const currentFamilyId = req.familyId;

    // 获取用户所有家庭组（通过 user_families 表或回退到 users.family_id）
    let families = [];
    try {
      const [rows] = await getPool().query(`
        SELECT f.id, f.name, f.invite_code, uf.role, uf.is_primary, uf.joined_at,
               (SELECT uf2.user_id FROM user_families uf2 WHERE uf2.family_id = f.id AND uf2.role = 'admin' LIMIT 1) as creator_id,
               (SELECT u2.name FROM users u2 INNER JOIN user_families uf2 ON uf2.user_id = u2.id WHERE uf2.family_id = f.id AND uf2.role = 'admin' LIMIT 1) as creator_name
        FROM user_families uf
        INNER JOIN families f ON f.id = uf.family_id
        WHERE uf.user_id = ?
        ORDER BY uf.is_primary DESC, uf.joined_at ASC
      `, [user.id]);
      families = rows;
    } catch (e) {
      // 如果 user_families 表不存在，回退到旧逻辑
      if (user.family_id) {
        const [rows] = await getPool().query(`
          SELECT f.id, f.name, f.invite_code, 'member' as role, 1 as is_primary, f.created_at as joined_at,
                 (SELECT u2.id FROM users u2 WHERE u2.family_id = f.id AND u2.role = 'admin' LIMIT 1) as creator_id,
                 (SELECT u2.name FROM users u2 WHERE u2.family_id = f.id AND u2.role = 'admin' LIMIT 1) as creator_name
          FROM families f WHERE f.id = ?
        `, [user.family_id]);
        families = rows;
      }
    }

    // 当前家庭信息
    let currentFamily = null;
    if (currentFamilyId) {
      const [rows] = await getPool().query('SELECT * FROM families WHERE id = ?', [currentFamilyId]);
      currentFamily = rows[0] || null;
    } else if (families.length > 0) {
      currentFamily = families.find(f => f.is_primary) || families[0];
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        familyId: currentFamily ? currentFamily.id : user.family_id,
        avatar: user.avatar,
        authorized: !!user.authorized
      },
      family: currentFamily,
      families
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

// 加入家庭（支持多家庭组：保留原家庭，新增到 user_families）
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

    // === 校验1：年龄限制（<18岁或>80岁不能添加家庭组）===
    const [selfElders] = await getPool().query(
      "SELECT birth_date FROM elders WHERE user_id = ? AND relation = 'self' LIMIT 1",
      [userId]
    );
    if (selfElders.length > 0 && selfElders[0].birth_date) {
      const birthDate = new Date(selfElders[0].birth_date);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18 || age > 80) {
        return res.status(403).json({ error: '年龄需在18至80岁之间才能添加家庭组' });
      }
    }

    // === 校验2：目标家庭成员上限10人（含管理员）===
    const [memberCount] = await getPool().query(
      'SELECT COUNT(*) as cnt FROM user_families WHERE family_id = ?',
      [family.id]
    );
    if ((memberCount[0]?.cnt || 0) >= 10) {
      return res.status(403).json({ error: '该家庭组成员已满（上限10人）' });
    }

    // 检查是否已在该家庭中（如果是，直接返回）
    try {
      const [existing] = await getPool().query(
        'SELECT id FROM user_families WHERE user_id = ? AND family_id = ?',
        [userId, family.id]
      );
      if (existing.length > 0) {
        return res.json({
          message: '已在该家庭组中',
          family: { id: family.id, name: family.name }
        });
      }
      // 添加到 user_families 表（保留原家庭组，不覆盖）
    const ufId = 'uf_' + userId.slice(0, 8) + '_' + family.id.slice(0, 8);
    await getPool().query(
      'INSERT INTO user_families (id, user_id, family_id, role, is_primary) VALUES (?, ?, ?, ?, 0)',
      [ufId, userId, family.id, 'member']
    );
    } catch (e) {
      // user_families 表不存在时，不覆盖原 users.family_id
      // 只在用户没有任何家庭组时才更新
      if (!req.user.family_id) {
        await getPool().query('UPDATE users SET family_id = ?, role = ? WHERE id = ?', [family.id, 'member', userId]);
      }
    }

    // 注意：用户的档案资料（elders、records、medications 等）只有一份
    // 不需要在新家庭组中创建新的 self 档案
    // 查询成员时会自动包含当前用户的 self 档案（跨家庭共享）

    res.json({
      message: '加入成功',
      family: { id: family.id, name: family.name }
    });
  } catch (err) {
    console.error('Join family error:', err);
    res.status(500).json({ error: '加入家庭失败' });
  }
}

// 创建家庭组（成年人最多创建3个：系统注册自动创建1个 + 额外创建2个）
async function createFamily(req, res) {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    // === 校验1：年龄限制（<18岁或>80岁不能添加家庭组）===
    const [selfElders] = await getPool().query(
      "SELECT birth_date FROM elders WHERE user_id = ? AND relation = 'self' LIMIT 1",
      [userId]
    );
    if (selfElders.length > 0 && selfElders[0].birth_date) {
      const birthDate = new Date(selfElders[0].birth_date);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18 || age > 80) {
        return res.status(403).json({ error: '年龄需在18至80岁之间才能创建家庭组' });
      }
    }

    // === 校验2：作为创建者的家庭组数量 < 3（注册时系统自动创建1个）===
    let createdCount = 0;
    try {
      const [rows] = await getPool().query(
        "SELECT COUNT(*) as cnt FROM user_families WHERE user_id = ? AND role = 'admin'",
        [userId]
      );
      createdCount = rows[0]?.cnt || 0;
    } catch (e) {
      // user_families 表不存在时回退：users.family_id 算作已创建1个
      createdCount = req.user.family_id ? 1 : 0;
    }
    if (createdCount >= 3) {
      return res.status(403).json({ error: '最多只能创建3个家庭组' });
    }

    // 创建家庭组
    const familyId = uuidv4();
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await getPool().query(
      'INSERT INTO families (id, name, invite_code) VALUES (?, ?, ?)',
      [familyId, name || '我的新家庭', inviteCode]
    );

    // 关联到 user_families（role=admin，非主家庭）
    try {
      const ufId = 'uf_' + userId.slice(0, 8) + '_' + familyId.slice(0, 8);
      await getPool().query(
        'INSERT INTO user_families (id, user_id, family_id, role, is_primary) VALUES (?, ?, ?, ?, 0)',
        [ufId, userId, familyId, 'admin']
      );
    } catch (e) {
      // user_families 表不存在时回退
      if (!req.user.family_id) {
        await getPool().query('UPDATE users SET family_id = ?, role = ? WHERE id = ?', [familyId, 'admin', userId]);
      }
    }

    // 注意：用户自我档案跨家庭共享，不重复创建 self 档案

    res.json({
      message: '创建成功',
      family: { id: familyId, name: name || '我的新家庭', inviteCode }
    });
  } catch (err) {
    console.error('Create family error:', err);
    res.status(500).json({ error: '创建家庭组失败' });
  }
}

// 获取家庭成员
async function getFamilyMembers(req, res) {
  try {
    const familyId = req.familyId;
    const currentUserId = req.user.id;
    // 通过 user_families 表查询所有加入该家庭的用户（兼容多家庭组）
    // 同时回退查询 users.family_id 以兼容旧数据
    const [members] = await getPool().query(`
      SELECT u.id, u.name, u.phone, u.role, u.authorized, u.avatar, u.created_at
      FROM users u
      WHERE u.id IN (
        SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
        UNION
        SELECT u2.id FROM users u2 WHERE u2.family_id = ?
      )
    `, [familyId, familyId]);

    // 查询当前用户与其他成员之间的双向授权关系
    const result = [];
    for (const m of members) {
      // 我能否修改此人 = 此人是否授权了我 (granter=此人, grantee=我)
      const [canModifyRows] = await getPool().query(
        `SELECT authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ?`,
        [m.id, currentUserId]
      );
      const canModifyHim = canModifyRows.length > 0 && canModifyRows[0].authorized;

      // 此人能否修改我 = 我是否授权了此人 (granter=我, grantee=此人)
      const [heCanModifyRows] = await getPool().query(
        `SELECT authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ?`,
        [currentUserId, m.id]
      );
      const heCanModifyMe = heCanModifyRows.length > 0 && heCanModifyRows[0].authorized;

      result.push({
        ...m,
        canModifyHim,    // 可修改您：我被此人授权
        heCanModifyMe     // 您可修改：此人被我授权
      });
    }

    res.json({ members: result });
  } catch (err) {
    console.error('Get family members error:', err);
    res.status(500).json({ error: '获取家庭成员失败' });
  }
}

// 更新家庭组信息
async function updateFamily(req, res) {
  try {
    const familyId = req.familyId;
    const userId = req.user.id;
    const { name } = req.body;

    // 仅家庭创建者（在 user_families 中 role=admin，或回退旧逻辑 users.family_id 匹配的 admin）可以修改家庭名称
    let isAdmin = false;
    try {
      const [adminRows] = await getPool().query(
        'SELECT user_id FROM user_families WHERE family_id = ? AND role = ?',
        [familyId, 'admin']
      );
      isAdmin = adminRows.some(r => String(r.user_id) === String(userId));
    } catch (e) {
      // 回退旧逻辑
      const [admins] = await getPool().query(
        'SELECT id FROM users WHERE family_id = ? AND role = ?',
        [familyId, 'admin']
      );
      isAdmin = admins.length > 0 && String(admins[0].id) === String(userId);
    }
    if (!isAdmin) {
      return res.status(403).json({ error: '仅家庭创建者可修改家庭信息' });
    }

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
// type: 'canModifyHim' (我能否修改此人 = 此人授权我) → 只读，不允许切换
// type: 'heCanModifyMe' (此人能否修改我 = 我授权此人) → 可切换
async function toggleAuthorization(req, res) {
  try {
    const { userId } = req.params;
    const familyId = req.familyId;
    const currentUserId = req.user.id;
    const { type } = req.body; // 'canModifyHim' | 'heCanModifyMe'

    // 检查目标用户是否在该家庭
    const [users] = await getPool().query(`
      SELECT * FROM users WHERE id = ? AND (
        family_id = ? OR
        id IN (SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ? AND uf.user_id = ?)
      )
    `, [userId, familyId, familyId, userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (!type || !['canModifyHim', 'heCanModifyMe'].includes(type)) {
      return res.status(400).json({ error: '授权类型无效' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ error: '不允许对自己设置授权' });
    }

    if (type === 'canModifyHim') {
      // 这是对方给我的授权，只有对方自己能改
      return res.status(403).json({ error: '该授权需由对方自行设置' });
    }

    // 仅允许设置自己给别人的授权（heCanModifyMe: granter=我, grantee=此人）
    const granterId = currentUserId;
    const granteeId = userId;

    const pool = getPool();
    // 查询现有记录
    const [existing] = await pool.query(
      'SELECT id, authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ?',
      [granterId, granteeId]
    );

    const newStatus = existing.length === 0 || !existing[0].authorized;

    if (existing.length > 0) {
      await pool.query('UPDATE member_authorizations SET authorized = ? WHERE id = ?', [newStatus, existing[0].id]);
    } else {
      const { v4: uuidv4 } = require('uuid');
      await pool.query(
        'INSERT INTO member_authorizations (id, granter_user_id, grantee_user_id, authorized) VALUES (?, ?, ?, ?)',
        [uuidv4(), granterId, granteeId, newStatus]
      );
    }

    // 同时更新旧的 users.authorized 字段以兼容
    await pool.query('UPDATE users SET authorized = ? WHERE id = ?', [newStatus, userId]);

    res.json({ userId, type, authorized: newStatus });
  } catch (err) {
    console.error('Toggle authorization error:', err);
    res.status(500).json({ error: '更新授权状态失败' });
  }
}

// 获取用户所属的所有家庭组
async function getUserFamilies(req, res) {
  try {
    const userId = req.user.id;
    let rows = [];
    try {
      // 通过 user_families 表查找所有家庭
      const [result] = await getPool().query(
        `SELECT f.id, f.name, f.invite_code, uf.role, uf.is_primary, uf.joined_at,
                (SELECT u2.name FROM users u2 INNER JOIN user_families uf2 ON uf2.user_id = u2.id WHERE uf2.family_id = f.id AND uf2.role = 'admin' LIMIT 1) as creator_name
         FROM user_families uf
         INNER JOIN families f ON f.id = uf.family_id
         WHERE uf.user_id = ?
         ORDER BY uf.is_primary DESC, uf.joined_at ASC`,
        [userId]
      );
      rows = result;
    } catch (e) {
      // user_families 表不存在，回退到旧逻辑
      const [result] = await getPool().query(
        `SELECT DISTINCT f.id, f.name, f.invite_code,
                (SELECT u2.name FROM users u2 WHERE u2.family_id = f.id AND u2.role = 'admin' LIMIT 1) as creator_name
         FROM families f
         INNER JOIN users u ON u.family_id = f.id
         WHERE u.id = ?`,
        [userId]
      );
      rows = result;
    }
    res.json({ families: rows });
  } catch (err) {
    console.error('Get user families error:', err);
    res.status(500).json({ error: '获取家庭组列表失败' });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  joinFamily,
  createFamily,
  getFamilyMembers,
  updateFamily,
  toggleAuthorization,
  getUserFamilies
};
