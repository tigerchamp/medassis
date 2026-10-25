const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { resolveDrugCode } = require('../utils/drugLibrary');
const { getEntityFiles, setEntityFiles, deleteEntityFiles } = require('../utils/entityFiles');
const { familyAccessFilter, canModifyElder } = require('../utils/familyAccess');

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
    const [rows] = await getPool().query(
      `SELECT id FROM users WHERE family_id = ?
       UNION
       SELECT u.id FROM users u INNER JOIN user_families uf ON uf.user_id = u.id WHERE uf.family_id = ?`,
      [familyId, familyId]
    );
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
    const userId = req.user.id;
    const { elderId, drugCode, name, specification, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, quantity, quantityUnit, expiryDate, note, fileIds } = req.body;

    if (!drugCode && !name) {
      return res.status(400).json({ error: '请选择或输入药品名称' });
    }

    // 药箱：只能给自己或被授权修改的成员添加药品
    if (elderId) {
      const allow = await canModifyElder(getPool(), elderId, userId);
      if (!allow) {
        return res.status(403).json({ error: '您无权给该成员添加药品，请先获得授权' });
      }
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
    const userId = req.user.id;
    const { elderId, drugCode, name, specification, quantity, quantityUnit, expiryDate, note, fileIds } = req.body;

    const access = familyAccessFilter(familyId);
    const [drugs] = await getPool().query(`SELECT * FROM drug_inventory WHERE id = ? AND (${access.sql})`, [id, ...access.params]);
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    // 药箱：只能修改自己或被授权修改的成员的药品
    const targetElderId = elderId || drugs[0].elder_id;
    if (targetElderId) {
      const allow = await canModifyElder(getPool(), targetElderId, userId);
      if (!allow) {
        return res.status(403).json({ error: '您无权修改该成员的药品，请先获得授权' });
      }
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
    const userId = req.user.id;

    const access = familyAccessFilter(familyId);
    const [drugs] = await getPool().query(`SELECT * FROM drug_inventory WHERE id = ? AND (${access.sql})`, [id, ...access.params]);
    if (drugs.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }

    // 药箱：只能删除自己或被授权修改的成员的药品
    const targetElderId = drugs[0].elder_id;
    if (targetElderId) {
      const allow = await canModifyElder(getPool(), targetElderId, userId);
      if (!allow) {
        return res.status(403).json({ error: '您无权删除该成员的药品，请先获得授权' });
      }
    }

    await getPool().query('DELETE FROM drug_inventory WHERE id = ?', [id]);
    await deleteEntityFiles('drug_inventory', id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete drug error:', err);
    res.status(500).json({ error: '删除药品失败' });
  }
}

// 删除某个服药人的长期用药（保存时的全量覆盖用）
// 按 elder 归属删，不按 user_id + family_id 一把删：同一个登录账号会替家里好几个人设置长期用药，
// 一把删会让「给成员 B 保存 → 成员 A 的长期用药全没了」。
// elder_id 为 NULL 的历史数据按库存归属 di.elder_id 兜底判定；库存也没归属（都为 NULL）的残留行一并清掉，
// 否则它们占着 UNIQUE(user_id, drug_inventory_id)，回头再勾同一个药会插不进去。
const DELETE_CHRONIC_OF_ELDER_SQL = `
  DELETE cm FROM chronic_medications cm
  LEFT JOIN drug_inventory di ON cm.drug_inventory_id = di.id
  WHERE cm.user_id = ? AND cm.family_id = ?
    AND (cm.elder_id = ? OR (cm.elder_id IS NULL AND (di.elder_id = ? OR di.elder_id IS NULL)))`;
const DELETE_CHRONIC_ALL_OF_USER_SQL = 'DELETE FROM chronic_medications WHERE user_id = ? AND family_id = ?';
function deleteChronicParams(userId, familyId, elderId) {
  return elderId ? [userId, familyId, elderId, elderId] : [userId, familyId];
}
function deleteChronicSql(elderId) {
  return elderId ? DELETE_CHRONIC_OF_ELDER_SQL : DELETE_CHRONIC_ALL_OF_USER_SQL;
}

// 获取长期用药设置（带药箱详情）
// 按 elderId（服药人）过滤，不按设置人过滤——因为查看家人资料时需要显示该家人的长期用药

async function getChronicMeds(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId } = req.query;

    // 简单 LEFT JOIN：chronic_medications 本身有 family_id 做权限隔离
    // 不在 ON 子句放 familyAccessFilter，避免权限不匹配时 di.* 全 null 被丢弃
    // elder_id 分别取别名：cm.elder_id 是"为谁设置的"，di.elder_id 是"库存归谁"，
    // di.* 会覆盖同名字段，不区分别名会拿错
    let sql = `SELECT cm.id as cm_id, cm.drug_inventory_id, cm.drug_code, cm.drug_name, cm.sort_order,
            cm.elder_id AS cm_elder_id, di.elder_id AS di_elder_id,
            di.*, d.spec_dosage, d.spec_dosage_unit, d.unit_capacity, d.unit_capacity_unit, d.category, d.type1
     FROM chronic_medications cm
     LEFT JOIN drug_inventory di ON cm.drug_inventory_id = di.id
     LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
     WHERE cm.family_id = ?`;
    const params = [familyId];

    // 按 elderId（服药人）过滤：cm.elder_id 优先，为 null 时用 di.elder_id 兜底
    if (elderId) {
      sql += ` AND (cm.elder_id = ? OR (cm.elder_id IS NULL AND di.elder_id = ?))`;
      params.push(elderId, elderId);
    }

    sql += ` ORDER BY cm.sort_order ASC, cm.created_at ASC`;

    const [rows] = await getPool().query(sql, params);

    // 聚合全家庭的库存行：同一个药可能有多条入库记录（买新药时有效期不同就不会合并），
    // 倒计时必须按"该服药人名下所有同药入库记录的余量合计"来算，否则永远读的是最初那一条。
    const agg = await _aggregateInventory(getPool(), familyId);

    const chronicList = [];
    const seenDrug = new Set();
    rows.forEach(r => {
      const elderKey = r.cm_elder_id || r.di_elder_id || '__none__';
      const drugKey = r.drug_code ? `CODE__${r.drug_code}` : `NAME__${r.drug_name || ''}`;
      // 同一个药被勾选了多条入库记录时只保留一条，避免倒计时卡片重复且数量翻倍
      const dedupeKey = `${drugKey}||${elderKey}`;
      if (seenDrug.has(dedupeKey)) return;
      seenDrug.add(dedupeKey);

      // 用聚合值覆盖单条库存行的 quantity / expiryDate / status
      const a = agg.get(dedupeKey);
      if (a) {
        if (a.quantity != null) r.quantity = a.quantity;
        if (a.minExpiry) r.expiry_date = a.minExpiry;
        if (a.minExpiry) {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const exp = new Date(a.minExpiry); exp.setHours(0, 0, 0, 0);
          if (exp < today) r.status = 'expired';
          else if (exp <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)) r.status = 'expiring_soon';
          else r.status = 'valid';
        }
      }

      // 即使 drug_inventory 被删除（di.id 为 null），也返回 chronic 记录，用 cm.drug_name 兜底
      const hasInv = !!r.id;
      chronicList.push({
        cmId: r.cm_id,
        drugInventoryId: r.drug_inventory_id,
        drugCode: r.drug_code,
        drugName: r.drug_name,
        elderId: r.cm_elder_id || r.di_elder_id || null,
        sortOrder: r.sort_order,
        drug: hasInv ? formatDrug(r) : {
          id: r.drug_inventory_id,
          drugCode: r.drug_code,
          name: r.drug_name,
          quantity: 0,
          quantityUnit: '',
          unitCapacity: null,
          unitCapacityUnit: '',
          specDosage: null,
          specDosageUnit: '',
          category: '',
          elderId: null,
          expiryDate: null,
          status: 'unknown',
          createdAt: null
        }
      });
    });
    // saveChronicMeds 中转过来的用药计划联动结果（新建/恢复/停止条数），供前端提示
    res.json({
      chronicMeds: chronicList,
      planSync: req._chronicPlanSync || { created: 0, restored: 0, ended: 0 }
    });
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

    // 权限校验：必须是本人或被授权修改
    if (elderId) {
      const allow = await canModifyElder(getPool(), elderId, userId);
      if (!allow) {
        return res.status(403).json({ error: '您无权修改该成员的长期用药，请先获得授权' });
      }
    }

    const pool = getPool();

    // 本次勾选前后的差值用于联动「用药计划」：本次生效前的旧集合要先读出来
    // 范围限定在当前 elder（服药人），避免牵连同家庭其他成员的长期用药/计划
    let prevRows = [];
    if (elderId) {
      [prevRows] = await pool.query(
        `SELECT cm.drug_inventory_id, cm.drug_code, cm.drug_name
         FROM chronic_medications cm
         LEFT JOIN drug_inventory di ON cm.drug_inventory_id = di.id
         WHERE cm.user_id = ? AND cm.family_id = ?
           AND (cm.elder_id = ? OR (cm.elder_id IS NULL AND di.elder_id = ?))`,
        [userId, familyId, elderId, elderId]
      );
    }

    // 校验：确保每个 drug_inventory_id 都属于当前家庭且有权限
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const access = familyAccessFilter(familyId, 'di.');
      const [validRows] = await pool.query(
        `SELECT di.id, di.drug_code, di.name, di.specification, d.unit_capacity_unit
         FROM drug_inventory di
         LEFT JOIN drugs d ON di.drug_code COLLATE utf8mb4_unicode_ci = d.code
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
        // 只清当前服药人（elder）的长期用药，不能跨成员清：
        // 同一个登录账号可以替家里几个人设置长期用药，早先的 DELETE 只按 user_id + family_id，
        // 给成员 B 保存时会把成员 A 的长期用药一起删掉。
        await conn.query(deleteChronicSql(elderId), deleteChronicParams(userId, familyId, elderId));
        const { v4: uuidv4 } = require('uuid');
        for (let i = 0; i < validRows.length; i++) {
          const r = validRows[i];
          await conn.query(
            `INSERT INTO chronic_medications (id, user_id, family_id, elder_id, drug_inventory_id, drug_code, drug_name, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), userId, familyId, elderId || null, r.id, r.drug_code || null, r.name, i]
          );
        }
        // 联动「用药计划」：新增勾选的恢复/新建，取消勾选的结束
        req._chronicPlanSync = await _syncMedicationPlans(conn, {
          familyId, userId, elderId, prevRows, currentRows: validRows
        });
        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        throw txErr;
      } finally {
        conn.release();
      }
    } else {
      // 空数组：清空当前服药人的（同样是只清这个 elder，不牵连其他成员）
      await pool.query(deleteChronicSql(elderId), deleteChronicParams(userId, familyId, elderId));
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        req._chronicPlanSync = await _syncMedicationPlans(conn, {
          familyId, userId, elderId, prevRows, currentRows: []
        });
        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        throw txErr;
      } finally {
        conn.release();
      }
    }

    // 返回更新后的列表
    return getChronicMeds(req, res);
  } catch (err) {
    console.error('Save chronic meds error:', err);
    res.status(500).json({ error: '保存长期用药失败' });
  }
}

