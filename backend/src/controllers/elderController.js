const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { canModifyElder, isFamilyAdmin, isManualMember, checkElderDeletable } = require('../utils/familyAccess');

// 获取所有成员档案（含自己）
async function getElders(req, res) {
  try {
    const familyId = req.familyId;
    const userId = req.user.id;

    // 查询：当前家庭的成员 + 家庭组所有成员的 self 档案（跨家庭共享）
    // self 档案根据 user_id + relation='self' 定位，不依赖 family_id
    // 通过 user_families 表找到当前家庭组的所有用户，包含他们的 self 档案
    // 关键：role 必须取当前家庭组内的 user_families.role，不能取 users.role（全局角色），
    // 否则一个用户在自己创建的家庭是 admin，加入别人家庭时也会显示为 admin。
    const [elders] = await getPool().query(`
      SELECT e.*, u.phone AS user_phone, u.role AS user_role, uf.role AS family_role
      FROM elders e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN user_families uf ON uf.user_id = e.user_id AND uf.family_id = ?
      WHERE e.family_id = ?
         OR (e.relation = 'self' AND e.user_id IN (
           SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
           UNION
           SELECT u2.id FROM users u2 WHERE u2.family_id = ?
         ))
      ORDER BY FIELD(e.relation, 'self') DESC, e.created_at DESC
    `, [familyId, familyId, familyId, familyId]);

    // 当前用户在当前家庭组里是不是管理员：手动添加的成员只有管理员能删
    const amAdmin = await isFamilyAdmin(getPool(), userId, familyId);

    // 获取每个成员的病历/用药数量 + 注入双向授权字段（canModifyHim / heCanModifyMe）
    const eldersWithCount = await Promise.all(elders.map(async (elder) => {
      const [records] = await getPool().query('SELECT COUNT(*) as count FROM records WHERE elder_id = ?', [elder.id]);
      const [meds] = await getPool().query('SELECT COUNT(*) as count FROM medications WHERE elder_id = ?', [elder.id]);

      // 授权状态
      let canModifyHim = false;
      let heCanModifyMe = false;
      // 手动添加的成员（无登录账号，一般是老人或小孩）：家庭组内人人可编辑，不做授权控制
      const manual = elder.relation !== 'self' && isManualMember(elder);

      if (elder.relation === 'self' && elder.user_id === userId) {
        // 自己的 self 档案：双向都允许
        canModifyHim = true;
        heCanModifyMe = true;
      } else if (manual) {
        // 手动添加的成员没有账号，"他能改我" 无从谈起
        canModifyHim = true;
        heCanModifyMe = false;
      } else {
        // 其他成员：查询 member_authorizations 表双向授权
        // 我能否修改他 = 他是否授权了我 (granter=他, grantee=我)
        const [canModifyRows] = await getPool().query(
          'SELECT authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ? LIMIT 1',
          [elder.user_id, userId]
        );
        canModifyHim = canModifyRows.length > 0 && !!canModifyRows[0].authorized;

        // 他能否修改我 = 我是否授权了他 (granter=我, grantee=他)
        const [heCanRows] = await getPool().query(
          'SELECT authorized FROM member_authorizations WHERE granter_user_id = ? AND grantee_user_id = ? LIMIT 1',
          [userId, elder.user_id]
        );
        heCanModifyMe = heCanRows.length > 0 && !!heCanRows[0].authorized;
      }

      return {
        ...elder,
        phone: elder.user_phone || elder.phone || null,
        role: elder.family_role || 'member',
        recordCount: records[0]?.count || 0,
        medCount: meds[0]?.count || 0,
        canModifyHim,
        heCanModifyMe,
        isManual: manual,
        // 删除只对手动添加的成员开放，且仅家庭管理员可操作
        canDelete: manual && amAdmin,
      };
    }));

    // 去重：同一 self 档案可能同时出现在两个条件中
    const seen = new Set();
    const uniqueElders = eldersWithCount.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    res.json({ elders: uniqueElders });
  } catch (err) {
    console.error('Get elders error:', err);
    res.status(500).json({ error: '获取老人档案失败' });
  }
}

