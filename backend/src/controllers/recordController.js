const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { getEntityFiles, setEntityFiles, deleteEntityFiles } = require('../utils/entityFiles');

function fmtDate(d) { if (d instanceof Date) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; } return d; }

// 获取病历列表
async function getRecords(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId } = req.query;

    let query = 'SELECT * FROM records WHERE family_id = ?';
    const params = [familyId];

    if (elderId) {
      query += ' AND elder_id = ?';
      params.push(elderId);
    }

    query += ' ORDER BY visit_date DESC, created_at DESC';

    const [records] = await getPool().query(query, params);

    // 转换字段名为前端格式
    const formattedRecords = records.map(r => ({
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
      doctor: r.doctor,
      imageUrl: r.image_url,
      confidence: r.confidence,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
      relatedRecordId: r.related_record_id || null,
      createdAt: r.created_at
    }));

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

    const [records] = await getPool().query(
      'SELECT * FROM records WHERE id = ? AND family_id = ?',
      [id, familyId]
    );

    if (records.length === 0) {
      return res.status(404).json({ error: '病历不存在' });
    }

    const r = records[0];
    const images = await getEntityFiles('record', r.id);

    const record = {
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
      doctor: r.doctor,
      imageUrl: r.image_url,
      confidence: r.confidence,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
      relatedRecordId: r.related_record_id || null,
      ocrText: r.ocr_text || null,
      images,
      createdAt: r.created_at
    };

    // 若为病历，查询关联的处方/报告
    if (r.type === '病历') {
      const [related] = await getPool().query(
        'SELECT * FROM records WHERE related_record_id = ? AND family_id = ? ORDER BY visit_date DESC, created_at DESC',
        [r.id, familyId]
      );
      const relatedRecords = [];
      for (const rr of related) {
        const relImages = await getEntityFiles('record', rr.id);
        const item = {
          id: rr.id,
          type: rr.type,
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
            frequency: m.frequency, quantity: m.quantity, note: m.note,
            startDate: fmtDate(m.start_date), status: m.status
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
        quantity: m.quantity, note: m.note,
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
  const { elderId, type, visitDate, hospital, department, diagnosis, chiefComplaint, findings, conclusion, metrics, orders, doctor, imageUrl, confidence, fileIds, relatedRecordId, ocrText } = req.body;

  if (!elderId) {
      return res.status(400).json({ error: '必须关联老人' });
    }

    // 检查老人是否存在
    const [elders] = await getPool().query('SELECT id FROM elders WHERE id = ? AND family_id = ?', [elderId, familyId]);
    if (elders.length === 0) {
      return res.status(400).json({ error: '老人档案不存在' });
    }

    const id = uuidv4();
    const metricsJson = JSON.stringify(metrics || []);
    const notesJson = JSON.stringify([]);

    await getPool().query(
      `INSERT INTO records (id, elder_id, family_id, type, visit_date, hospital, department, diagnosis, chief_complaint, findings, conclusion, metrics, orders, doctor, image_url, confidence, notes, ocr_text, related_record_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, elderId, familyId, type || '病历', visitDate || null, hospital || null, department || null, diagnosis || null, chiefComplaint || null, findings || null, conclusion || null, metricsJson, orders || null, doctor || null, imageUrl || null, confidence || null, notesJson, ocrText || null, relatedRecordId || null]
    );

    // 保存关联图片
    if (fileIds && fileIds.length > 0) {
      await setEntityFiles('record', id, fileIds);
    }

    const [records] = await getPool().query('SELECT * FROM records WHERE id = ?', [id]);
    const images = await getEntityFiles('record', id);
    const r = records[0];
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
        notes: [],
      relatedRecordId: r.related_record_id || null,
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
    const { elderId, type, visitDate, hospital, department, diagnosis, chiefComplaint, findings, conclusion, metrics, orders, doctor, imageUrl, confidence, fileIds, relatedRecordId } = req.body;

    const [records] = await getPool().query('SELECT * FROM records WHERE id = ? AND family_id = ?', [id, familyId]);
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
      values.push(id, familyId);
      await getPool().query(
        `UPDATE records SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
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

    const [records] = await getPool().query('SELECT * FROM records WHERE id = ? AND family_id = ?', [id, familyId]);
    if (records.length === 0) {
      return res.status(404).json({ error: '病历不存在' });
    }

    await getPool().query('DELETE FROM records WHERE id = ? AND family_id = ?', [id, familyId]);
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

    if (!text) {
      return res.status(400).json({ error: '备注内容不能为空' });
    }

    const [records] = await getPool().query('SELECT * FROM records WHERE id = ? AND family_id = ?', [id, familyId]);
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
