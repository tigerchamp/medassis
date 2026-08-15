const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// 获取所有成员档案（含自己）
async function getElders(req, res) {
  try {
    const familyId = req.familyId;
    const userId = req.user.id;

    // 查询：当前家庭的成员 + 家庭组所有成员的 self 档案（跨家庭共享）
    // self 档案根据 user_id + relation='self' 定位，不依赖 family_id
    // 通过 user_families 表找到当前家庭组的所有用户，包含他们的 self 档案
    const [elders] = await getPool().query(`
      SELECT * FROM elders
      WHERE family_id = ?
         OR (relation = 'self' AND user_id IN (
           SELECT uf.user_id FROM user_families uf WHERE uf.family_id = ?
           UNION
           SELECT u.id FROM users u WHERE u.family_id = ?
         ))
      ORDER BY FIELD(relation, 'self') DESC, created_at DESC
    `, [familyId, familyId, familyId]);

    // 获取每个成员的病历和用药数量
    const eldersWithCount = await Promise.all(elders.map(async (elder) => {
      const [records] = await getPool().query('SELECT COUNT(*) as count FROM records WHERE elder_id = ?', [elder.id]);
      const [meds] = await getPool().query('SELECT COUNT(*) as count FROM medications WHERE elder_id = ?', [elder.id]);
      return {
        ...elder,
        recordCount: records[0]?.count || 0,
        medCount: meds[0]?.count || 0
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

    res.json({ elder: elders[0] });
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
async function updateElder(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;
    const { name, gender, age, birthDate, bloodType, allergies, conditions, phone, avatar, relation } = req.body;

    // 检查权限：当前家庭的成员 OR 家庭组成员的 self 档案
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

// 删除老人档案
async function deleteElder(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;

    // 检查权限：当前家庭的成员 OR 家庭组成员的 self 档案
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
      return res.status(404).json({ error: '老人档案不存在' });
    }

    const elder = elders[0];

    // 删除相关的病历、用药、服药记录（按 elder_id 删除，不限制 family_id）
    await getPool().query('DELETE FROM records WHERE elder_id = ?', [id]);

    // 先找到该老人的所有用药ID，再删除对应的服药日志
    const [meds] = await getPool().query('SELECT id FROM medications WHERE elder_id = ?', [id]);
    if (meds.length > 0) {
      const medIds = meds.map(m => m.id);
      const placeholders = medIds.map(() => '?').join(',');
      await getPool().query(`DELETE FROM med_logs WHERE med_id IN (${placeholders})`, medIds);
    }

    await getPool().query('DELETE FROM medications WHERE elder_id = ?', [id]);
    await getPool().query('DELETE FROM drug_inventory WHERE elder_id = ?', [id]);
    await getPool().query('DELETE FROM elders WHERE id = ?', [id]);

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete elder error:', err);
    res.status(500).json({ error: '删除老人档案失败' });
  }
}

module.exports = {
  getElders,
  getElder,
  addElder,
  updateElder,
  deleteElder
};
