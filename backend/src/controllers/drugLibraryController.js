const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { getPinyinAbbr, parseSpecification } = require('../utils/drugLibrary');

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

/**
 * 搜索药品库
 * GET /api/drug-library/search?q=xxx&limit=20
 *
 * 可见范围：标准共享数据 + 当前用户及其家庭组的私有数据
 * 匹配 名称模糊 + 拼音首字母缩写前缀
 */
async function search(req, res) {
  try {
    const { q } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!q || q.trim() === '') {
      return res.json({ drugs: [] });
    }
    const kw = q.trim();
    const familyUserIds = await _getFamilyUserIds(req);

    const [rows] = await getPool().query(
      `SELECT code, name, pinyin_abbr, generic_name, category, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, approval_number, indication, contraindication, dosage_instruction, adverse_reaction, drug_interaction, precaution, storage
       FROM drugs
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR ? LIKE CONCAT('%', name, '%') OR pinyin_abbr LIKE ?)
       ORDER BY CASE
         WHEN name = ? THEN 0
         WHEN pinyin_abbr = ? THEN 1
         WHEN name LIKE ? THEN 2
         WHEN ? LIKE CONCAT('%', name, '%') THEN 3
         WHEN pinyin_abbr LIKE ? THEN 4
         ELSE 5
       END, name
       LIMIT ?`,
      [familyUserIds, `%${kw}%`, kw, `${kw}%`, kw, kw, `${kw}%`, kw, `${kw}%`, limit]
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

/**
 * 精确查询药品是否存在（按名称匹配，限定在可见范围内）
 * GET /api/drug-library/check?name=xxx
 * 返回：{ exists: bool, drug: {...}|null, similar: [...] }
 *
 * 可见范围：标准共享数据 + 当前用户及其家庭组的私有数据
 */
async function check(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ exists: false, drug: null, similar: [] });
    const familyUserIds = await _getFamilyUserIds(req);

    // 精确匹配 name（仅在可见范围内）
    const [exact] = await getPool().query(
      `SELECT code, name, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer
       FROM drugs
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND name = ? LIMIT 1`,
      [familyUserIds, name]
    );
    if (exact.length > 0) {
      return res.json({
        exists: true,
        drug: {
          code: exact[0].code,
          name: exact[0].name,
          specification: exact[0].specification || '',
          specDosage: exact[0].spec_dosage != null ? Number(exact[0].spec_dosage) : null,
          specDosageUnit: exact[0].spec_dosage_unit || '',
          unitCapacity: exact[0].unit_capacity != null ? Number(exact[0].unit_capacity) : null,
          unitCapacityUnit: exact[0].unit_capacity_unit || '',
          manufacturer: exact[0].manufacturer || ''
        }
      });
    }
    // 不存在则返回相似项（同样限定可见范围）
    const [similar] = await getPool().query(
      `SELECT code, name, specification, manufacturer FROM drugs
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR pinyin_abbr LIKE ?) ORDER BY name LIMIT 8`,
      [familyUserIds, `%${name}%`, `${name}%`]
    );
    res.json({ exists: false, drug: null, similar });
  } catch (err) {
    console.error('Drug library check error:', err);
    res.status(500).json({ error: '校验药品失败' });
  }
}

/**
 * 添加新药品（仅当前用户及其家庭组可用）
 * POST /api/drug-library/add  body: { name, specification?, specDosage?, specDosageUnit?, unitCapacity?, unitCapacityUnit?, manufacturer?, dosageForm?, approvalNumber? }
 * 自动生成拼音首字母作为 pinyin_abbr，owner_user_id 记录创建者
 */
