const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { getEntityFiles, setEntityFiles, deleteEntityFiles } = require('../utils/entityFiles');

function fmtDate(d) { if (d instanceof Date) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; } return d; }

/**
 * 生成记录编号：前缀(BL/CF/JC) + 日期(YYYYMMDD) + 字母序号(A,B,...,Z,AA,AB,...)
 * 同一家庭同一天同一类型按字母递增
 */
async function _generateRecordNo(pool, type, visitDate, familyId) {
  const prefixMap = { '病历': 'BL', '药方': 'CF', '检查报告': 'JC' };
  const prefix = prefixMap[type] || 'BL';
  const date = visitDate ? new Date(visitDate) : new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const pattern = `${prefix}${dateStr}%`;
  const [existing] = await pool.query(
    'SELECT record_no FROM records WHERE family_id = ? AND record_no LIKE ? ORDER BY record_no',
    [familyId, pattern]
  );
  let nextLetter = 'A';
  if (existing.length > 0) {
    const lastNo = existing[existing.length - 1].record_no;
    const lastLetter = lastNo.substring(prefix.length + dateStr.length);
    nextLetter = _nextLetter(lastLetter);
  }
  return `${prefix}${dateStr}${nextLetter}`;
}

function _nextLetter(s) {
  const chars = s.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === 'Z') { chars[i] = 'A'; i--; }
    else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
  }
  return 'A' + chars.join('');
}

// 获取病历列表
async function getRecords(req, res) {
  try {
    const familyId = req.familyId;
    const userId = req.user.id;
    const { elderId } = req.query;

    // 查询：当前家庭的病历 + 当前用户 self 档案的病历（跨家庭共享）
    let query = `
      SELECT r.*, rr.record_no AS related_record_no
      FROM records r
      LEFT JOIN records rr ON r.related_record_id = rr.id
      WHERE (r.family_id = ?
         OR r.elder_id IN (SELECT id FROM elders WHERE user_id = ? AND relation = 'self'))
    `;
    const params = [familyId, userId];

    if (elderId) {
      query += ' AND r.elder_id = ?';
      params.push(elderId);
    }

    query += ' ORDER BY r.visit_date DESC, r.created_at DESC';

    const [records] = await getPool().query(query, params);

    // 转换字段名为前端格式
    const formattedRecords = records.map(r => ({
      id: r.id,
      elderId: r.elder_id,
      type: r.type,
      recordNo: r.record_no || null,
      visitDate: fmtDate(r.visit_date),
      hospital: r.hospital,
      department: r.department,
      diagnosis: r.diagnosis,
      chiefComplaint: r.chief_complaint,
      findings: r.findings,
      conclusion: r.conclusion,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
      orders: r.orders,
      doctor: r.doctor,
      imageUrl: r.image_url,
      confidence: r.confidence,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
      relatedRecordId: r.related_record_id || null,
      relatedRecordNo: r.related_record_no || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by || null,
      updatedBy: r.updated_by || null
    }));

    // 批量查询处方关联的药品列表（用于卡片显示）
    const prescriptionIds = formattedRecords.filter(r => r.type === '药方').map(r => r.id);
    if (prescriptionIds.length > 0) {
      const [meds] = await getPool().query(
        'SELECT * FROM medications WHERE source_prescription_id IN (?) ORDER BY source_prescription_id, created_at',
        [prescriptionIds]
      );
      const medsByRx = {};
      meds.forEach(m => {
        const key = m.source_prescription_id;
        if (!medsByRx[key]) medsByRx[key] = [];
        medsByRx[key].push({
          name: m.name, dose: m.dose, doseAmount: m.dose_amount, doseUnit: m.dose_unit,
          frequency: m.frequency, quantity: m.quantity, quantityUnit: m.quantity_unit
        });
      });
      formattedRecords.forEach(r => {
        if (r.type === '药方') r.medications = medsByRx[r.id] || [];
      });
    }

    res.json({ records: formattedRecords });
  } catch (err) {
    console.error('Get records error:', err);
    res.status(500).json({ error: '获取病历列表失败' });
  }
}

