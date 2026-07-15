const { getPool } = require('../config/database');

function fmtDate(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : d; }

// 获取统计数据
async function getStats(req, res) {
  try {
    const familyId = req.familyId;

    const [elders] = await getPool().query('SELECT COUNT(*) as count FROM elders WHERE family_id = ?', [familyId]);
    const [records] = await getPool().query('SELECT COUNT(*) as count FROM records WHERE family_id = ?', [familyId]);
    const [medications] = await getPool().query(
      'SELECT COUNT(*) as count FROM medications WHERE family_id = ? AND (end_date IS NULL OR end_date >= CURDATE())',
      [familyId]
    );

    res.json({
      stats: {
        elderCount: elders[0]?.count || 0,
        recordCount: records[0]?.count || 0,
        activeMedCount: medications[0]?.count || 0
      }
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
}

// 搜索
async function search(req, res) {
  try {
    const familyId = req.familyId;
    const { keyword } = req.query;

    if (!keyword || keyword.trim() === '') {
      return res.json({ elders: [], records: [], medications: [] });
    }

    const kw = `%${keyword.trim()}%`;

    // 搜索老人
    const [elders] = await getPool().query(
      'SELECT * FROM elders WHERE family_id = ? AND (name LIKE ? OR conditions LIKE ? OR allergies LIKE ?)',
      [familyId, kw, kw, kw]
    );

    // 搜索病历
    const [records] = await getPool().query(
      `SELECT * FROM records WHERE family_id = ? AND (
        diagnosis LIKE ? OR hospital LIKE ? OR orders LIKE ? OR chief_complaint LIKE ?
      )`,
      [familyId, kw, kw, kw, kw]
    );

    // 搜索用药
    const [medications] = await getPool().query(
      'SELECT * FROM medications WHERE family_id = ? AND (name LIKE ? OR note LIKE ?)',
      [familyId, kw, kw]
    );

    res.json({
      elders: elders.map(e => ({
        id: e.id,
        name: e.name,
        gender: e.gender,
        age: e.age,
        bloodType: e.blood_type,
        allergies: e.allergies,
        conditions: e.conditions,
        phone: e.phone,
        avatar: e.avatar
      })),
      records: records.map(r => ({
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
        orders: r.orders
      })),
      medications: medications.map(m => ({
        id: m.id,
        elderId: m.elder_id,
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        times: typeof m.times === 'string' ? JSON.parse(m.times) : (m.times || []),
        startDate: fmtDate(m.start_date),
        endDate: fmtDate(m.end_date),
        note: m.note,
        status: m.status
      }))
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: '搜索失败' });
  }
}

module.exports = { getStats, search };