async function add(req, res) {
  try {
    const { name, specification, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, dosageForm, approvalNumber } = req.body;
    const trimmed = (name || '').trim();
    if (!trimmed) return res.status(400).json({ error: '药品名称不能为空' });

    const familyUserIds = await _getFamilyUserIds(req);
    // 在可见范围内已存在则直接返回，避免重复添加
    const [existing] = await getPool().query(
      `SELECT code, name, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer FROM drugs
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?)) AND name = ? LIMIT 1`,
      [familyUserIds, trimmed]
    );
    if (existing.length > 0) {
      const r = existing[0];
      return res.json({
        drug: {
          code: r.code, name: r.name,
          specification: r.specification || '',
          specDosage: r.spec_dosage != null ? Number(r.spec_dosage) : null,
          specDosageUnit: r.spec_dosage_unit || '',
          unitCapacity: r.unit_capacity != null ? Number(r.unit_capacity) : null,
          unitCapacityUnit: r.unit_capacity_unit || '',
          manufacturer: r.manufacturer || ''
        }
      });
    }

    const code = uuidv4();
    const pinyinAbbr = getPinyinAbbr(trimmed);
    await getPool().query(
      `INSERT INTO drugs (code, approval_number, name, pinyin_abbr, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, approvalNumber || null, trimmed, pinyinAbbr, dosageForm || null, specification || null,
       specDosage || null, specDosageUnit || null, unitCapacity || null, unitCapacityUnit || null,
       manufacturer || null, req.user.id]
    );
    res.json({
      drug: {
        code, name: trimmed,
        specification: specification || '',
        specDosage: specDosage || null,
        specDosageUnit: specDosageUnit || '',
        unitCapacity: unitCapacity || null,
        unitCapacityUnit: unitCapacityUnit || '',
        manufacturer: manufacturer || ''
      }
    });
  } catch (err) {
    console.error('Add drug error:', err);
    res.status(500).json({ error: '添加药品失败' });
  }
}

// ============ 分词匹配辅助函数 ============

function _generateGrams(text, n = 2) {
  const grams = new Set();
  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.substring(i, i + n));
  }
  return grams;
}

function _calcSimilarity(query, target) {
  if (!query || !target) return 0;
  const queryGrams = _generateGrams(query, 2);
  const targetGrams = _generateGrams(target, 2);
  let matched = 0;
  for (const g of queryGrams) {
    if (targetGrams.has(g)) matched++;
  }
  const matchedChars = matched * 2;
  const score = matchedChars / Math.max(query.length, 1);
  return score >= 0.6 ? score : 0;
}

/**
 * 药品名称匹配（精确匹配 + 模糊双向LIKE + 2-gram分词匹配）
 * GET /api/drug-library/match?name=xxx
 *
 * 返回：{ exact: bool, drug: {...}|null, similar: [...] }
 */
async function match(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ exact: false, drug: null, similar: [] });

    const familyUserIds = await _getFamilyUserIds(req);
    const selectFields = 'code, name, pinyin_abbr, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer';

    // 1. 精确匹配 name
    const [exact] = await getPool().query(
      `SELECT ${selectFields} FROM drugs
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?)) AND name = ? LIMIT 1`,
      [familyUserIds, name]
    );
    if (exact.length > 0) {
      return res.json({ exact: true, drug: _formatDrug(exact[0]) });
    }

    // 2. 模糊双向 LIKE
    const [fuzzy] = await getPool().query(
      `SELECT ${selectFields} FROM drugs
       WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
         AND (name LIKE ? OR ? LIKE CONCAT('%', name, '%') OR pinyin_abbr LIKE ?)
       ORDER BY
         CASE WHEN name LIKE ? THEN 0
              WHEN ? LIKE CONCAT('%', name, '%') THEN 1
              ELSE 2 END, name
       LIMIT 10`,
      [familyUserIds, `%${name}%`, name, `${name}%`, `%${name}%`, name]
    );

    // 3. 2-gram 分词匹配（用查询名称的 2-gram 做 SQL LIKE 预筛选）
    const queryGrams = [..._generateGrams(name, 2)];
    let gramScored = [];
    if (queryGrams.length > 0) {
      const gramConds = queryGrams.map(() => 'name LIKE ?').join(' OR ');
      const gramParams = queryGrams.map(g => `%${g}%`);
      const [gramDrugs] = await getPool().query(
        `SELECT ${selectFields} FROM drugs
         WHERE (owner_user_id IS NULL OR owner_user_id IN (?))
           AND (${gramConds})
         ORDER BY CASE WHEN owner_user_id IS NOT NULL THEN 0 ELSE 1 END, name
         LIMIT 1000`,
        [familyUserIds, ...gramParams]
      );
      gramScored = gramDrugs
        .map(r => ({ ...r, _score: _calcSimilarity(name, r.name) }))
        .filter(r => r._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 10);
    }

    // 合并去重
    const seen = new Set();
    const similar = [];
    for (const r of [...fuzzy, ...gramScored]) {
      if (!seen.has(r.code)) {
        seen.add(r.code);
        similar.push(_formatDrug(r));
      }
    }

    res.json({ exact: false, drug: null, similar: similar.slice(0, 10) });
  } catch (err) {
    console.error('Drug library match error:', err);
    res.status(500).json({ error: '药品匹配失败' });
  }
}

// 格式化药品记录（解析 spec_dosage）
function _formatDrug(r) {
  let specDosageVal = r.spec_dosage != null ? Number(r.spec_dosage) : null;
  let specDosageUnitVal = r.spec_dosage_unit || '';
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
    pinyinAbbr: r.pinyin_abbr || '',
    specification: r.specification || '',
    specDosage: specDosageVal,
    specDosageUnit: specDosageUnitVal,
    unitCapacity: r.unit_capacity != null ? Number(r.unit_capacity) : null,
    unitCapacityUnit: r.unit_capacity_unit || '',
    manufacturer: r.manufacturer || ''
  };
}

module.exports = { search, getDrug, check, add, match };
