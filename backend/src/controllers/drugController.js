const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { resolveDrugCode } = require('../utils/drugLibrary');
const { getEntityFiles, setEntityFiles, deleteEntityFiles } = require('../utils/entityFiles');
const { familyAccessFilter } = require('../utils/familyAccess');

function fmtDateTime(d) {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }
  if (typeof d === 'string' && d.includes('T')) {
    const dt = new Date(d);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      const h = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      const s = String(dt.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}:${s}`;
    }
  }
  return d;
}

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

function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (typeof d === 'string') {
    const dt = new Date(d);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return d;
}

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
  // 分类优先：type1(用户友好名如"肠胃用药") > category(药理学分类) > "其他"
  let category = d.type1 || d.category || '';
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
    category: category,
    createdAt: fmtDateTime(d.created_at)
  };
}

// 获取药品库存列表
async function getDrugs(req, res) {
  try {
    const familyId = req.familyId;
    const { status } = req.query;
    const access = familyAccessFilter(familyId, 'di.');
    const params = access.params;

    // 按 family + name(或 drug_code) 聚合同名药为 1 条记录，返回总数量 + 按人拆分
    let where = `WHERE (${access.sql})`;
    if (status) {
      where += ' AND di.status = ?';
      params.push(status);
    }

    // 1. 获取所有符合条件的 drug_inventory 原始行（不聚合，用于按 elder 拆分后自己拼装）
    const [rows] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1,
              e.name AS elder_name
       FROM drug_inventory di
       LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
       LEFT JOIN elders e ON di.elder_id = e.id
       ${where}
       ORDER BY CASE di.status WHEN 'expired' THEN 1 WHEN 'expiring_soon' THEN 2 ELSE 3 END, di.expiry_date ASC`,
      params
    );

    // 2. 按 name（无 drug_code 时）或 drug_code 分组
    const groupMap = new Map();
    rows.forEach(r => {
      const key = r.drug_code ? `CODE__${r.drug_code}` : `NAME__${r.name}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          _anchor: r,
          _rows: [],
          _quantity: 0,
          _byElder: new Map(),
          _minExpiry: null,
        });
      }
      const g = groupMap.get(key);
      g._rows.push(r);
      const remain = r.remaining_quantity != null ? Number(r.remaining_quantity) : Number(r.quantity || 0);
      g._quantity += Math.max(0, remain);
      const eid = r.elder_id || '__none__';
      const ename = r.elder_name || '未指定';
      if (!g._byElder.has(eid)) g._byElder.set(eid, { elderId: r.elder_id || null, elderName: ename, quantity: 0 });
      g._byElder.get(eid).quantity += Math.max(0, remain);
      // 计算最小有效期（仅统计余量>0的记录）
      if (remain > 0 && r.expiry_date) {
        const expStr = fmtDate(r.expiry_date);
        if (expStr && (!g._minExpiry || expStr < g._minExpiry)) g._minExpiry = expStr;
      }
    });

    // 3. 组装返回的 drugs 列表
    const formattedDrugs = [];
    groupMap.forEach(g => {
      const anchor = g._anchor;
      anchor.quantity = g._quantity;
      // 用余量>0的最小有效期覆盖 anchor 的 expiry_date
      if (g._minExpiry) {
        anchor.expiry_date = g._minExpiry;
      }
      // 重算状态
      if (g._minExpiry) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const exp = new Date(g._minExpiry); exp.setHours(0, 0, 0, 0);
        if (exp < today) anchor.status = 'expired';
        else if (exp <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) anchor.status = 'expiring_soon';
        else anchor.status = 'valid';
      }
      const formatted = formatDrug(anchor);
      formatted.byElder = Array.from(g._byElder.values())
        .sort((a, b) => b.quantity - a.quantity);
      formatted._anchorId = anchor.id;
      formattedDrugs.push(formatted);
    });

    // 预警统计（按 family 统计，不需要聚合）
    const cntAccess = familyAccessFilter(familyId);
    const [expired] = await getPool().query(`SELECT COUNT(*) as count FROM drug_inventory WHERE (${cntAccess.sql}) AND status = ?`, [...cntAccess.params, 'expired']);
    const [expiring] = await getPool().query(`SELECT COUNT(*) as count FROM drug_inventory WHERE (${cntAccess.sql}) AND status = ?`, [...cntAccess.params, 'expiring_soon']);

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

    const access = familyAccessFilter(familyId, 'di.');
    const [drugs] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
       FROM drug_inventory di
       LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
       WHERE di.id = ? AND (${access.sql})`,
      [id, ...access.params]
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

    // 查重：drug_code + 到期日 + 服药人(elder_id) 三维都相同才合并数量，否则按人分开入库
    const matchElderSql = elderId
      ? 'elder_id = ?'
      : '(elder_id IS NULL OR elder_id = "")';
    const matchElderVals = elderId ? [elderId] : [];
    const [existing] = await getPool().query(
      `SELECT * FROM drug_inventory
       WHERE family_id = ? AND drug_code = ?
       AND (expiry_date = ? OR (expiry_date IS NULL AND ? IS NULL))
       AND ${matchElderSql}
       LIMIT 1`,
      [familyId, finalCode, expiryDate || null, expiryDate || null, ...matchElderVals]
    );

    if (existing.length > 0) {
      const existingDrug = existing[0];
      const newQuantity = (existingDrug.quantity || 1) + (quantity || 1);
      const newRemaining = (existingDrug.remaining_quantity != null ? existingDrug.remaining_quantity : (existingDrug.quantity || 1)) + (quantity || 1);
      await getPool().query(
        'UPDATE drug_inventory SET quantity = ?, remaining_quantity = ?, quantity_unit = ?, updated_by = ? WHERE id = ?',
        [newQuantity, newRemaining, quantityUnit || existingDrug.quantity_unit || null, req.user.id, existingDrug.id]
      );
      const [updated] = await getPool().query(
        `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
         FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code WHERE di.id = ?`,
        [existingDrug.id]
      );
      return res.json({ drug: formatDrug(updated[0]), merged: true });
    }

    const id = uuidv4();
    const qty = quantity || 1;
    await getPool().query(
      `INSERT INTO drug_inventory (id, family_id, elder_id, drug_code, name, specification, manufacturer, quantity, remaining_quantity, quantity_unit, expiry_date, status, note, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, elderId || null, finalCode, finalName, finalSpec || null, finalManu || null, qty, qty, quantityUnit || null, expiryDate || null, status, note || null, req.user.id, req.user.id]
    );

    // 保存关联图片
    if (fileIds && fileIds.length > 0) {
      await setEntityFiles('drug_inventory', id, fileIds);
    }

    const [drugs] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
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

    const access = familyAccessFilter(familyId);
    const [drugs] = await getPool().query(`SELECT * FROM drug_inventory WHERE id = ? AND (${access.sql})`, [id, ...access.params]);
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

    updates.push('updated_by = ?');
    values.push(req.user.id);
    values.push(id);
    await getPool().query(
      `UPDATE drug_inventory SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 更新关联图片
    if (fileIds !== undefined) {
      await setEntityFiles('drug_inventory', id, fileIds);
    }

    const [updated] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
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

    const access = familyAccessFilter(familyId);
    const [drugs] = await getPool().query(`SELECT * FROM drug_inventory WHERE id = ? AND (${access.sql})`, [id, ...access.params]);
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    await getPool().query('DELETE FROM drug_inventory WHERE id = ?', [id]);
    await deleteEntityFiles('drug_inventory', id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete drug error:', err);
    res.status(500).json({ error: '删除药品失败' });
  }
}

// 获取当前用户的长期用药设置（带药箱详情）
async function getChronicMeds(req, res) {
  try {
    const userId = req.user.id;
    const familyId = req.familyId;

    const access = familyAccessFilter(familyId, 'di.');
    // 查询：长期用药表 LEFT JOIN 药箱（确保药箱存在且有权限）
    const [rows] = await getPool().query(
      `SELECT cm.id as cm_id, cm.drug_inventory_id, cm.drug_code, cm.drug_name, cm.sort_order, cm.elder_id,
              di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
       FROM chronic_medications cm
       LEFT JOIN drug_inventory di ON cm.drug_inventory_id = di.id
       LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
       WHERE cm.user_id = ? AND cm.family_id = ? AND (${access.sql})
       ORDER BY cm.sort_order ASC, cm.created_at ASC`,
      [userId, familyId, ...access.params]
    );

    const chronicList = [];
    rows.forEach(r => {
      if (r.id) { // 药箱记录存在（没被删掉）才返回
        chronicList.push({
          cmId: r.cm_id,
          drugInventoryId: r.drug_inventory_id,
          drugCode: r.drug_code,
          drugName: r.drug_name,
          elderId: r.elder_id || null, // 长期用药针对的老人（优先 cm 自己的 elder_id，否则前端可退回 drug.elderId）
          sortOrder: r.sort_order,
          drug: formatDrug(r)
        });
      }
    });
    res.json({ chronicMeds: chronicList });
  } catch (err) {
    console.error('Get chronic meds error:', err);
    res.status(500).json({ error: '获取长期用药失败' });
  }
}

// 批量保存长期用药（传入 drug_inventory_ids 数组，全量覆盖）
async function saveChronicMeds(req, res) {
  try {
    const userId = req.user.id;
    const familyId = req.familyId;
    const { drugInventoryIds, elderId } = req.body;
    const ids = Array.isArray(drugInventoryIds) ? drugInventoryIds : [];

    const pool = getPool();

    // 校验：确保每个 drug_inventory_id 都属于当前家庭且有权限
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const access = familyAccessFilter(familyId, 'di.');
      const [validRows] = await pool.query(
        `SELECT di.id, di.drug_code, di.name FROM drug_inventory di 
         WHERE di.id IN (${placeholders}) AND (${access.sql})`,
        [...ids, ...access.params]
      );
      if (validRows.length !== ids.length) {
        // 找出非法ID
        const validIds = new Set(validRows.map(r => r.id));
        const invalid = ids.filter(id => !validIds.has(id));
        return res.status(400).json({ error: `药品ID无效或无权限: ${invalid.join(', ')}` });
      }

      // 在事务里删除旧记录并写入新记录
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          'DELETE FROM chronic_medications WHERE user_id = ? AND family_id = ?',
          [userId, familyId]
        );
        const { v4: uuidv4 } = require('uuid');
        for (let i = 0; i < validRows.length; i++) {
          const r = validRows[i];
          await conn.query(
            `INSERT INTO chronic_medications (id, user_id, family_id, elder_id, drug_inventory_id, drug_code, drug_name, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), userId, familyId, elderId || null, r.id, r.drug_code || null, r.name, i]
          );
        }
        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        throw txErr;
      } finally {
        conn.release();
      }
    } else {
      // 空数组：清空所有
      await pool.query('DELETE FROM chronic_medications WHERE user_id = ? AND family_id = ?', [userId, familyId]);
    }

    // 返回更新后的列表
    return getChronicMeds(req, res);
  } catch (err) {
    console.error('Save chronic meds error:', err);
    res.status(500).json({ error: '保存长期用药失败' });
  }
}

module.exports = {
  getDrugs,
  getDrug,
  addDrug,
  updateDrug,
  deleteDrug,
  getDrugRecords,
  updateInventoryItem,
  getChronicMeds,
  saveChronicMeds
};

// 更新单条入库记录（有效期/余量）
async function updateInventoryItem(req, res) {
  try {
    const { id } = req.params;
    const { expiryDate, remainingQuantity } = req.body;
    const familyId = req.familyId;

    const access = familyAccessFilter(familyId);
    const [rows] = await getPool().query(
      `SELECT id FROM drug_inventory WHERE id = ? AND (${access.sql})`,
      [id, ...access.params]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }

    const updates = [];
    const params = [];
    if (expiryDate !== undefined) {
      updates.push('expiry_date = ?');
      params.push(expiryDate || null);
    }
    if (remainingQuantity !== undefined) {
      updates.push('remaining_quantity = ?');
      params.push(remainingQuantity);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      params.push(id);
      await getPool().query(
        `UPDATE drug_inventory SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // 重新计算状态
    const [item] = await getPool().query('SELECT expiry_date, remaining_quantity FROM drug_inventory WHERE id = ?', [id]);
    if (item.length > 0) {
      const expDate = item[0].expiry_date;
      const remain = item[0].remaining_quantity;
      let status = 'valid';
      if (remain != null && remain <= 0) status = 'valid';
      else if (expDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const exp = new Date(expDate); exp.setHours(0, 0, 0, 0);
        if (exp < today) status = 'expired';
        else if (exp <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) status = 'expiring_soon';
      }
      await getPool().query('UPDATE drug_inventory SET status = ? WHERE id = ?', [status, id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update inventory item error:', err);
    res.status(500).json({ error: '更新失败' });
  }
}

// 药品详情：按 family+name 聚合同名药，返回总库存、按服药人拆分、以及每条入库历史（即"添加记录"）
async function getDrugRecords(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    // 先找到 anchor 行，确定要查的药名/编码
    const access = familyAccessFilter(familyId, 'di.');
    const [anchors] = await getPool().query(
      `SELECT di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
       FROM drug_inventory di LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
       WHERE di.id = ? AND (${access.sql})`,
      [id, ...access.params]
    );
    if (anchors.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }
    const anchor = anchors[0];

    // 根据 anchor 查 family 下所有同名/同编码的 drug_inventory 行（每一行 = 一次入库记录）
    const whereCode = anchor.drug_code ? 'di.drug_code COLLATE utf8mb4_unicode_ci = ?' : 'di.name = ?';
    const whereVal = anchor.drug_code ? anchor.drug_code : anchor.name;
    const fullAccess = familyAccessFilter(familyId, 'di.');
    const [logs] = await getPool().query(
      `SELECT di.*, e.name AS elder_name, r.id AS record_id, r.record_no AS record_no
       FROM drug_inventory di
       LEFT JOIN elders e ON di.elder_id = e.id
       LEFT JOIN records r ON di.source_prescription_id = r.id
       WHERE (${fullAccess.sql}) AND ${whereCode}
       ORDER BY di.created_at DESC`,
      [...fullAccess.params, whereVal]
    );

    if (logs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    // 聚合：总剩余数量 + 按 elder 拆分（基于 remaining_quantity）
    let totalQty = 0;
    const byElderMap = new Map();
    logs.forEach(l => {
      const q = l.remaining_quantity != null ? Number(l.remaining_quantity) : Number(l.quantity || 0);
      totalQty += Math.max(0, q);
      const eid = l.elder_id || '__none__';
      const ename = l.elder_name || '未指定';
      if (!byElderMap.has(eid)) byElderMap.set(eid, { elderId: l.elder_id || null, elderName: ename, quantity: 0 });
      byElderMap.get(eid).quantity += Math.max(0, q);
    });
    const byElder = Array.from(byElderMap.values()).sort((a, b) => b.quantity - a.quantity);

    // 主 drug 对象（属性用 anchor，quantity 覆盖为总数）
    anchor.quantity = totalQty;
    const mainDrug = formatDrug(anchor);
    mainDrug.byElder = byElder;

    // inventoryLogs = 每条入库历史（用于前端"添加记录"表格）
    const inventoryLogs = logs.map(l => {
      const qty = l.quantity != null ? Number(l.quantity) : 0;
      const remain = l.remaining_quantity != null ? Number(l.remaining_quantity) : qty;
      return {
        id: l.id,
        elderId: l.elder_id || null,
        elderName: l.elder_name || '未指定',
        quantity: qty,
        remainingQuantity: remain,
        depleted: remain <= 0,
        quantityUnit: l.quantity_unit || '盒',
        expiryDate: fmtDate(l.expiry_date),
        createdAt: fmtDate(l.created_at),
        recordId: l.record_id || '',
        recordNo: l.record_no || ''
      };
    });

    // 图片取第一条 anchor 的
    const images = await getEntityFiles('drug_inventory', anchor.id);
    res.json({
      drug: { ...mainDrug, images },
      inventoryLogs
    });
  } catch (err) {
    console.error('Get drug records error:', err);
    res.status(500).json({ error: '获取药品记录失败' });
  }
}
