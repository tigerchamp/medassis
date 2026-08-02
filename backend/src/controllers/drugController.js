const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { resolveDrugCode } = require('../utils/drugLibrary');
const { getEntityFiles, setEntityFiles, deleteEntityFiles } = require('../utils/entityFiles');

/**
 * 获取当前用户及其所在家庭组的全部用户ID（用于私有数据隔离）
 */
async function _getFamilyUserIds(req) {
  const familyId = req.familyId || (req.user && req.user.family_id);
  let userIds = [req.user.id];
  if (familyId) {
    const [rows] = await getPool().query('SELECT id FROM users WHERE family_id = ?', [familyId]);
    const ids = rows.map(r => r.id);
    if (ids.length) userIds = ids;
    if (!userIds.includes(req.user.id)) userIds.push(req.user.id);
  }
  return userIds;
}

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
    quantityUnit: d.quantity_unit || '',
    expiryDate: d.expiry_date ? fmtDate(d.expiry_date) : null,
    status: d.status,
    sourcePrescriptionId: d.source_prescription_id,
    sourceMedicationId: d.source_medication_id,
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
    const images = await getEntityFiles('drug_inventory', drugs[0].id);
    res.json({ drug: { ...formatDrug(drugs[0]), images } });
  } catch (err) {
    console.error('Get drug error:', err);
    res.status(500).json({ error: '获取药品详情失败' });
  }
}

// 添加药品（关联药品库）
async function addDrug(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId, drugCode, name, specification, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, quantity, quantityUnit, expiryDate, note, fileIds } = req.body;

    if (!drugCode && !name) {
      return res.status(400).json({ error: '请选择或输入药品名称' });
    }

    // 关联药品库：前端传入 drugCode 则校验；否则按名称匹配，未匹配则新增入库（写入 owner_user_id 私有数据隔离）
    const familyUserIds = await _getFamilyUserIds(req);
    const resolved = await resolveDrugCode({
      drugCode,
      name,
      specification,
      specDosage,
      specDosageUnit,
      unitCapacity,
      unitCapacityUnit,
      manufacturer,
      ownerUserId: req.user.id,
      familyUserIds
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
        'UPDATE drug_inventory SET quantity = ?, quantity_unit = ? WHERE id = ?',
        [newQuantity, quantityUnit || existingDrug.quantity_unit || null, existingDrug.id]
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
      `INSERT INTO drug_inventory (id, family_id, elder_id, drug_code, name, specification, manufacturer, quantity, quantity_unit, expiry_date, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, elderId || null, finalCode, finalName, finalSpec || null, finalManu || null, quantity || 1, quantityUnit || null, expiryDate || null, status, note || null]
    );

    // 保存关联图片
    if (fileIds && fileIds.length > 0) {
      await setEntityFiles('drug_inventory', id, fileIds);
    }

    const [drugs] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
       FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code WHERE di.id = ?`,
      [id]
    );
    const images = await getEntityFiles('drug_inventory', id);
    res.json({ drug: { ...formatDrug(drugs[0]), images } });
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
    const { elderId, drugCode, name, specification, quantity, quantityUnit, expiryDate, note, fileIds } = req.body;

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
      const familyUserIds = await _getFamilyUserIds(req);
      const resolved = await resolveDrugCode({
        drugCode,
        name: name || drugs[0].name,
        specification: null,
        manufacturer: null,
        ownerUserId: req.user.id,
        familyUserIds
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
    if (quantityUnit !== undefined) { updates.push('quantity_unit = ?'); values.push(quantityUnit || null); }
    if (expiryDate !== undefined) { updates.push('expiry_date = ?'); values.push(expiryDate || null); }
    if (note !== undefined) { updates.push('note = ?'); values.push(note); }

    values.push(id, familyId);
    await getPool().query(
      `UPDATE drug_inventory SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
      values
    );

    // 更新关联图片
    if (fileIds !== undefined) {
      await setEntityFiles('drug_inventory', id, fileIds);
    }

    const [updated] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
       FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code WHERE di.id = ?`,
      [id]
    );
    const images = await getEntityFiles('drug_inventory', id);
    res.json({ drug: { ...formatDrug(updated[0]), images } });
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
    await deleteEntityFiles('drug_inventory', id);
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
  deleteDrug,
  getDrugRecords
};

// 获取药品库存的添加记录（来源于 medications 表的同 drug_code 记录）
async function getDrugRecords(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    // 先获取药品库存信息
    const [drugs] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit
       FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
       WHERE di.id = ? AND di.family_id = ?`,
      [id, familyId]
    );
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    const drug = drugs[0];
    const drugCode = drug.drug_code;

    // 查找所有关联的用药记录（处方来源）
    let medicationRecords = [];
    if (drugCode) {
      const [meds] = await getPool().query(
        `SELECT m.*, COALESCE(d.specification, m.specification) as specification, e.name as elder_name FROM medications m
         LEFT JOIN drugs d ON m.drug_code COLLATE utf8mb4_unicode_ci = d.code
         LEFT JOIN elders e ON m.elder_id = e.id
         WHERE m.family_id = ? AND m.drug_code = ?
         ORDER BY m.created_at DESC`,
        [familyId, drugCode]
      );
      medicationRecords = meds.map(m => ({
        id: m.id,
        elderId: m.elder_id,
        elderName: m.elder_name || '',
        name: m.name,
        specification: m.specification || '',
        dose: m.dose,
        quantity: m.quantity != null ? Number(m.quantity) : 1,
        frequency: m.frequency,
        startDate: fmtDate(m.start_date),
        endDate: fmtDate(m.end_date),
        note: m.note,
        status: m.status,
        createdAt: m.created_at
      }));
    }

    const images = await getEntityFiles('drug_inventory', id);
    res.json({
      drug: { ...formatDrug(drug), images },
      medicationRecords
    });
  } catch (err) {
    console.error('Get drug records error:', err);
    res.status(500).json({ error: '获取药品记录失败' });
  }
}
