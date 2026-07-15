const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function fmtDate(d) { if (d instanceof Date) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; } return d; }

// 获取药品库存列表
async function getDrugs(req, res) {
  try {
    const familyId = req.familyId;
    const { status } = req.query;

    let query = 'SELECT * FROM drug_inventory WHERE family_id = ?';
    const params = [familyId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY CASE status WHEN \'expired\' THEN 1 WHEN \'expiring_soon\' THEN 2 ELSE 3 END, expiry_date ASC';

    const [drugs] = await getPool().query(query, params);

    const formattedDrugs = drugs.map(d => ({
      id: d.id,
      familyId: d.family_id,
      elderId: d.elder_id,
      name: d.name,
      specification: d.specification,
      quantity: d.quantity,
      expiryDate: d.expiry_date ? fmtDate(d.expiry_date) : null,
      status: d.status,
      sourcePrescriptionId: d.source_prescription_id,
      note: d.note,
      createdAt: d.created_at
    }));

    // 统计预警
    const [expired] = await getPool().query('SELECT COUNT(*) as count FROM drug_inventory WHERE family_id = ? AND status = ?', [familyId, 'expired']);
    const [expiring] = await getPool().query('SELECT COUNT(*) as count FROM drug_inventory WHERE family_id = ? AND status = ?', [familyId, 'expiring_soon']);

    res.json({
      drugs: formattedDrugs,
      warnings: {
        expired: expired[0]?.count || 0,
        expiringSoon: expiring[0]?.count || 0
      }
    });
  } catch (err) {
    console.error('Get drugs error:', err);
    res.status(500).json({ error: '获取药品库存失败' });
  }
}

// 获取单个药品
async function getDrug(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    const [drugs] = await getPool().query(
      'SELECT * FROM drug_inventory WHERE id = ? AND family_id = ?',
      [id, familyId]
    );

    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    const d = drugs[0];
    res.json({
      drug: {
        id: d.id,
        familyId: d.family_id,
        elderId: d.elder_id,
        name: d.name,
        specification: d.specification,
        quantity: d.quantity,
        expiryDate: d.expiry_date ? fmtDate(d.expiry_date) : null,
        status: d.status,
        sourcePrescriptionId: d.source_prescription_id,
        note: d.note,
        createdAt: d.created_at
      }
    });
  } catch (err) {
    console.error('Get drug error:', err);
    res.status(500).json({ error: '获取药品详情失败' });
  }
}

// 添加药品
async function addDrug(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId, name, specification, quantity, expiryDate, note } = req.body;

    if (!name) {
      return res.status(400).json({ error: '药品名称不能为空' });
    }

    // 计算状态
    let status = 'valid';
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (expiry < now) status = 'expired';
      else if (expiry <= thirtyDaysLater) status = 'expiring_soon';
    }

    const id = uuidv4();

    await getPool().query(
      `INSERT INTO drug_inventory (id, family_id, elder_id, name, specification, quantity, expiry_date, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, elderId || null, name, specification || null, quantity || 1, expiryDate || null, status, note || null]
    );

    const [drugs] = await getPool().query('SELECT * FROM drug_inventory WHERE id = ?', [id]);
    const d = drugs[0];
    res.json({
      drug: {
        id: d.id,
        familyId: d.family_id,
        elderId: d.elder_id,
        name: d.name,
        specification: d.specification,
        quantity: d.quantity,
        expiryDate: d.expiry_date ? fmtDate(d.expiry_date) : null,
        status: d.status,
        note: d.note,
        createdAt: d.created_at
      }
    });
  } catch (err) {
    console.error('Add drug error:', err);
    res.status(500).json({ error: '添加药品失败' });
  }
}

// 更新药品
async function updateDrug(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const { elderId, name, specification, quantity, expiryDate, note } = req.body;

    const [drugs] = await getPool().query('SELECT * FROM drug_inventory WHERE id = ? AND family_id = ?', [id, familyId]);
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    // 重新计算状态
    let status = drugs[0].status;
    const effectiveExpiry = expiryDate !== undefined ? expiryDate : (drugs[0].expiry_date ? fmtDate(drugs[0].expiry_date) : null);
    if (effectiveExpiry) {
      const expiry = new Date(effectiveExpiry);
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (expiry < now) status = 'expired';
      else if (expiry <= thirtyDaysLater) status = 'expiring_soon';
      else status = 'valid';
    }

    const updates = [];
    const values = [];

    if (elderId !== undefined) { updates.push('elder_id = ?'); values.push(elderId || null); }
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (specification !== undefined) { updates.push('specification = ?'); values.push(specification); }
    if (quantity !== undefined) { updates.push('quantity = ?'); values.push(quantity); }
    if (expiryDate !== undefined) { updates.push('expiry_date = ?'); values.push(expiryDate || null); }
    if (note !== undefined) { updates.push('note = ?'); values.push(note); }
    updates.push('status = ?'); values.push(status);

    if (updates.length > 0) {
      values.push(id, familyId);
      await getPool().query(
        `UPDATE drug_inventory SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
        values
      );
    }

    const [updated] = await getPool().query('SELECT * FROM drug_inventory WHERE id = ?', [id]);
    const d = updated[0];
    res.json({
      drug: {
        id: d.id,
        familyId: d.family_id,
        elderId: d.elder_id,
        name: d.name,
        specification: d.specification,
        quantity: d.quantity,
        expiryDate: d.expiry_date ? fmtDate(d.expiry_date) : null,
        status: d.status,
        note: d.note,
        createdAt: d.created_at
      }
    });
  } catch (err) {
    console.error('Update drug error:', err);
    res.status(500).json({ error: '更新药品失败' });
  }
}

// 删除药品
async function deleteDrug(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    const [drugs] = await getPool().query('SELECT * FROM drug_inventory WHERE id = ? AND family_id = ?', [id, familyId]);
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    await getPool().query('DELETE FROM drug_inventory WHERE id = ? AND family_id = ?', [id, familyId]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete drug error:', err);
    res.status(500).json({ error: '删除药品失败' });
  }
}

module.exports = {
  getDrugs,
  getDrug,
  addDrug,
  updateDrug,
  deleteDrug
};
