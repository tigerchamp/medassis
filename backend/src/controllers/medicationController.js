const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { resolveDrugCode } = require('../utils/drugLibrary');
const { getEntityFiles, setEntityFiles, deleteEntityFiles } = require('../utils/entityFiles');

function fmtDate(d) { if (d instanceof Date) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; } return d; }

function formatMedication(m) {
  return {
    id: m.id,
    elderId: m.elder_id,
    drugCode: m.drug_code,
    name: m.name,
    specification: m.specification || '',
    dose: m.dose,
    quantity: m.quantity != null ? Number(m.quantity) : 1,
    frequency: m.frequency,
    times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
    startDate: fmtDate(m.start_date),
    endDate: fmtDate(m.end_date),
    note: m.note,
    sourcePrescriptionId: m.source_prescription_id,
    reminder: !!m.reminder,
    status: m.status,
    createdAt: m.created_at
  };
}

// 获取用药列表
async function getMedications(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId, active } = req.query;

    let query = 'SELECT * FROM medications WHERE family_id = ?';
    const params = [familyId];

    if (elderId) {
      query += ' AND elder_id = ?';
      params.push(elderId);
    }

    if (active === 'true') {
      query += ' AND status = ?';
      params.push('active');
    }

    query += ' ORDER BY created_at DESC';

    const [medications] = await getPool().query(query, params);

    // 转换字段名
    const formattedMeds = medications.map(formatMedication);

    res.json({ medications: formattedMeds });
  } catch (err) {
    console.error('Get medications error:', err);
    res.status(500).json({ error: '获取用药列表失败' });
  }
}

// 获取单个用药详情
async function getMedication(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    const [medications] = await getPool().query(
      'SELECT * FROM medications WHERE id = ? AND family_id = ?',
      [id, familyId]
    );

    if (medications.length === 0) {
      return res.status(404).json({ error: '用药记录不存在' });
    }

    const images = await getEntityFiles('medication', medications[0].id);
    res.json({ medication: { ...formatMedication(medications[0]), images } });
  } catch (err) {
    console.error('Get medication error:', err);
    res.status(500).json({ error: '获取用药详情失败' });
  }
}

// 添加用药
async function addMedication(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId, drugCode, name, specification, dose, quantity, frequency, times, startDate, endDate, note, reminder, status, fileIds } = req.body;

    if (!elderId) {
      return res.status(400).json({ error: '老人不能为空' });
    }
    if (!drugCode && !name) {
      return res.status(400).json({ error: '药品名称不能为空' });
    }

    // 检查老人是否存在
    const [elders] = await getPool().query('SELECT id FROM elders WHERE id = ? AND family_id = ?', [elderId, familyId]);
    if (elders.length === 0) {
      return res.status(400).json({ error: '老人档案不存在' });
    }

    // 关联药品库：前端传入 drugCode 则校验；否则按名称匹配，未匹配则新增入库
    const resolved = await resolveDrugCode({ drugCode, name, specification });
    const finalCode = resolved.code;
    const finalName = resolved.name;
    const finalSpec = specification || resolved.specification || '';

    const id = uuidv4();
    const timesJson = JSON.stringify(times || ['08:00']);

    await getPool().query(
      `INSERT INTO medications (id, elder_id, family_id, drug_code, name, specification, dose, quantity, frequency, times, start_date, end_date, note, reminder, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, elderId, familyId, finalCode, finalName, finalSpec || null, dose || null, quantity || 1, frequency || null, timesJson, startDate || null, endDate || null, note || null, reminder !== false, status || 'active']
    );

    // 保存关联图片
    if (fileIds && fileIds.length > 0) {
      await setEntityFiles('medication', id, fileIds);
    }

    // 同步到药箱：为该药品创建/合并一条库存记录
    await _syncToDrugInventory(familyId, elderId, finalCode, finalName, finalSpec, quantity || 1, req.body.expiryDate, id);

    const [medications] = await getPool().query('SELECT * FROM medications WHERE id = ?', [id]);
    const images = await getEntityFiles('medication', id);
    res.json({ medication: { ...formatMedication(medications[0]), images } });
  } catch (err) {
    console.error('Add medication error:', err);
    res.status(500).json({ error: '添加用药失败' });
  }
}

// 同步用药记录到药箱
async function _syncToDrugInventory(familyId, elderId, drugCode, name, specification, quantity, expiryDate, medicationId) {
  if (!drugCode) return;
  try {
    const status = computeStatus(expiryDate, 'valid');
    // 查找同名同code的库存
    const [existing] = await getPool().query(
      `SELECT * FROM drug_inventory WHERE family_id = ? AND drug_code = ? LIMIT 1`,
      [familyId, drugCode]
    );
    if (existing.length > 0) {
      // 合并数量，更新有效期（取较晚的）
      const newQty = (existing[0].quantity || 0) + (quantity || 1);
      let effectiveExpiry = existing[0].expiry_date;
      if (expiryDate) {
        const newExp = new Date(expiryDate);
        if (!effectiveExpiry || newExp > new Date(effectiveExpiry)) {
          effectiveExpiry = expiryDate;
        }
      }
      const newStatus = computeStatus(effectiveExpiry, existing[0].status);
      await getPool().query(
        'UPDATE drug_inventory SET quantity = ?, elder_id = ?, expiry_date = ?, status = ? WHERE id = ?',
        [newQty, elderId || existing[0].elder_id, effectiveExpiry || null, newStatus, existing[0].id]
      );
    } else {
      // 新增库存记录
      const invId = uuidv4();
      await getPool().query(
        `INSERT INTO drug_inventory (id, family_id, elder_id, drug_code, name, specification, quantity, expiry_date, status, source_medication_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invId, familyId, elderId || null, drugCode, name, specification || null, quantity || 1, expiryDate || null, status, medicationId]
      );
    }
  } catch (err) {
    console.error('Sync to drug inventory error:', err);
    // 不影响主流程
  }
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

