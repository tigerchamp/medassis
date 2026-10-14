const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  getPinyinAbbr, parseSpecification, normalizeDrugRow, scoreDrugMatch,
  calcNameSimilarity, findDuplicateDrug
} = require('../utils/drugLibrary');

/**
 * 从请求 query 中提取待匹配药品字段（名称 + 规格 + 单位容量 + 生产厂商）
 */
function _parseMatchQuery(query) {
  const num = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v))) ? null : Number(v);
  return {
    name: (query.name || '').trim(),
    specDosage: num(query.specDosage),
    specDosageUnit: (query.specDosageUnit || '').trim(),
    unitCapacity: num(query.unitCapacity),
    unitCapacityUnit: (query.unitCapacityUnit || '').trim(),
    manufacturer: (query.manufacturer || '').trim(),
    specification: (query.specification || '').trim()
  };
}
const { fetchDrugInfo, parseDrugInfo, isConfigured } = require('../services/drugInfo');
const logger = require('../utils/logger');

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

/**
 * 搜索药品库（下拉候选列表）
 * GET /api/drug-library/search?name=xxx&specDosage=&specDosageUnit=&unitCapacity=&unitCapacityUnit=&manufacturer=&limit=20
 * （兼容旧参数 q=xxx 只传名称）
 *
 * 可见范围：标准共享数据 + 当前用户及其家庭组的私有数据
 * 排序：与 check/match 一致，走名称 + 规格 + 单位容量 + 厂商综合评分。
 * 不能只按 name 排序——同名药品库里常有几十条不同规格/厂商的（如「匹伐他汀钙片」），
 * name 完全相同导致排序无区分度，正确的那条会被 LIMIT 截断。
 */
async function search(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const query = _parseMatchQuery(req.query);
    const kw = query.name || (req.query.q || '').trim();
    if (!kw) {
      return res.json({ drugs: [] });
    }
    query.name = kw;
    const familyUserIds = await _getFamilyUserIds(req);

    const candidates = await _recallCandidates(query, familyUserIds);
    const scored = _rankCandidates(query, candidates);

    res.json({
      drugs: scored.slice(0, limit).map(r => _formatDrug(r, r._match.score))
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
      'SELECT code, name, pinyin_abbr, generic_name, category, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, approval_number, indication, contraindication, dosage_instruction, adverse_reaction, drug_interaction, precaution, storage, type1, syz, jx, wyy, fl, description, description_fetched_at FROM drugs WHERE code = ? LIMIT 1',
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '药品不存在' });
    }
    res.json({ drug: _formatDrugFields(rows[0]) });
  } catch (err) {
    console.error('Drug library get error:', err);
    res.status(500).json({ error: '获取药品失败' });
  }
}

/**
 * 精确查询药品是否存在
 * GET /api/drug-library/check?name=xxx&specDosage=&specDosageUnit=&unitCapacity=&unitCapacityUnit=&manufacturer=&specification=
 * 返回：{ exists: bool, drug: {...}|null, similar: [...] }
 *
 * 不只用名称，而是把规格/单位容量/生产厂商一起参与综合评分：
 * 名称一致且各字段无冲突才算 exists，同名不同规格/厂家会作为 similar 返回供用户选择。
 *
 * 可见范围：标准共享数据 + 当前用户及其家庭组的私有数据
 */