// 获取单个老人详情
async function getElder(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    // 查询：当前家庭的成员 OR 家庭组成员的 self 档案
    // LEFT JOIN users 获取 self 档案关联的用户手机号
    const [elders] = await getPool().query(`
      SELECT e.*, u.phone AS user_phone
      FROM elders e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ? AND (
        e.family_id = ?
        OR (e.relation = 'self' AND e.user_id IN (
          SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
          UNION
          SELECT u2.id FROM users u2 WHERE u2.family_id = ?
        ))
      )
    `, [id, familyId, familyId, familyId]);

    if (elders.length === 0) {
      return res.status(404).json({ error: '老人档案不存在' });
    }

    // 详情页要据此决定显示「删除档案」还是不给：手动添加的成员 + 家庭管理员才能删
    const elder = elders[0];
    const manual = elder.relation !== 'self' && isManualMember(elder);
    const amAdmin = await isFamilyAdmin(getPool(), req.user.id, familyId);
    res.json({ elder: { ...elder, isManual: manual, canDelete: manual && amAdmin } });
  } catch (err) {
    console.error('Get elder error:', err);
    res.status(500).json({ error: '获取老人详情失败' });
  }
}

// 添加成员档案
async function addElder(req, res) {
  try {
    const familyId = req.familyId;
    const userId = req.user.id;
    const { name, gender, age, birthDate, bloodType, allergies, conditions, phone, avatar, relation } = req.body;

    if (!name) {
      return res.status(400).json({ error: '姓名不能为空' });
    }

    // 权限校验：仅家庭管理员可添加成员（纵深防御，前端已隐藏非管理员按钮）
    // 角色取当前家庭组内的 user_families.role，避免误用 users.role 全局角色
    if (!await isFamilyAdmin(getPool(), userId, familyId)) {
      return res.status(403).json({ error: '仅家庭管理员可添加成员' });
    }

    const id = uuidv4();
    const elderAvatar = avatar || name.charAt(0);

    await getPool().query(
      `INSERT INTO elders (id, family_id, name, gender, age, birth_date, blood_type, allergies, conditions, phone, avatar, relation, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, name, gender || '未知', age || 0, birthDate || null, bloodType || null, allergies || null, conditions || null, phone || null, elderAvatar, relation || 'other', userId, userId]
    );

    const [elders] = await getPool().query('SELECT * FROM elders WHERE id = ?', [id]);
    res.json({ elder: elders[0] });
  } catch (err) {
    console.error('Add elder error:', err);
    res.status(500).json({ error: '添加老人档案失败' });
  }
}

// 更新老人档案
// 权限：手动添加的成员（无登录账号，一般是老人或小孩）家庭组内人人可编辑，不做授权控制；
// 其余成员沿用 canModifyElder()（本人 / 已获对方授权）。
async function updateElder(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;
    const { name, gender, age, birthDate, bloodType, allergies, conditions, phone, avatar, relation } = req.body;

    // 可见性：当前家庭的成员 OR 家庭组成员的 self 档案
    const [elders] = await getPool().query(`
      SELECT * FROM elders WHERE id = ? AND (
        family_id = ?
        OR (relation = 'self' AND user_id IN (
          SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
          UNION
          SELECT u.id FROM users u WHERE u.family_id = ?
        ))
      )
    `, [id, familyId, familyId, familyId]);
    if (elders.length === 0) {
      return res.status(404).json({ error: '成员档案不存在' });
    }

    const allow = await canModifyElder(getPool(), id, userId, familyId);
    if (!allow) {
      return res.status(403).json({ error: '您无权修改该成员的资料，请先获得授权' });
    }

    // relation='self' 只在注册/转注册时由服务端写入：允许前端改成 self，
    // 手动添加的成员就会变成"没有账号的本人档案"，既删不掉也说得不清
    if (relation === 'self') {
      return res.status(400).json({ error: '不能把成员关系改成本人' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (gender !== undefined) { updates.push('gender = ?'); values.push(gender); }
    if (age !== undefined) { updates.push('age = ?'); values.push(age); }
    if (birthDate !== undefined) { updates.push('birth_date = ?'); values.push(birthDate || null); }
    if (bloodType !== undefined) { updates.push('blood_type = ?'); values.push(bloodType); }
    if (allergies !== undefined) { updates.push('allergies = ?'); values.push(allergies); }
    if (conditions !== undefined) { updates.push('conditions = ?'); values.push(conditions); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
    if (relation !== undefined) { updates.push('relation = ?'); values.push(relation); }

    if (updates.length > 0) {
      updates.push('updated_by = ?');
      values.push(userId);
      values.push(id);
      await getPool().query(
        `UPDATE elders SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    const [updated] = await getPool().query('SELECT * FROM elders WHERE id = ?', [id]);
    res.json({ elder: updated[0] });
  } catch (err) {
    console.error('Update elder error:', err);
    res.status(500).json({ error: '更新老人档案失败' });
  }
}

// 删除成员档案
// 语义：前端按「硬删除」警告（见 App.deleteElder 的确认文案），后端实际做的是
// 「转注册成员 + 解绑」——为该成员分配一个随机账号，把档案与全部关联数据迁到它自己的家庭组，
// 从此不再出现在当前家庭的任何视图里（含药箱）。
// 为什么不做真删：管理员手滑删掉的是老人几年攒下来的病历和用药记录，真删无法挽回；
// 保留数据 + 给新账号留后路，用户侧体感不变，但错误不可逆性被消掉了。
// 权限：仅家庭管理员，且只能删手动添加的成员（绑定登录账号的成员走「移出家庭组」）。
async function deleteElder(req, res) {
  const pool = getPool();
  let conn = null;
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;

    const [elders] = await pool.query('SELECT * FROM elders WHERE id = ? AND family_id = ?', [id, familyId]);
    if (elders.length === 0) {
      return res.status(404).json({ error: '成员档案不存在' });
    }
    const elder = elders[0];

    const undeletable = checkElderDeletable(elder);
    if (undeletable) {
      return res.status(400).json({ error: undeletable });
    }

    if (!await isFamilyAdmin(pool, userId, familyId)) {
      return res.status(403).json({ error: '仅家庭管理员可删除成员' });
    }

    // 随机账号：手机号随机生成（登录用手机号），密码随机且不回传原文
    const account = await generateAccountInfo(pool);
    const newFamilyId = uuidv4();
    const newUserId = uuidv4();
    const inviteCode = await generateInviteCode(pool);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO families (id, name, invite_code) VALUES (?, ?, ?)',
      [newFamilyId, `${elder.name}的家庭`, inviteCode]
    );
    await conn.query(
      'INSERT INTO users (id, name, phone, password, role, family_id, avatar, authorized) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newUserId, elder.name, account.phone, account.passwordHash, 'admin', newFamilyId, elder.avatar || elder.name.charAt(0), true]
    );
    // user_families 在老库里可能不存在，其它代码也一律容错；失败只是新账号少一条索引行，不阻断删除
    try {
      await conn.query(
        'INSERT INTO user_families (id, user_id, family_id, role, is_primary) VALUES (?, ?, ?, ?, 1)',
        ['uf_' + newUserId.slice(0, 8) + '_' + newFamilyId.slice(0, 8), newUserId, newFamilyId, 'admin']
      );
    } catch (e) {
      console.warn('[deleteElder] 写入 user_families 失败，已跳过:', e.message);
    }

    // 档案与全部关联数据一起迁到新家庭组：这样新账号登录后仍能看到自己的病历/用药/药箱
    await conn.query(
      "UPDATE elders SET family_id = ?, user_id = ?, relation = 'self', updated_by = ? WHERE id = ?",
      [newFamilyId, newUserId, userId, id]
    );
    await conn.query('UPDATE records SET family_id = ? WHERE elder_id = ?', [newFamilyId, id]);
    await conn.query('UPDATE medications SET family_id = ? WHERE elder_id = ?', [newFamilyId, id]);
    await conn.query('UPDATE drug_inventory SET family_id = ? WHERE elder_id = ?', [newFamilyId, id]);
    // 长期用药是「谁勾选的」设置项，一并转给新账号，否则这些勾选会跟着旧家庭残留
    await conn.query(
      `UPDATE chronic_medications SET user_id = ?, family_id = ?
       WHERE elder_id = ? OR drug_inventory_id IN (SELECT id FROM drug_inventory WHERE elder_id = ?)`,
      [newUserId, newFamilyId, id, id]
    );

    await conn.commit();

    logger.info('成员已转注册账号并解绑', {
      elderId: id, familyId, operator: userId, newUserId,
      account: account.phone.slice(0, 3) + '****' + account.phone.slice(-4)
    });

    // 不把随机账号回传给前端：前端按硬删除展示，泄露一个无法登录的账号只会让人困惑
    res.json({ message: '成员已删除' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch (e) { /* 回滚失败仅记录 */ } }
    console.error('Delete elder error:', err);
    res.status(500).json({ error: '删除成员失败' });
  } finally {
    if (conn) conn.release();
  }
}

