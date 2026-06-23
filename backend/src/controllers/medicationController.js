const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

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
    const formattedMeds = medications.map(m => ({
      id: m.id,
      elderId: m.elder_id,
      name: m.name,
      dose: m.dose,
      frequency: m.frequency,
      times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
      startDate: m.start_date,
      endDate: m.end_date,
      note: m.note,
      sourcePrescriptionId: m.source_prescription_id,
      reminder: !!m.reminder,
      status: m.status,
      createdAt: m.created_at
    }));

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

    const m = medications[0];
    res.json({
      medication: {
        id: m.id,
        elderId: m.elder_id,
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
        startDate: m.start_date,
        endDate: m.end_date,
        note: m.note,
        sourcePrescriptionId: m.source_prescription_id,
        reminder: !!m.reminder,
        status: m.status,
        createdAt: m.created_at
      }
    });
  } catch (err) {
    console.error('Get medication error:', err);
    res.status(500).json({ error: '获取用药详情失败' });
  }
}

// 添加用药
async function addMedication(req, res) {
  try {
    const familyId = req.familyId;
    const { elderId, name, dose, frequency, times, startDate, endDate, note, reminder, status } = req.body;

    if (!elderId || !name) {
      return res.status(400).json({ error: '老人和药品名称不能为空' });
    }

    // 检查老人是否存在
    const [elders] = await getPool().query('SELECT id FROM elders WHERE id = ? AND family_id = ?', [elderId, familyId]);
    if (elders.length === 0) {
      return res.status(400).json({ error: '老人档案不存在' });
    }

    const id = uuidv4();
    const timesJson = JSON.stringify(times || ['08:00']);

    await getPool().query(
      `INSERT INTO medications (id, elder_id, family_id, name, dose, frequency, times, start_date, end_date, note, reminder, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, elderId, familyId, name, dose || null, frequency || null, timesJson, startDate || null, endDate || null, note || null, reminder !== false, status || 'active']
    );

    const [medications] = await getPool().query('SELECT * FROM medications WHERE id = ?', [id]);
    const m = medications[0];
    res.json({
      medication: {
        id: m.id,
        elderId: m.elder_id,
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
        startDate: m.start_date,
        endDate: m.end_date,
        note: m.note,
        sourcePrescriptionId: m.source_prescription_id,
        reminder: !!m.reminder,
        status: m.status,
        createdAt: m.created_at
      }
    });
  } catch (err) {
    console.error('Add medication error:', err);
    res.status(500).json({ error: '添加用药失败' });
  }
}

// 更新用药
async function updateMedication(req, res) {
  try {
    const { id } = req.params;
    const familyId = req.familyId;
    const { elderId, name, dose, frequency, times, startDate, endDate, note, reminder, status } = req.body;

    const [medications] = await getPool().query('SELECT * FROM medications WHERE id = ? AND family_id = ?', [id, familyId]);
    if (medications.length === 0) {
      return res.status(404).json({ error: '用药记录不存在' });
    }

    const updates = [];
    const values = [];

    if (elderId !== undefined) { updates.push('elder_id = ?'); values.push(elderId); }
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
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

    const [updated] = await getPool().query('SELECT * FROM medications WHERE id = ?', [id]);
    const m = updated[0];
    res.json({
      medication: {
        id: m.id,
        elderId: m.elder_id,
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
        startDate: m.start_date,
        endDate: m.end_date,
        note: m.note,
        sourcePrescriptionId: m.source_prescription_id,
        reminder: !!m.reminder,
        status: m.status,
        createdAt: m.created_at
      }
    });
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

    if (!medId || !scheduledTime) {
      return res.status(400).json({ error: '用药ID和计划时间不能为空' });
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

    let query = 'SELECT * FROM med_logs WHERE 1=1';
    const params = [];

    if (medId) {
      query += ' AND med_id = ?';
      params.push(medId);
    }

    query += ' ORDER BY scheduled_time DESC';

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