async function check(req, res) {
  try {
    const query = _parseMatchQuery(req.query);
    if (!query.name) return res.json({ exists: false, drug: null, similar: [] });
    const familyUserIds = await _getFamilyUserIds(req);

    const candidates = await _recallCandidates(query, familyUserIds);
    const scored = _rankCandidates(query, candidates);

    const best = scored[0];
    if (_autoSelectable(best, scored[1])) {
      return res.json({
        exists: true,
        drug: _formatDrug(best, best._match.score),
        similar: scored.slice(1, 8).map(r => _formatDrug(r, r._match.score))
      });
    }
    res.json({
      exists: false,
      drug: null,
      similar: scored.slice(0, 8).map(r => _formatDrug(r, r._match.score))
    });
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
    console.log('[drugLibrary.add] 收到请求 body=', JSON.stringify({ name, specification, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, dosageForm, approvalNumber }));
    const trimmed = (name || '').trim();
    if (!trimmed) { console.log('[drugLibrary.add] 药品名称为空, 返回400'); return res.status(400).json({ error: '药品名称不能为空' }); }

    // add 端点用于"创建新药品"（UUID code + owner_user_id 私有），同名不同规格/厂商的药品允许共存
    // （如国家库"阿司匹林肠溶片 25mg"与用户自建"阿司匹林肠溶片 100mg"）
    // 但名称+规格+容量+厂家实质相同的会先查重复用，避免写入重复记录
    const familyUserIds = await _getFamilyUserIds(req);

    // 查重：库里已存在同名且规格/容量/厂商一致的药品时直接复用，避免写入重复记录
    const existing = await findDuplicateDrug(getPool(), {
      name: trimmed,
      specDosage: specDosage || null,
      specDosageUnit: specDosageUnit || '',
      unitCapacity: unitCapacity || null,
      unitCapacityUnit: unitCapacityUnit || '',
      manufacturer: manufacturer || '',
      specification: specification || ''
    }, familyUserIds);
    if (existing) {
      logger.info('[drugLibrary.add] 查重命中，复用已有药品', { code: existing.code, name: trimmed });
      const norm = normalizeDrugRow(existing);
      return res.json({
        drug: {
          code: norm.code,
          name: norm.name,
          specification: norm.specification,
          specDosage: norm.specDosage,
          specDosageUnit: norm.specDosageUnit,
          unitCapacity: norm.unitCapacity,
          unitCapacityUnit: norm.unitCapacityUnit,
          manufacturer: norm.manufacturer
        },
        reused: true
      });
    }

    const code = uuidv4();
    const pinyinAbbr = getPinyinAbbr(trimmed);
    console.log('[drugLibrary.add] 准备INSERT, code=', code, 'pinyinAbbr=', pinyinAbbr, 'owner_user_id=', req.user.id);
    await getPool().query(
      `INSERT INTO drugs (code, approval_number, name, pinyin_abbr, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, approvalNumber || null, trimmed, pinyinAbbr, dosageForm || null, specification || null,
       specDosage || null, specDosageUnit || null, unitCapacity || null, unitCapacityUnit || null,
       manufacturer || null, req.user.id]
    );
    console.log('[drugLibrary.add] INSERT成功, code=', code, 'name=', trimmed);
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
    console.error('[drugLibrary.add] 异常:', err.message, err.stack);
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

/**
 * 候选召回：名称精确 / 双向 LIKE / 拼音前缀 / 2-gram 分词，四路合并去重。
 * 可见范围：标准共享数据 + 当前用户及家庭组私有数据。
 */
async function _recallCandidates(query, familyUserIds) {
  const name = query.name;
  const selectFields = 'code, name, pinyin_abbr, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer';
  const scope = '(owner_user_id IS NULL OR owner_user_id IN (?))';

  const [exact] = await getPool().query(
    `SELECT ${selectFields} FROM drugs WHERE ${scope} AND name = ?`,
    [familyUserIds, name]
  );

  const [fuzzy] = await getPool().query(
    `SELECT ${selectFields} FROM drugs
     WHERE ${scope}
       AND (name LIKE ? OR ? LIKE CONCAT('%', name, '%') OR pinyin_abbr LIKE ?)
     LIMIT 50`,
    [familyUserIds, `%${name}%`, name, `${name}%`]
  );

  let gramDrugs = [];
  const queryGrams = [..._generateGrams(name, 2)];
  if (queryGrams.length > 0) {
    const gramConds = queryGrams.map(() => 'name LIKE ?').join(' OR ');
    const gramParams = queryGrams.map(g => `%${g}%`);
    const [rows] = await getPool().query(
      `SELECT ${selectFields} FROM drugs
       WHERE ${scope} AND (${gramConds})
       LIMIT 500`,
      [familyUserIds, ...gramParams]
    );
    gramDrugs = rows.filter(r => calcNameSimilarity(name, r.name) > 0);
  }

  const seen = new Set();
  const merged = [];
  for (const r of [...exact, ...fuzzy, ...gramDrugs]) {
    if (!seen.has(r.code)) {
      seen.add(r.code);
      merged.push(r);
    }
  }
  return merged;
}

/**
 * 是否可自动选中最高分候选。
 * 若第二名同分但规格/单位容量实质不同，说明库中存在多个可选项，交给用户选择而不是静默替他决定。
 */
function _autoSelectable(top, second) {
  if (!top || !top._match.canAutoSelect) return false;
  if (!second || second._match.score !== top._match.score) return true;
  const differs = (a, b) => (a != null && a !== '' && b != null && b !== '' && String(a) !== String(b));
  return !differs(top.specDosage, second.specDosage)
    && !differs(top.unitCapacity, second.unitCapacity)
    && !differs(top.unitCapacityUnit, second.unitCapacityUnit);
}

/**
 * 对候选按 名称+规格+单位容量+生产厂商 综合评分排序
 */
function _rankCandidates(query, candidates) {
  // 拼音首字母查询（如 SHP / PFTTGP）与中文名称没有字面相似度，scoreDrugMatch 会算出
  // nameScore=0 而被下面 filter 掉。这里按拼音前缀命中补一个基础分，保住拼音搜索。
  const qPin = String(query.name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return candidates
    .map(r => {
      const norm = normalizeDrugRow(r);
      const m = scoreDrugMatch(query, norm);
      if (m.nameScore === 0 && qPin.length >= 2) {
        const cPin = String(r.pinyin_abbr || norm.pinyinAbbr || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (cPin && (cPin === qPin || cPin.startsWith(qPin) || qPin.startsWith(cPin))) {
          m.nameScore = cPin === qPin ? 0.9 : 0.8;
          m.score = Math.max(m.score, m.nameScore * 60);
        }
      }
      return { ...r, ...norm, _match: m };
    })
    .filter(r => r._match.nameScore > 0)
    .sort((a, b) => {
      if (b._match.score !== a._match.score) return b._match.score - a._match.score;
      // 同分时优先字段更完整的条目，其次按名称稳定排序
      if (b._match.completeness !== a._match.completeness) return b._match.completeness - a._match.completeness;
      return (a.name || '').localeCompare(b.name || '');
    });
}

/**
 * 药品匹配：名称 + 规格 + 单位容量 + 生产厂商 综合评分选最佳
 * GET /api/drug-library/match?name=xxx&specDosage=&specDosageUnit=&unitCapacity=&unitCapacityUnit=&manufacturer=&specification=
 *
 * 返回：{ exact: bool, drug: {...}|null, similar: [...] }
 * similar 按综合得分降序，便于用户在同名不同规格/厂家的条目中选择。
 */
async function match(req, res) {
  try {
    const query = _parseMatchQuery(req.query);
    if (!query.name) return res.json({ exact: false, drug: null, similar: [] });

    const familyUserIds = await _getFamilyUserIds(req);
    const candidates = await _recallCandidates(query, familyUserIds);
    const scored = _rankCandidates(query, candidates);

    const best = scored[0];
    if (_autoSelectable(best, scored[1])) {
      logger.info('药品匹配命中', {
        name: query.name, code: best.code, matched: best.name,
        score: best._match.score, agreements: best._match.agreements, candidates: candidates.length
      });
      return res.json({
        exact: true,
        drug: _formatDrug(best, best._match.score),
        similar: scored.slice(1, 10).map(r => _formatDrug(r, r._match.score))
      });
    }

    logger.info('药品匹配未命中', {
      name: query.name, specDosage: query.specDosage, manufacturer: query.manufacturer,
      candidates: candidates.length, topScore: best ? best._match.score : null
    });
    res.json({
      exact: false,
      drug: null,
      similar: scored.slice(0, 10).map(r => _formatDrug(r, r._match.score))
    });
  } catch (err) {
    console.error('Drug library match error:', err);
    res.status(500).json({ error: '药品匹配失败' });
  }
}

/**
 * 获取/同步药品说明书：先查数据库，缺失则从 ShowAPI 获取并存入数据库
 * GET /api/drug-library/fetch-info?code=xxx  或  GET /api/drug-library/fetch-info?name=xxx
 * 返回: { drug: {...}, fetched: bool }
 */
async function fetchInfo(req, res) {
  try {
    const { code, name } = req.query;
    let drugCode = code;
    let drugName = name;

    // 1. 先按 code 或 name 查数据库
    let row = null;
    if (drugCode) {
      const [rows] = await getPool().query(
        'SELECT * FROM drugs WHERE code = ? LIMIT 1',
        [drugCode]
      );
      row = rows.length > 0 ? rows[0] : null;
    } else if (drugName) {
      const [rows] = await getPool().query(
        'SELECT * FROM drugs WHERE name = ? LIMIT 1',
        [drugName]
      );
      row = rows.length > 0 ? rows[0] : null;
      if (row) drugCode = row.code;
    }

    if (!row) {
      return res.status(404).json({ error: '药品不存在' });
    }

    // 2. 检查是否已有说明书数据（description 不为空且有内容）
    const hasInfo = row.description && row.description.trim().length > 0;

    if (hasInfo) {
      // 数据库已有数据，直接返回
      return res.json({ drug: _formatDrugFields(row), fetched: false });
    }

    // 3. 从 ShowAPI 获取
    if (!isConfigured()) {
      return res.json({
        drug: _formatDrugFields(row),
        fetched: false,
        note: 'ShowAPI 未配置'
      });
    }

    const fetchName = row.name;
    const fetchApproval = row.approval_number || '';
    console.log(`[fetchInfo] 从 ShowAPI 获取药品: ${fetchName}, 批准文号: ${fetchApproval}`);
    const apiData = await fetchDrugInfo({ drugName: fetchName, approvalNumber: fetchApproval });

    if (!apiData) {
      return res.json({
        drug: _formatDrugFields(row),
        fetched: false,
        note: 'ShowAPI 未找到该药品数据'
      });
    }

    // 4. 解析并写入数据库
    const parsed = parseDrugInfo(apiData);
    const now = new Date();
    await getPool().query(
      `UPDATE drugs
       SET type1 = ?, syz = ?, jx = ?, wyy = ?, fl = ?, yfyl = ?, description = ?, description_fetched_at = ?
       WHERE code = ?`,
      [parsed.type1, parsed.syz, parsed.jx, parsed.wyy, parsed.fl, parsed.yfyl, parsed.description.description, now, row.code]
    );

    // 5. 返回更新后的数据
    const [updatedRows] = await getPool().query(
      'SELECT * FROM drugs WHERE code = ? LIMIT 1',
      [row.code]
    );

    console.log(`[fetchInfo] 成功获取并保存: ${fetchName}, type1=${parsed.type1}, description=${parsed.description ? '已获取' : '空'}`);
    res.json({ drug: _formatDrugFields(updatedRows[0]), fetched: true });

  } catch (err) {
    console.error('fetchInfo error:', err);
    res.status(500).json({ error: '获取药品说明书失败: ' + (err.message || err) });
  }
}

// 格式化药品记录（补全 spec_dosage：为空时从 specification 解析）
function _formatDrug(r, score) {
  const n = normalizeDrugRow(r);
  return {
    code: n.code,
    name: n.name,
    pinyinAbbr: n.pinyinAbbr,
    specification: n.specification,
    specDosage: n.specDosage,
    specDosageUnit: n.specDosageUnit,
    unitCapacity: n.unitCapacity,
    unitCapacityUnit: n.unitCapacityUnit,
    manufacturer: n.manufacturer,
    score: score == null ? null : score
  };
}

module.exports = { search, getDrug, check, add, match, fetchInfo };

// ============ 格式化辅助 ============

function _formatDrugFields(r) {
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
    storage: r.storage || '',
    type1: r.type1 || '',
    syz: r.syz || '',
    jx: r.jx || '',
    wyy: r.wyy != null ? Number(r.wyy) : 0,
    fl: r.fl || '',
    description: r.description || '',
    descriptionFetchedAt: r.description_fetched_at || null
  };
}