// 更新用药
async function updateMedication(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const { elderId, drugCode, name, dose, frequency, times, startDate, endDate, note, reminder, status, fileIds } = req.body;

    const [medications] = await getPool().query('SELECT * FROM medications WHERE id = ? AND family_id = ?', [id, familyId]);
    if (medications.length === 0) {
      return res.status(404).json({ error: '用药记录不存在' });
    }

    const updates = [];
    const values = [];

    // 若传入 drugCode 或 name 变更，则重新关联药品库
    if (drugCode || name) {
      const resolved = await resolveDrugCode({
        drugCode,
        name: name || medications[0].name
      });
      updates.push('drug_code = ?'); values.push(resolved.code);
      updates.push('name = ?'); values.push(resolved.name);
    }

    if (elderId !== undefined) { updates.push('elder_id = ?'); values.push(elderId); }
    if (dose !== undefined) { updates.push('dose = ?'); values.push(dose); }
    if (frequency !== undefined) { updates.push('frequency = ?'); values.push(frequency); }
    if (times !== undefined) { updates.push('times = ?'); values.push(JSON.stringify(times)); }
    if (startDate !== undefined) { updates.push('start_date = ?'); values.push(startDate); }
    if (endDate !== undefined) { updates.push('end_date = ?'); values.push(endDate); }
    if (note !== undefined) { updates.push('note = ?'); values.push(note); }
    if (reminder !== undefined) { updates.push('reminder = ?'); values.push(reminder ? 1 : 0); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }

    if (updates.length > 0) {
      values.push(id, familyId);
      await getPool().query(
        `UPDATE medications SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
        values
      );
    }

    // 更新关联图片
    if (fileIds !== undefined) {
      await setEntityFiles('medication', id, fileIds);
    }

    const [updated] = await getPool().query('SELECT * FROM medications WHERE id = ?', [id]);
    const images = await getEntityFiles('medication', id);
    res.json({ medication: { ...formatMedication(updated[0]), images } });
  } catch (err) {
    console.error('Update medication error:', err);
    res.status(500).json({ error: '更新用药失败' });
  }
}

// 删除用药
async function deleteMedication(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;

    const [medications] = await getPool().query('SELECT * FROM medications WHERE id = ? AND family_id = ?', [id, familyId]);
    if (medications.length === 0) {
      return res.status(404).json({ error: '用药记录不存在' });
    }

    // 删除服药记录
    await getPool().query('DELETE FROM med_logs WHERE med_id = ?', [id]);
    // 删除用药记录
    await getPool().query('DELETE FROM medications WHERE id = ? AND family_id = ?', [id, familyId]);
    await deleteEntityFiles('medication', id);

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete medication error:', err);
    res.status(500).json({ error: '删除用药失败' });
  }
}

// 记录服药
async function logMedication(req, res) {
  try {
    const { medId, scheduledTime, missed } = req.body;
    const userId = req.user.id;
    const familyId = req.familyId;

    if (!medId || !scheduledTime) {
      return res.status(400).json({ error: '用药ID和计划时间不能为空' });
    }

    const [meds] = await getPool().query(
      'SELECT id FROM medications WHERE id = ? AND family_id = ?',
      [medId, familyId]
    );
    if (meds.length === 0) {
      return res.status(404).json({ error: '用药记录不存在' });
    }

    const id = uuidv4();
    const actualTime = missed ? null : new Date().toISOString().slice(0, 19).replace('T', ' ');

    await getPool().query(
      `INSERT INTO med_logs (id, med_id, scheduled_time, actual_time, marked_by, missed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, medId, scheduledTime, actualTime, userId, missed ? 1 : 0]
    );

    res.json({
      log: {
        id,
        medId,
        scheduledTime,
        actualTime,
        markedBy: userId,
        missed: !!missed
      }
    });
  } catch (err) {
    console.error('Log medication error:', err);
    res.status(500).json({ error: '记录服药失败' });
  }
}

// 获取服药记录
async function getMedLogs(req, res) {
  try {
    const { medId } = req.query;
    const familyId = req.familyId;

    let query = `
      SELECT ml.* FROM med_logs ml
      JOIN medications m ON ml.med_id = m.id
      WHERE m.family_id = ?
    `;
    const params = [familyId];

    if (medId) {
      query += ' AND ml.med_id = ?';
      params.push(medId);
    }

    query += ' ORDER BY ml.scheduled_time DESC';

    const [logs] = await getPool().query(query, params);

    const formattedLogs = logs.map(l => ({
      id: l.id,
      medId: l.med_id,
      scheduledTime: l.scheduled_time,
      actualTime: l.actual_time,
      markedBy: l.marked_by,
      missed: !!l.missed
    }));

    res.json({ logs: formattedLogs });
  } catch (err) {
    console.error('Get med logs error:', err);
    res.status(500).json({ error: '获取服药记录失败' });
  }
}

module.exports = {
  getMedications,
  getMedication,
  addMedication,
  updateMedication,
  deleteMedication,
  logMedication,
  getMedLogs
};