/**
 * 把家庭内所有库存行按「药品 + 服药人」聚合，返回余量合计与最近有效期。
 *
 * 同一个药常有多条入库记录：addDrug 只在 drug_code + expiry_date + elder_id 三者全同时才合并，
 * 买新药时有效期几乎必然不同，于是新建一条。倒计时若只读某一条，数量永远不涨（一直显示 0 天）。
 * 口径与 getDrugs 保持一致：余量 = remaining_quantity，为 NULL 时退回 quantity。
 *
 * @returns {Map<string, {quantity:number, minExpiry:string|null}>}
 *          key = `${drug_code 或 name}||${elder_id 或 '__none__'}`
 */
async function _aggregateInventory(pool, familyId) {
  const access = familyAccessFilter(familyId, 'di.');
  const [rows] = await pool.query(
    `SELECT di.drug_code, di.name, di.elder_id, di.quantity, di.remaining_quantity, di.expiry_date
     FROM drug_inventory di
     WHERE (${access.sql})`,
    access.params
  );
  const map = new Map();
  for (const r of rows) {
    const drugKey = r.drug_code ? `CODE__${r.drug_code}` : `NAME__${r.name || ''}`;
    const key = `${drugKey}||${r.elder_id || '__none__'}`;
    if (!map.has(key)) map.set(key, { quantity: 0, minExpiry: null });
    const g = map.get(key);
    const remain = r.remaining_quantity != null ? Number(r.remaining_quantity) : Number(r.quantity || 0);
    g.quantity += Math.max(0, remain);
    // 只统计还有余量的记录，已吃完的旧批次不该占用"最近有效期"
    if (remain > 0 && r.expiry_date) {
      const expStr = fmtDate(r.expiry_date);
      if (expStr && (!g.minExpiry || expStr < g.minExpiry)) g.minExpiry = expStr;
    }
  }
  return map;
}

