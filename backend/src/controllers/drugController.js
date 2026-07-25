const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { resolveDrugCode } = require('../utils/drugLibrary');

function fmtDate(d) { if (d instanceof Date) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; } return d; }

function computeStatus(expiryDate, currentStatus) {
  let status = currentStatus || 'valid';
  if (expiryDate) {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (expiry < now) status = 'expired';
    else if (expiry <= thirtyDaysLater) status = 'expiring_soon';
    else status = 'valid';
  }
  return status;
}

function formatDrug(d) {
  return {
    id: d.id,
    familyId: d.family_id,
    elderId: d.elder_id,
    drugCode: d.drug_code,
    name: d.name,
    specification: d.specification,
    specDosage: d.spec_dosage != null ? Number(d.spec_dosage) : null,
    specDosageUnit: d.spec_dosage_unit || '',
    unitCapacity: d.unit_capacity != null ? Number(d.unit_capacity) : null,
    unitCapacityUnit: d.unit_capacity_unit || '',
    manufacturer: d.manufacturer,
    quantity: d.quantity,
    expiryDate: d.expiry_date ? fmtDate(d.expiry_date) : null,
    status: d.status,
    sourcePrescriptionId: d.source_prescription_id,
    note: d.note,
    createdAt: d.created_at
  };
}

// 获取药品库存列表
async function getDrugs(req, res) {
  try {
    const familyId = req.familyId;
    const { status } = req.query;

    let query = `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
      FROM drug_inventory di
      LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
      WHERE di.family_id = ?`;
    const params = [familyId];

    if (status) {
      query += ' AND di.status = ?';
      params.push(status);
    }

    query += ' ORDER BY CASE di.status WHEN \'expired\' THEN 1 WHEN \'expiring_soon\' THEN 2 ELSE 3 END, di.expiry_date ASC';

    const [drugs] = await getPool().query(query, params);
    const formattedDrugs = drugs.map(formatDrug);

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
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
       FROM drug_inventory di
       LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
       WHERE di.id = ? AND di.family_id = ?`,
      [id, familyId]
    );

    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }
    res.json({ drug: formatDrug(drugs[0]) });
  } catch (err) {
    console.error('Get drug error:', err);
    res.status(500).json({ error: '获取药品详情失败' });
  }
}

// 添加药品（关联药品库）
async function addDrug(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId, drugCode, name, specification, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, quantity, expiryDate, note } = req.body;

    if (!drugCode && !name) {
      return res.status(400).json({ error: '请选择或输入药品名称' });
    }

    // 关联药品库：前端传入 drugCode 则校验；否则按名称匹配，未匹配则新增入库
    const resolved = await resolveDrugCode({
      drugCode,
      name,
      specification,
      specDosage,
      specDosageUnit,
      unitCapacity,
      unitCapacityUnit,
      manufacturer
    });

    const finalName = resolved.name;
    const finalSpec = resolved.specification;
    const finalManu = resolved.manufacturer;
    const finalCode = resolved.code;
    const status = computeStatus(expiryDate, 'valid');

    // 查重：以 drug_code + 到期日 为去重键
    const [existing] = await getPool().query(
      `SELECT * FROM drug_inventory
       WHERE family_id = ? AND drug_code = ?
       AND (expiry_date = ? OR (expiry_date IS NULL AND ? IS NULL))
       LIMIT 1`,
      [familyId, finalCode, expiryDate || null, expiryDate || null]
    );

    if (existing.length > 0) {
      const existingDrug = existing[0];
      const newQuantity = (existingDrug.quantity || 1) + (quantity || 1);
      await getPool().query(
        'UPDATE drug_inventory SET quantity = ? WHERE id = ?',
        [newQuantity, existingDrug.id]
      );
      const [updated] = await getPool().query(
        `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
         FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code WHERE di.id = ?`,
        [existingDrug.id]
      );
      return res.json({ drug: formatDrug(updated[0]), merged: true });
    }

    const id = uuidv4();
    await getPool().query(
      `INSERT INTO drug_inventory (id, family_id, elder_id, drug_code, name, specification, manufacturer, quantity, expiry_date, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, elderId || null, finalCode, finalName, finalSpec || null, finalManu || null, quantity || 1, expiryDate || null, status, note || null]
    );

    const [drugs] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
       FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code WHERE di.id = ?`,
      [id]
    );
    res.json({ drug: formatDrug(drugs[0]) });
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
    const { elderId, drugCode, name, specification, quantity, expiryDate, note } = req.body;

    const [drugs] = await getPool().query('SELECT * FROM drug_inventory WHERE id = ? AND family_id = ?', [id, familyId]);
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    // 若传入 drugCode 或 name 变更，则重新关联药品库
    let finalCode = drugs[0].drug_code;
    let finalName = drugs[0].name;
    let finalSpec = drugs[0].specification;
    let finalManu = drugs[0].manufacturer;

    if (drugCode || name) {
      const resolved = await resolveDrugCode({
        drugCode,
        name: name || drugs[0].name,
        specification: null,
        manufacturer: null
      });
      finalCode = resolved.code;
      finalName = resolved.name;
      finalSpec = resolved.specification || drugs[0].specification;
      finalManu = resolved.manufacturer || drugs[0].manufacturer;
    }

    const effectiveExpiry = expiryDate !== undefined ? expiryDate : (drugs[0].expiry_date ? fmtDate(drugs[0].expiry_date) : null);
    const status = computeStatus(effectiveExpiry, drugs[0].status);

    const updates = [
      'drug_code = ?', 'name = ?', 'specification = ?', 'manufacturer = ?',
      'status = ?'
    ];
    const values = [finalCode, finalName, specification !== undefined ? specification : finalSpec, finalManu, status];

    if (elderId !== undefined) { updates.push('elder_id = ?'); values.push(elderId || null); }
    if (quantity !== undefined) { updates.push('quantity = ?'); values.push(quantity); }
    if (expiryDate !== undefined) { updates.push('expiry_date = ?'); values.push(expiryDate || null); }
    if (note !== undefined) { updates.push('note = ?'); values.push(note); }

    values.push(id, familyId);
    await getPool().query(
      `UPDATE drug_inventory SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
      values
    );

    const [updated] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
       FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code WHERE di.id = ?`,
      [id]
    );
    res.json({ drug: formatDrug(updated[0]) });
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