// 获取单个病历详情
async function getRecord(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;

    // 查询：当前家庭的病历 OR self 档案的病历
    const [records] = await getPool().query(`
      SELECT r.*, rr.record_no AS related_record_no
      FROM records r
      LEFT JOIN records rr ON r.related_record_id = rr.id
      WHERE r.id = ? AND (
        r.family_id = ?
        OR r.elder_id IN (SELECT id FROM elders WHERE user_id = ? AND relation = 'self')
      )
    `, [id, familyId, userId]);

    if (records.length === 0) {
      return res.status(404).json({ error: '病历不存在' });
    }

    const r = records[0];
    const images = await getEntityFiles('record', r.id);

    const record = {
      id: r.id,
      elderId: r.elder_id,
      type: r.type,
      recordNo: r.record_no || null,
      visitDate: fmtDate(r.visit_date),
      hospital: r.hospital,
      department: r.department,
      diagnosis: r.diagnosis,
      chiefComplaint: r.chief_complaint,
      findings: r.findings,
      conclusion: r.conclusion,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
      orders: r.orders,
      doctor: r.doctor,
      imageUrl: r.image_url,
      confidence: r.confidence,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
      relatedRecordId: r.related_record_id || null,
      relatedRecordNo: r.related_record_no || null,
      ocrText: r.ocr_text || null,
      images,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by || null,
      updatedBy: r.updated_by || null
    };

    // 若为病历，查询关联的处方/报告
    if (r.type === '病历') {
      const [related] = await getPool().query(
        `SELECT * FROM records WHERE related_record_id = ? AND (
          family_id = ? OR elder_id IN (SELECT id FROM elders WHERE user_id = ? AND relation = 'self')
        ) ORDER BY visit_date DESC, created_at DESC`,
        [r.id, familyId, userId]
      );
      const relatedRecords = [];
      for (const rr of related) {
        const relImages = await getEntityFiles('record', rr.id);
        const item = {
          id: rr.id,
          type: rr.type,
          recordNo: rr.record_no || null,
          visitDate: fmtDate(rr.visit_date),
          hospital: rr.hospital,
          department: rr.department,
          diagnosis: rr.diagnosis,
          findings: rr.findings,
          conclusion: rr.conclusion,
          doctor: rr.doctor,
          images: relImages
        };
        // 若关联的是处方，查用药明细
        if (rr.type === '药方') {
          const [meds] = await getPool().query(
            'SELECT * FROM medications WHERE source_prescription_id = ? ORDER BY created_at',
            [rr.id]
          );
          item.medications = meds.map(m => ({
            name: m.name, specification: m.specification, dose: m.dose,
            doseAmount: m.dose_amount, doseUnit: m.dose_unit,
            frequency: m.frequency, quantity: m.quantity, quantityUnit: m.quantity_unit,
            note: m.note, startDate: fmtDate(m.start_date), status: m.status
          }));
        }
        relatedRecords.push(item);
      }
      record.relatedRecords = relatedRecords;
    }

    // 若为处方，查询关联的用药明细
    if (r.type === '药方') {
      const [meds] = await getPool().query(
        'SELECT * FROM medications WHERE source_prescription_id = ? ORDER BY created_at',
        [r.id]
      );
      record.medications = meds.map(m => ({
        id: m.id, name: m.name, specification: m.specification, dose: m.dose,
        doseAmount: m.dose_amount, doseUnit: m.dose_unit,
        frequency: m.frequency, times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
        quantity: m.quantity, quantityUnit: m.quantity_unit, note: m.note,
        startDate: fmtDate(m.start_date), status: m.status
      }));
    }

    res.json({ record });
  } catch (err) {
    console.error('Get record error:', err);
    res.status(500).json({ error: '获取病历详情失败' });
  }
}