/**
 * 长期用药 → 用药计划 联动
 * - 新勾选的药品：该成员名下 history 里有 ended 计划则恢复；已有 active 则不动；
 *   都没有时按「早上一次、每次 1 个单位剂量」新建，用法用量交给用户自行核对
 * - 取消勾选的药品：结束该成员名下的 active 计划
 *
 * 只写 medications 表，不走 medicationController.addMedication —— 后者会调
 * _syncToDrugInventory() 按 drug_code 给已有库存数量 +1，勾选已有药品会凭空多出一盒。
 *
 * @returns {{created:number, restored:number, ended:number}}
 */
async function _syncMedicationPlans(conn, { familyId, userId, elderId, prevRows, currentRows }) {
  const summary = { created: 0, restored: 0, ended: 0 };
  // 没有 elderId 时无法界定计划归属，跳过联动，避免误伤其他成员
  if (!elderId) return summary;

  const { v4: uuidv4 } = require('uuid');
  const key = (row) => (row.drug_code || row.drugCode || null);
  const nameOf = (row) => row.drug_name || row.name || '';
  const prevIds = new Set((prevRows || []).map(r => r.drug_inventory_id));
  const curIds = new Set((currentRows || []).map(r => r.id));

  const added = (currentRows || []).filter(r => !prevIds.has(r.id));
  const removed = (prevRows || []).filter(r => !curIds.has(r.drug_inventory_id));

  // 计划归属范围：本家庭 + 本服药人
  const scopeSql = 'family_id = ? AND elder_id = ?';
  const scopeVals = [familyId, elderId];
  // 匹配条件：优先按 drug_code，为空时退回药品名
  const matchSql = (row) => {
    const code = key(row);
    return code ? { sql: 'drug_code = ?', params: [code] }
                : { sql: 'name = ?', params: [nameOf(row)] };
  };

  for (const row of added) {
    const m = matchSql(row);
    const base = `SELECT id, status FROM medications WHERE ${scopeSql} AND ${m.sql}`;
    const [rows] = await conn.query(base, [...scopeVals, ...m.params]);
    if (rows.some(r => r.status === 'active')) continue;              // 已有在用计划，不重复建
    const ended = rows.filter(r => r.status === 'ended');
    if (ended.length) {                                               // 历史计划 → 直接恢复
      await conn.query(
        `UPDATE medications SET status = 'active', end_date = NULL, updated_by = ? WHERE id = ?`,
        [userId, ended[0].id]
      );
      summary.restored += 1;
      continue;
    }
    // 没有历史计划：不知道真实用法用量，按「早上一次、每次 1 个单位剂量」兜底，
    // 剂量单位取药品的单位容量单位（片/粒/袋…），取不到兜底「片」
    const unit = row.unit_capacity_unit || '片';
    await conn.query(
      `INSERT INTO medications (id, elder_id, family_id, drug_code, name, specification,
        dose, dose_amount, dose_unit, quantity, quantity_unit, frequency, times,
        start_date, note, reminder, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, 1, 'active', ?, ?)`,
      [uuidv4(), elderId, familyId, row.drug_code || null, row.name, row.specification || null,
       `1${unit}`, 1, unit, 1, '盒', 1, JSON.stringify(['08:00']),
       '由长期用药自动生成，用法用量请自行核对修改', userId, userId]
    );
    summary.created += 1;
  }

  for (const row of removed) {
    const m = matchSql({ drug_code: row.drug_code, drug_name: row.drug_name });
    const [rs] = await conn.query(
      `UPDATE medications SET status = 'ended', end_date = CURDATE(), updated_by = ?
       WHERE ${scopeSql} AND ${m.sql} AND status = 'active'`,
      [userId, ...scopeVals, ...m.params]
    );
    summary.ended += rs.affectedRows || 0;
  }

  return summary;
}