/** 生成一个未被占用的邀请码（families.invite_code 有唯一约束，撞了就重试） */
async function generateInviteCode(pool) {
  for (let i = 0; i < 20; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const [rows] = await pool.query('SELECT id FROM families WHERE invite_code = ? LIMIT 1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('生成邀请码失败，请重试');
}

/**
 * 生成一个未被占用的随机登录账号（手机号）+ 随机密码
 * 手机号用 170 号段（虚拟运营商）拼随机位，撞号就重试；密码只回 bcrypt 哈希。
 */
async function generateAccountInfo(pool) {
  const crypto = require('crypto');
  for (let i = 0; i < 20; i++) {
    const phone = '170' + String(crypto.randomInt(0, 1e8)).padStart(8, '0');
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone]);
    if (exists.length === 0) {
      const raw = crypto.randomBytes(9).toString('base64url');
      return { phone, passwordHash: await bcrypt.hash(raw, 10) };
    }
  }
  throw new Error('生成随机账号失败，请重试');
}

// 将成员移出家庭组（软解绑：保留数据，仅解除家庭归属，使其从家庭各视图含药箱消失）
async function removeFromFamily(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;

    // 找到该成员档案（属于当前家庭）
    const [elders] = await getPool().query(`
      SELECT * FROM elders WHERE id = ? AND (
        family_id = ?
        OR (relation = 'self' AND user_id IN (
          SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
          UNION
          SELECT u.id FROM users u WHERE u.family_id = ?
        ))
      )
    `, [id, familyId, familyId, familyId]);
    if (elders.length === 0) {
      return res.status(404).json({ error: '成员档案不存在' });
    }
    const elder = elders[0];

    // 不能将本人移出家庭组
    if (elder.relation === 'self' && elder.user_id === userId) {
      return res.status(400).json({ error: '不能将本人移出家庭组' });
    }

    // 权限校验：当前用户必须是该家庭管理员（角色取本家庭组内的，不用全局 users.role）
    if (!await isFamilyAdmin(getPool(), userId, familyId)) {
      return res.status(403).json({ error: '仅家庭管理员可移除成员' });
    }

    // 手动添加的成员没有自己的家庭组可回退，解绑等于丢数据 —— 这类成员只走「删除」（转注册账号）
    if (isManualMember(elder)) {
      return res.status(400).json({ error: '该成员为手动添加，请使用「删除」' });
    }

    // 该成员的"缺省家庭组"：注册用户有自己的 users.family_id；纯被监护人无 user_id，无缺省家庭
    let homeFamilyId = null;
    if (elder.user_id) {
      const [urows] = await getPool().query('SELECT family_id FROM users WHERE id = ? LIMIT 1', [elder.user_id]);
      homeFamilyId = urows.length > 0 ? urows[0].family_id : null;
    }

    // 解绑原则：仅解除与本家庭的关联，绝不删除任何资料。
    // 关联数据（长期用药/病历/用药/药箱）统一回退到成员"缺省家庭组"，从本家庭各视图消失但数据保留。
    if (homeFamilyId) {
      await getPool().query(
        `UPDATE chronic_medications SET family_id = ?
         WHERE family_id = ? AND drug_inventory_id IN (SELECT id FROM drug_inventory WHERE elder_id = ? AND family_id = ?)`,
        [homeFamilyId, familyId, elder.id, familyId]
      );
      await getPool().query('UPDATE records SET family_id = ? WHERE elder_id = ? AND family_id = ?', [homeFamilyId, elder.id, familyId]);
      await getPool().query('UPDATE medications SET family_id = ? WHERE elder_id = ? AND family_id = ?', [homeFamilyId, elder.id, familyId]);
      await getPool().query('UPDATE drug_inventory SET family_id = ? WHERE elder_id = ? AND family_id = ?', [homeFamilyId, elder.id, familyId]);
    }

    // 解除成员与本家庭的关联
    if (elder.relation === 'self' && elder.user_id && elder.user_id !== userId) {
      // 其他注册用户通过 user_families 加入本家庭：删除关系行，其 self 档案与数据已回退到缺省家庭组
      await getPool().query('DELETE FROM user_families WHERE user_id = ? AND family_id = ?', [elder.user_id, familyId]);
    } else if (homeFamilyId) {
      // 注册用户（含被监护人）有缺省家庭组：将其档案 family_id 回退到缺省家庭组，不再出现在本家庭
      await getPool().query('UPDATE elders SET family_id = ? WHERE id = ?', [homeFamilyId, elder.id]);
    } else {
      // 纯被监护人（无 user_id、无缺省家庭组）：仅解除关联、不删除任何资料。
      // 因 family_id 为 NOT NULL 且无处可回退，保留其档案与全部关联数据原样不动，避免破坏数据。
      // 该情形在现有"注册加入"体系下不会出现。
      console.warn('[removeFromFamily] 成员无缺省家庭组，跳过解绑以免破坏数据:', elder.id);
    }

    res.json({ message: '已将成员移出家庭组' });
  } catch (err) {
    console.error('Remove from family error:', err);
    res.status(500).json({ error: '移出家庭组失败' });
  }
}

module.exports = {
  getElders,
  getElder,
  addElder,
  updateElder,
  deleteElder,
  removeFromFamily
};
