const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

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
      visitDate: r.visit_date,
      hospital: r.hospital,
      department: r.department,
      diagnosis: r.diagnosis,
      chiefComplaint: r.chief_complaint,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
      orders: r.orders,
      imageUrl: r.image_url,
      confidence: r.confidence,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
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
    const record = {
      id: r.id,
      elderId: r.elder_id,
      type: r.type,
      visitDate: r.visit_date,
      hospital: r.hospital,
      department: r.department,
      diagnosis: r.diagnosis,
      chiefComplaint: r.chief_complaint,
      metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
      orders: r.orders,
      imageUrl: r.image_url,
      confidence: r.confidence,
      notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
      createdAt: r.created_at
    };

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
    const { elderId, type, visitDate, hospital, department, diagnosis, chiefComplaint, metrics, orders, imageUrl, confidence } = req.body;

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
      `INSERT INTO records (id, elder_id, family_id, type, visit_date, hospital, department, diagnosis, chief_complaint, metrics, orders, image_url, confidence, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, elderId, familyId, type || '病历', visitDate || null, hospital || null, department || null, diagnosis || null, chiefComplaint || null, metricsJson, orders || null, imageUrl || null, confidence || null, notesJson]
    );

    const [records] = await getPool().query('SELECT * FROM records WHERE id = ?', [id]);
    const r = records[0];
    res.json({
      record: {
        id: r.id,
        elderId: r.elder_id,
        type: r.type,
        visitDate: r.visit_date,
        hospital: r.hospital,
        department: r.department,
        diagnosis: r.diagnosis,
        chiefComplaint: r.chief_complaint,
        metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
        orders: r.orders,
        imageUrl: r.image_url,
        confidence: r.confidence,
        notes: [],
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
    const { elderId, type, visitDate, hospital, department, diagnosis, chiefComplaint, metrics, orders, imageUrl, confidence } = req.body;

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
    if (metrics !== undefined) { updates.push('metrics = ?'); values.push(JSON.stringify(metrics)); }
    if (orders !== undefined) { updates.push('orders = ?'); values.push(orders); }
    if (imageUrl !== undefined) { updates.push('image_url = ?'); values.push(imageUrl); }
    if (confidence !== undefined) { updates.push('confidence = ?'); values.push(confidence); }

    if (updates.length > 0) {
      values.push(id, familyId);
      await getPool().query(
        `UPDATE records SET ${updates.join(', ')} WHERE id = ? AND family_id = ?`,
        values
      );
    }

    const [updated] = await getPool().query('SELECT * FROM records WHERE id = ?', [id]);
    const r = updated[0];
    res.json({
      record: {
        id: r.id,
        elderId: r.elder_id,
        type: r.type,
        visitDate: r.visit_date,
        hospital: r.hospital,
        department: r.department,
        diagnosis: r.diagnosis,
        chiefComplaint: r.chief_complaint,
        metrics: typeof r.metrics === 'string' ? JSON.parse(r.metrics) : (r.metrics || []),
        orders: r.orders,
        imageUrl: r.image_url,
        confidence: r.confidence,
        notes: typeof r.notes === 'string' ? JSON.parse(r.notes) : (r.notes || []),
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
