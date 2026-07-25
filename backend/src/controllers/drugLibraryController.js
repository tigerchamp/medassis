const { getPool } = require('../config/database');
const { parseSpecification } = require('../utils/drugLibrary');

/**
 * 搜索药品库
 * GET /api/drug-library/search?q=xxx&limit=20
 *
 * 匹配规则：
 * - 同时按 名称 LIKE 模糊匹配 和 拼音首字母缩写前缀匹配
 * - 拼音缩写前缀匹配优先排序（更符合"首字母缩写快速检索"语义）
 */
async function search(req, res) {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!q || q.trim() === '') {
      return res.json({ drugs: [] });
    }
    const kw = q.trim();

    // 名称模糊 + 拼音缩写前缀，UNION 去重
    // 使用参数化查询避免注入
    const [rows] = await getPool().query(
      `SELECT code, name, pinyin_abbr, generic_name, category, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, approval_number, indication, contraindication, dosage_instruction, adverse_reaction, drug_interaction, precaution, storage
       FROM drugs
       WHERE name LIKE ? OR pinyin_abbr LIKE ?
       ORDER BY CASE
         WHEN name = ? THEN 0
         WHEN pinyin_abbr = ? THEN 1
         WHEN name LIKE ? THEN 2
         WHEN pinyin_abbr LIKE ? THEN 3
         ELSE 4
       END, name
       LIMIT ?`,
      [`%${kw}%`, `${kw}%`, kw, kw, `${kw}%`, `${kw}%`, limit]
    );

    res.json({
      drugs: rows.map(r => {
        let specDosageVal = r.spec_dosage != null ? Number(r.spec_dosage) : null;
        let specDosageUnitVal = r.spec_dosage_unit || '';
        // 若 spec_dosage 为空，尝试从 specification 解析
        if (specDosageVal === null && r.specification) {
          const parsed = parseSpecification(r.specification);
          if (parsed.specDosage !== null) {
            specDosageVal = parsed.specDosage;
            specDosageUnitVal = parsed.specDosageUnit || '';
          }
        }
        return {
          code: r.code,
          name: r.name,
          pinyinAbbr: r.pinyin_abbr,
          genericName: r.generic_name || '',
          category: r.category || '',
          dosageForm: r.dosage_form,
          specification: r.specification,
          specDosage: specDosageVal,
          specDosageUnit: specDosageUnitVal,
          unitCapacity: r.unit_capacity != null ? Number(r.unit_capacity) : null,
          unitCapacityUnit: r.unit_capacity_unit || '',
          manufacturer: r.manufacturer,
          approvalNumber: r.approval_number,
          indication: r.indication || '',
          contraindication: r.contraindication || '',
          dosageInstruction: r.dosage_instruction || '',
          adverseReaction: r.adverse_reaction || '',
          drugInteraction: r.drug_interaction || '',
          precaution: r.precaution || '',
          storage: r.storage || ''
        };
      })
    });
  } catch (err) {
    console.error('Drug library search error:', err);
    res.status(500).json({ error: '搜索药品库失败' });
  }
}

/**
 * 获取药品详情（按编码）
 * GET /api/drug-library/:code
 */
async function getDrug(req, res) {
  try {
    const { code } = req.params;
    const [rows] = await getPool().query(
      'SELECT code, name, pinyin_abbr, generic_name, category, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, approval_number, indication, contraindication, dosage_instruction, adverse_reaction, drug_interaction, precaution, storage FROM drugs WHERE code = ? LIMIT 1',
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }
    const r = rows[0];
    let specDosageVal = r.spec_dosage != null ? Number(r.spec_dosage) : null;
    let specDosageUnitVal = r.spec_dosage_unit || '';
    if (specDosageVal === null && r.specification) {
      const parsed = parseSpecification(r.specification);
      if (parsed.specDosage !== null) {
        specDosageVal = parsed.specDosage;
        specDosageUnitVal = parsed.specDosageUnit || '';
      }
    }
    res.json({
      drug: {
        code: r.code,
        name: r.name,
        pinyinAbbr: r.pinyin_abbr,
        genericName: r.generic_name || '',
        category: r.category || '',
        dosageForm: r.dosage_form,
        specification: r.specification,
        specDosage: specDosageVal,
        specDosageUnit: specDosageUnitVal,
        unitCapacity: r.unit_capacity != null ? Number(r.unit_capacity) : null,
        unitCapacityUnit: r.unit_capacity_unit || '',
        manufacturer: r.manufacturer,
        approvalNumber: r.approval_number,
        indication: r.indication || '',
        contraindication: r.contraindication || '',
        dosageInstruction: r.dosage_instruction || '',
        adverseReaction: r.adverse_reaction || '',
        drugInteraction: r.drug_interaction || '',
        precaution: r.precaution || '',
        storage: r.storage || ''
      }
    });
  } catch (err) {
    console.error('Drug library get error:', err);
    res.status(500).json({ error: '获取药品失败' });
  }
}

module.exports = { search, getDrug };