// 自动消耗计算：根据家庭组里每个人的用药计划，自动扣减药品库存余量
async function autoConsume(req, res) {
  try {
    const familyId = req.familyId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. 获取家庭组所有活跃用药计划，JOIN drugs 表拿单位容量
    const access = familyAccessFilter(familyId, 'm.');
    const [meds] = await getPool().query(`
      SELECT m.id, m.elder_id, m.family_id, m.drug_code, m.name,
             m.dose_amount, m.dose_unit, m.frequency, m.times,
             m.start_date, m.end_date, m.status, m.created_at,
             d.unit_capacity, d.unit_capacity_unit
      FROM medications m
      LEFT JOIN drugs d ON m.drug_code COLLATE utf8mb4_unicode_ci = d.code
      WHERE (${access.sql}) AND m.status = 'active'
    `, access.params);

    let totalConsumed = 0;
    let updatedRecords = 0;

    for (const med of meds) {
      // 2. 计算每日消耗量（转换为库存单位）
      let freq = med.frequency;
      if ((!freq || freq <= 0) && med.times) {
        try { freq = JSON.parse(med.times).length; } catch { freq = 1; }
      }
      if (!freq || freq <= 0) freq = 1;

      const doseAmount = Number(med.dose_amount) || 1;
      const unitCapacity = Number(med.unit_capacity) || 0;

      // 如果有单位容量且剂量单位与包装单位一致，可以换算
      // 否则按 1:1 处理（每次消耗 1 个库存单位）
      let dailyConsumption;
      if (unitCapacity > 0 && med.dose_unit && med.unit_capacity_unit &&
          med.dose_unit === med.unit_capacity_unit) {
        // 例如：每日3次×每次2片=6片，每盒20片 → 6/20=0.3盒/天
        dailyConsumption = (freq * doseAmount) / unitCapacity;
      } else if (unitCapacity > 0) {
        // 单位不一致但有容量，尝试按数值换算
        dailyConsumption = (freq * doseAmount) / unitCapacity;
      } else {
        // 无容量信息，无法换算，跳过
        continue;
      }

      if (dailyConsumption <= 0) continue;

      // 3. 找到匹配的库存记录（drug_code + elder_id, remaining_quantity > 0）
      const invAccess = familyAccessFilter(familyId, 'di.');
      const [invRows] = await getPool().query(`
        SELECT di.id, di.remaining_quantity, di.last_auto_calc_date, di.created_at, di.expiry_date
        FROM drug_inventory di
        WHERE (${invAccess.sql})
          AND di.remaining_quantity > 0
          AND ${med.drug_code ? 'di.drug_code = ?' : 'di.name = ?'}
          AND di.elder_id ${med.elder_id ? '= ?' : 'IS NULL'}
        ORDER BY di.expiry_date ASC, di.created_at ASC
      `, [
        ...invAccess.params,
        med.drug_code || med.name,
        ...(med.elder_id ? [med.elder_id] : [])
      ].filter(v => v !== undefined));

      if (invRows.length === 0) continue;

      for (const inv of invRows) {
        // 4. 计算自上次计算以来的天数
        const lastCalc = inv.last_auto_calc_date ? new Date(inv.last_auto_calc_date) : new Date(inv.created_at);
        // 如果库存创建时间晚于用药开始时间，以库存创建时间为准
        const medStart = med.start_date ? new Date(med.start_date) : new Date(med.created_at);
        const calcStart = lastCalc > medStart ? lastCalc : medStart;

        const daysElapsed = Math.floor((todayStart - calcStart) / (24 * 60 * 60 * 1000));
        if (daysElapsed <= 0) continue;

        // 5. 计算消耗量并扣减
        const consumed = Math.floor(dailyConsumption * daysElapsed);
        if (consumed <= 0) continue;

        const newRemain = Math.max(0, inv.remaining_quantity - consumed);
        const actualConsumed = inv.remaining_quantity - newRemain;
        if (actualConsumed <= 0) continue;

        await getPool().query(
          `UPDATE drug_inventory SET remaining_quantity = ?, last_auto_calc_date = NOW(), updated_at = NOW() WHERE id = ?`,
          [newRemain, inv.id]
        );
        totalConsumed += actualConsumed;
        updatedRecords++;
      }
    }

    res.json({ success: true, totalConsumed, updatedRecords });
  } catch (err) {
    console.error('Auto consume error:', err);
    res.json({ success: false, error: err.message, totalConsumed: 0, updatedRecords: 0 });
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
  autoConsume,
  getChronicMeds,
  saveChronicMeds,
  // 内部函数，导出仅供 backend/test 回归测试使用
  _aggregateInventory,
  _syncMedicationPlans,
  deleteChronicSql,
  deleteChronicParams,
};

// 更新单条入库记录（有效期/余量）
async function updateInventoryItem(req, res) {
  try {
    const { id } = req.params;
    const { expiryDate, remainingQuantity } = req.body;
    const familyId = req.familyId;
    const userId = req.user.id;

    const access = familyAccessFilter(familyId);
    const [rows] = await getPool().query(
      `SELECT id, elder_id FROM drug_inventory WHERE id = ? AND (${access.sql})`,
      [id, ...access.params]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }

    // 药箱：只能修改自己或被授权修改的成员的入库记录
    const targetElderId = rows[0].elder_id;
    if (targetElderId) {
      const allow = await canModifyElder(getPool(), targetElderId, userId);
      if (!allow) {
        return res.status(403).json({ error: '您无权修改该成员的入库记录，请先获得授权' });
      }
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
      // 手动修改余量时重置自动计算基准时间，避免下次自动消耗覆盖手动值
      updates.push('last_auto_calc_date = NOW()');
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
