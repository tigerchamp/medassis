const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// 获取所有成员档案（含自己）
async function getElders(req, res) {
  try {
    const familyId = req.familyId;
    const [elders] = await getPool().query(
      'SELECT * FROM elders WHERE family_id = ? ORDER BY FIELD(relation, "self") DESC, created_at DESC',
      [familyId]
    );

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

    res.json({ elders: eldersWithCount });
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

    const [elders] = await getPool().query(
      'SELECT * FROM elders WHERE id = ? AND family_id = ?',
      [id, familyId]
    );

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
    const { name, gender, age, bloodType, allergies, conditions, phone, avatar, relation } = req.body;

    if (!name) {
      return res.status(400).json({ error: '姓名不能为空' });
    }

    const id = uuidv4();
    const elderAvatar = avatar || name.charAt(0);

    await getPool().query(
      `INSERT INTO elders (id, family_id, name, gender, age, blood_type, allergies, conditions, phone, avatar, relation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, name, gender || '男', age || 0, bloodType || null, allergies || null, conditions || null, phone || null, elderAvatar, relation || 'other']
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
    const { name, gender, age, bloodType, allergies, conditions, phone, avatar, relation } = req.body;

    // 检查权限
    const [elders] = await getPool().query('SELECT * FROM elders WHERE id = ? AND family_id = ?', [id, familyId]);
    if (elders.length === 0) {
      return res.status(404).json({ error: '成员档案不存在' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (gender !== undefined) { updates.push('gender = ?'); values.push(gender); }
    if (age !== undefined) { updates.push('age = ?'); values.push(age); }
    if (bloodType !== undefined) { updates.push('blood_type = ?'); values.push(bloodType); }
    if (allergies !== undefined) { updates.push('allergies = ?'); values.push(allergies); }
    if (conditions !== undefined) { updates.push('conditions = ?'); values.push(conditions); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
    if (relation !== undefined) { updates.push('relation = ?'); values.push(relation); }

    if (updates.length > 0) {
      values.push(id, familyId);
      await getPool().query(
        `UPDATE elders SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
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

    // 检查权限
    const [elders] = await getPool().query('SELECT * FROM elders WHERE id = ? AND family_id = ?', [id, familyId]);
    if (elders.length === 0) {
      return res.status(404).json({ error: '老人档案不存在' });
    }

    // 删除相关的病历、用药、服药记录
    await getPool().query('DELETE FROM records WHERE elder_id = ? AND family_id = ?', [id, familyId]);

    // 先找到该老人的所有用药ID，再删除对应的服药日志
    const [meds] = await getPool().query('SELECT id FROM medications WHERE elder_id = ? AND family_id = ?', [id, familyId]);
    if (meds.length > 0) {
      const medIds = meds.map(m => m.id);
      const placeholders = medIds.map(() => '?').join(',');
      await getPool().query(`DELETE FROM med_logs WHERE med_id IN (${placeholders})`, medIds);
    }

    await getPool().query('DELETE FROM medications WHERE elder_id = ? AND family_id = ?', [id, familyId]);
    await getPool().query('DELETE FROM drug_inventory WHERE elder_id = ? AND family_id = ?', [id, familyId]);
    await getPool().query('DELETE FROM elders WHERE id = ? AND family_id = ?', [id, familyId]);

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