// 添加病历
async function addRecord(req, res) {
  try {
    const familyId = req.familyId;
    const userId = req.user.id;
  const { elderId, type, visitDate, hospital, department, diagnosis, chiefComplaint, findings, conclusion, metrics, orders, doctor, imageUrl, confidence, fileIds, relatedRecordId, ocrText } = req.body;

  if (!elderId) {
      return res.status(400).json({ error: '必须关联老人' });
    }

    // 检查老人是否存在（当前家庭的 OR self 档案跨家庭共享）
    const [elders] = await getPool().query(`
      SELECT id FROM elders WHERE id = ? AND (
        family_id = ? OR (user_id = ? AND relation = 'self')
      )
    `, [elderId, familyId, userId]);
    if (elders.length === 0) {
      return res.status(400).json({ error: '老人档案不存在' });
    }

    const id = uuidv4();
    const metricsJson = JSON.stringify(metrics || []);
    const notesJson = JSON.stringify([]);
    const recordType = type || '病历';
    // 自动生成记录编号
    const recordNo = await _generateRecordNo(getPool(), recordType, visitDate, familyId);

    await getPool().query(
      `INSERT INTO records (id, elder_id, family_id, type, record_no, visit_date, hospital, department, diagnosis, chief_complaint, findings, conclusion, metrics, orders, doctor, image_url, confidence, notes, ocr_text, related_record_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, elderId, familyId, recordType, recordNo, visitDate || null, hospital || null, department || null, diagnosis || null, chiefComplaint || null, findings || null, conclusion || null, metricsJson, orders || null, doctor || null, imageUrl || null, confidence || null, notesJson, ocrText || null, relatedRecordId || null, userId, userId]
    );

    // 保存关联图片
    if (fileIds && fileIds.length > 0) {
      await setEntityFiles('record', id, fileIds);
    }

    const [records] = await getPool().query(
      `SELECT r.*, rr.record_no AS related_record_no FROM records r LEFT JOIN records rr ON r.related_record_id = rr.id WHERE r.id = ?`,
      [id]
    );
    const images = await getEntityFiles('record', id);
    const r = records[0];
    res.json({
      record: {
        id: r.id,
        elderId: r.elder_id,
        type: r.type,
        recordNo: r.record_no || null,
        visitDate: fmtDate(r.visit_date),
        hospital: r.hospital,
        department: r.department,
        diagnosis: r.diagnosis,
        chiefComplaint: r.chief_complaint,
        findings: r.findings,
        conclusion: r.conclusion,
        metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
        orders: r.orders,
        imageUrl: r.image_url,
        confidence: r.confidence,
        notes: [],
      relatedRecordId: r.related_record_id || null,
      relatedRecordNo: r.related_record_no || null,
      ocrText: r.ocr_text || null,
      images,
      createdAt: r.created_at
    }
    });
  } catch (err) {
    console.error('Add record error:', err);
    res.status(500).json({ error: '添加病历失败' });
  }
}

// 更新病历
async function updateRecord(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;
    const { elderId, type, visitDate, hospital, department, diagnosis, chiefComplaint, findings, conclusion, metrics, orders, doctor, imageUrl, confidence, fileIds, relatedRecordId } = req.body;

    // 查询：当前家庭的病历 OR self 档案的病历
    const [records] = await getPool().query(`
      SELECT * FROM records WHERE id = ? AND (
        family_id = ? OR elder_id IN (SELECT id FROM elders WHERE user_id = ? AND relation = 'self')
      )
    `, [id, familyId, userId]);
    if (records.length === 0) {
      return res.status(404).json({ error: '病历不存在' });
    }

    const updates = [];
    const values = [];

    if (elderId !== undefined) { updates.push('elder_id = ?'); values.push(elderId); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (visitDate !== undefined) { updates.push('visit_date = ?'); values.push(visitDate); }
    if (hospital !== undefined) { updates.push('hospital = ?'); values.push(hospital); }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (diagnosis !== undefined) { updates.push('diagnosis = ?'); values.push(diagnosis); }
    if (chiefComplaint !== undefined) { updates.push('chief_complaint = ?'); values.push(chiefComplaint); }
    if (findings !== undefined) { updates.push('findings = ?'); values.push(findings); }
    if (conclusion !== undefined) { updates.push('conclusion = ?'); values.push(conclusion); }
    if (metrics !== undefined) { updates.push('metrics = ?'); values.push(JSON.stringify(metrics)); }
    if (orders !== undefined) { updates.push('orders = ?'); values.push(orders); }
    if (doctor !== undefined) { updates.push('doctor = ?'); values.push(doctor); }
    if (imageUrl !== undefined) { updates.push('image_url = ?'); values.push(imageUrl); }
    if (confidence !== undefined) { updates.push('confidence = ?'); values.push(confidence); }
    if (relatedRecordId !== undefined) { updates.push('related_record_id = ?'); values.push(relatedRecordId || null); }

    if (updates.length > 0) {
      updates.push('updated_by = ?');
      values.push(userId);
      values.push(id);
      await getPool().query(
        `UPDATE records SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    // 更新关联图片
    if (fileIds !== undefined) {
      await setEntityFiles('record', id, fileIds);
    }

    const [updated] = await getPool().query('SELECT * FROM records WHERE id = ?', [id]);
    const images = await getEntityFiles('record', id);
    const r = updated[0];
    res.json({
      record: {
        id: r.id,
        elderId: r.elder_id,
        type: r.type,
        visitDate: fmtDate(r.visit_date),
        hospital: r.hospital,
        department: r.department,
        diagnosis: r.diagnosis,
        chiefComplaint: r.chief_complaint,
        findings: r.findings,
        conclusion: r.conclusion,
        metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
        orders: r.orders,
        imageUrl: r.image_url,
        confidence: r.confidence,
        notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
        images,
        createdAt: r.created_at
      }
    });
  } catch (err) {
    console.error('Update record error:', err);
    res.status(500).json({ error: '更新病历失败' });
  }
}

// 删除病历
async function deleteRecord(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const userId = req.user.id;

    // 查询：当前家庭的病历 OR self 档案的病历
    const [records] = await getPool().query(`
      SELECT * FROM records WHERE id = ? AND (
        family_id = ? OR elder_id IN (SELECT id FROM elders WHERE user_id = ? AND relation = 'self')
      )
    `, [id, familyId, userId]);
    if (records.length === 0) {
      return res.status(404).json({ error: '病历不存在' });
    }

    await getPool().query('DELETE FROM records WHERE id = ?', [id]);
    await deleteEntityFiles('record', id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('Delete record error:', err);
    res.status(500).json({ error: '删除病历失败' });
  }
}

// 添加备注
async function addNote(req, res) {
  try {
    const { id } = req.params;
    const { text, author } = req.body;
    const familyId = req.familyId;
    const userId = req.user.id;

    if (!text) {
      return res.status(400).json({ error: '备注内容不能为空' });
    }

    const [records] = await getPool().query(`
      SELECT * FROM records WHERE id = ? AND (
        family_id = ? OR elder_id IN (SELECT id FROM elders WHERE user_id = ? AND relation = 'self')
      )
    `, [id, familyId, userId]);
    if (records.length === 0) {
      return res.status(404).json({ error: '病历不存在' });
    }

    const note = {
      id: uuidv4(),
      text,
      author: author || '家人',
      createdAt: new Date().toISOString()
    };

    const notes = typeof records[0].notes === 'string' ? JSON.parse(records[0].notes) : (records[0].notes || []);
    notes.push(note);

    await getPool().query('UPDATE records SET notes = ? WHERE id = ?', [JSON.stringify(notes), id]);

    res.json({ note });
  } catch (err) {
    console.error('Add note error:', err);
    res.status(500).json({ error: '添加备注失败' });
  }
}

module.exports = {
  getRecords,
  getRecord,
  addRecord,
  updateRecord,
  deleteRecord,
  addNote
};
