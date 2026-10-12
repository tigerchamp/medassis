const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { pinyin } = require('pinyin-pro');
const logger = require('./logger');

/**
 * 获取产品名称的拼音首字母缩写（如 三黄片 -> SHP）
 */
function getPinyinAbbr(name) {
  if (!name || typeof name !== 'string') return '';
  const py = pinyin(name, { pattern: 'first', toneType: 'none' });
  return py.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

/**
 * 从 specification 字段解析规格数值和单位
 * 支持格式：0.25g / 0.5mg / 10ml / 50μg / 0.1g(按C16H19N3O5S计) 等
 * @param {string} spec 规格文本
 * @returns {{ specDosage: number|null, specDosageUnit: string|null }}
 */
function parseSpecification(spec) {
  if (!spec || typeof spec !== 'string') return { specDosage: null, specDosageUnit: null };
  // 匹配数字+单位，优先取第一个匹配（去掉括号内容后）
  const cleaned = spec.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
  const m = cleaned.match(/(\d+\.?\d*)\s*(mg|g|ml|μg|ug|μ)/i);
  if (!m) return { specDosage: null, specDosageUnit: null };
  let unit = m[2].toLowerCase();
  // 标准化单位
  if (unit === 'ug') unit = 'μg';
  if (unit === 'μ') unit = 'μg';
  return { specDosage: parseFloat(m[1]), specDosageUnit: unit };
}

// ============ 药品匹配：字段归一化与综合评分 ============

// 质量单位换算到 μg（用于 0.25g == 250mg 这类等价判断）
const MASS_UNIT_TO_UG = { 'μg': 1, 'ug': 1, 'µg': 1, 'mg': 1000, 'g': 1000000 };
// 生产厂商名称中需要剥离的企业后缀
const MANU_SUFFIXES = ['股份有限公司', '有限责任公司', '有限公司', '集团有限公司', '集团', '制药厂', '药业', '制药', '公司', '厂'];
// 包装单位别名
const CAP_UNIT_ALIAS = { '颗': '粒', '颗/盒': '粒', '枚': '粒', '包': '袋', '支': '支' };

function _normText(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '');
}

/** 剂量单位归一化（ug/μg/毫克/克 → 标准写法） */
function normalizeDoseUnit(u) {
  const s = _normText(u).toLowerCase();
  if (s === 'ug' || s === 'μg' || s === 'µg') return 'μg';
  if (s === '毫克') return 'mg';
  if (s === '克') return 'g';
  if (s === '毫升') return 'ml';
  return s;
}

/** 把剂量值+单位换算到统一基准，便于跨单位比较；无法换算返回 null */
function _doseBase(value, unit) {
  if (value == null || value === '') return null;
  const v = Number(value);
  if (!isFinite(v)) return null;
  const u = normalizeDoseUnit(unit);
  if (!u) return null;
  if (u === 'ml') return { dim: 'volume', base: v };
  if (MASS_UNIT_TO_UG[u] != null) return { dim: 'mass', base: v * MASS_UNIT_TO_UG[u] };
  return null;
}

/** 单位容量单位归一化（片/粒/袋/支/瓶/贴） */
function normalizeCapacityUnit(u) {
  const s = _normText(u);
  return CAP_UNIT_ALIAS[s] || s;
}

/** 生产厂商归一化：去空格与括号，剥离企业后缀 */
function normalizeManufacturer(s) {
  let out = _normText(s).replace(/[（）()]/g, '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of MANU_SUFFIXES) {
      if (out.length > suf.length && out.endsWith(suf)) {
        out = out.slice(0, -suf.length);
        changed = true;
      }
    }
  }
  return out;
}

/** 规格文本归一化：去空格、统一乘号、小写 */
function normalizeSpecText(s) {
  return _normText(s).toLowerCase().replace(/[×xX＊]/g, '*');
}

function _generateGrams(text, n = 2) {
  const grams = new Set();
  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.substring(i, i + n));
  }
  return grams;
}

/** 名称 2-gram 相似度，低于 0.6 视为不相似返回 0 */
function calcNameSimilarity(query, target) {
  if (!query || !target) return 0;
  const queryGrams = _generateGrams(query, 2);
  const targetGrams = _generateGrams(target, 2);
  let matched = 0;
  for (const g of queryGrams) {
    if (targetGrams.has(g)) matched++;
  }
  const score = (matched * 2) / Math.max(query.length, 1);
  // 候选名比查询名长时分子可能超过分母（如"板蓝根颗粒" vs "复方南板蓝根颗粒"），需截断到 1
  if (score < 0.6) return 0;
  return Math.min(1, score);
}

/**
 * 把 drugs 表原始行规范化为匹配用的 camelCase 结构。
 * spec_dosage 为空时尝试从 specification 文本解析。
 */
function normalizeDrugRow(r) {
  let specDosage = r.spec_dosage != null && r.spec_dosage !== '' ? Number(r.spec_dosage) : null;
  let specDosageUnit = r.spec_dosage_unit || '';
  if (specDosage === null && r.specification) {
    const parsed = parseSpecification(r.specification);
    if (parsed.specDosage !== null) {
      specDosage = parsed.specDosage;
      specDosageUnit = parsed.specDosageUnit || '';
    }
  }
  return {
    code: r.code,
    name: r.name || '',
    pinyinAbbr: r.pinyin_abbr || '',
    specDosage,
    specDosageUnit,
    unitCapacity: r.unit_capacity != null && r.unit_capacity !== '' ? Number(r.unit_capacity) : null,
    unitCapacityUnit: r.unit_capacity_unit || '',
    manufacturer: r.manufacturer || '',
    specification: r.specification || ''
  };
}

/**
 * 药品多字段综合评分：名称为主，规格/单位容量/生产厂商为辅。
 *
 * @param {Object} query 待匹配药品 { name, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, specification }
 * @param {Object} drug  库中药（normalizeDrugRow 结果）
 * @returns {{score:number, nameScore:number, nameEq:boolean, conflicts:string[], agreements:string[], canAutoSelect:boolean}}
 */
function scoreDrugMatch(query, drug) {
  const q = query || {};
  const conflicts = [];
  const agreements = [];

  // ---- 名称 ----
  const qName = _normText(q.name).toLowerCase();
  const cName = _normText(drug.name).toLowerCase();
  const nameEq = !!qName && qName === cName;
  let nameScore = 0;
  if (qName && cName) {
    if (nameEq) {
      nameScore = 1;
    } else {
      const sim = calcNameSimilarity(qName, cName);
      nameScore = sim > 0 ? sim : ((qName.includes(cName) || cName.includes(qName)) ? 0.7 : 0);
    }
  }

  // ---- 规格（每片/袋含量）----
  const qDose = _doseBase(q.specDosage, q.specDosageUnit);
  const cDose = _doseBase(drug.specDosage, drug.specDosageUnit);
  if (qDose && cDose) {
    if (qDose.dim !== cDose.dim) {
      conflicts.push('specDosage');
    } else if (Math.abs(qDose.base - cDose.base) > Math.max(1e-6, cDose.base * 0.001)) {
      conflicts.push('specDosage');
    } else {
      agreements.push('specDosage');
    }
  }

  // ---- 单位容量（每盒/瓶数量）----
  const qCap = q.unitCapacity != null && q.unitCapacity !== '' ? Number(q.unitCapacity) : null;
  const cCap = drug.unitCapacity != null && drug.unitCapacity !== '' ? Number(drug.unitCapacity) : null;
  if (qCap != null && isFinite(qCap) && cCap != null && isFinite(cCap)) {
    if (qCap !== cCap) {
      conflicts.push('unitCapacity');
    } else {
      agreements.push('unitCapacity');
      const qu = normalizeCapacityUnit(q.unitCapacityUnit);
      const cu = normalizeCapacityUnit(drug.unitCapacityUnit);
      if (qu && cu && qu !== cu) conflicts.push('unitCapacityUnit');
    }
  }

  // ---- 生产厂商 ----
  const qManu = normalizeManufacturer(q.manufacturer);
  const cManu = normalizeManufacturer(drug.manufacturer);
  if (qManu && cManu) {
    if (qManu === cManu) agreements.push('manufacturer');
    else if (qManu.includes(cManu) || cManu.includes(qManu)) agreements.push('manufacturerPartial');
    else conflicts.push('manufacturer');
  }

  // ---- 规格文本 ----
  const qSpec = normalizeSpecText(q.specification);
  const cSpec = normalizeSpecText(drug.specification);
  if (qSpec && cSpec) {
    if (qSpec === cSpec) agreements.push('specification');
    else if (qSpec.includes(cSpec) || cSpec.includes(qSpec)) agreements.push('specificationPartial');
  }

  // 综合评分：名称为主，规格/容量/厂家为辅
  let score = nameScore * 60;
  if (nameEq) score += 20; // 名称完全一致优先于近似名称
  if (agreements.includes('specDosage')) score += 25;
  else if (conflicts.includes('specDosage')) score -= 30;
  if (agreements.includes('unitCapacity')) {
    score += 10;
    if (conflicts.includes('unitCapacityUnit')) score -= 8;
  } else if (conflicts.includes('unitCapacity')) {
    score -= 12;
  }
  if (agreements.includes('manufacturer')) score += 10;
  else if (agreements.includes('manufacturerPartial')) score += 5;
  else if (conflicts.includes('manufacturer')) score -= 12;
  if (agreements.includes('specification')) score += 5;
  else if (agreements.includes('specificationPartial')) score += 2;

  score = Math.max(0, Math.round(score * 100) / 100);

  // 名称一致、且提供的规格/容量/厂商均无冲突 → 可自动选中
  // 名称高度相似（≥0.9）且至少有规格或厂商佐证 → 也可自动选中
  const canAutoSelect = conflicts.length === 0 && (nameEq || (nameScore >= 0.9 && agreements.length > 0));

  // 库中记录信息完整度（同分时优先选字段更全的条目）
  const completeness = [drug.specDosage, drug.unitCapacity, drug.manufacturer, drug.specification]
    .filter(v => v != null && v !== '').length;

  return { score, nameScore, nameEq, conflicts, agreements, completeness, canAutoSelect };
}

/**
 * 可见范围 SQL 片段：标准共享数据 + 当前用户及家庭组私有数据
 */
function scopeClause(familyUserIds) {
  return familyUserIds && familyUserIds.length
    ? { sql: `(owner_user_id IS NULL OR owner_user_id IN (${familyUserIds.map(() => '?').join(',')}))`, params: familyUserIds }
    : { sql: `owner_user_id IS NULL`, params: [] };
}

/**
 * 查重：在可见范围内查找与给定药品实质相同的记录（名称一致且规格/容量/厂商无冲突且有佐证）。
 * 用于新增药品前避免写入重复记录。
 *
 * @returns {Promise<Object|null>} 命中的 drugs 原始行，未命中返回 null
 */
async function findDuplicateDrug(pool, fields, familyUserIds) {
  const name = (fields && fields.name ? String(fields.name) : '').trim();
  if (!name) return null;
  const scope = scopeClause(familyUserIds);
  const [rows] = await pool.query(
    `SELECT code, name, pinyin_abbr, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, owner_user_id
     FROM drugs WHERE name = ? AND ${scope.sql}`,
    [name, ...scope.params]
  );
  if (rows.length === 0) return null;

  const hasExtra = [fields.specDosage, fields.unitCapacity, fields.manufacturer].some(v => v != null && v !== '');
  if (!hasExtra) return rows[0];

  let fallback = null;
  for (const r of rows) {
    const s = scoreDrugMatch(fields, normalizeDrugRow(r));
    if (!s.nameEq || s.conflicts.length > 0) continue;
    if (s.agreements.length > 0) return r;
    if (!fallback) fallback = r;
  }
  // 库中记录缺少全部规格/厂商信息时，名称相同即视为同一药品（后续会补全字段）
  return fallback;
}

/**
 * 解析药品编码：优先使用传入的 drugCode（需在 drugs 表存在）；
 * 否则按名称召回库中的同名药品，用 名称+规格+单位容量+生产厂商 综合评分选最佳匹配；
 * 若全部同名条目都存在字段冲突（同名不同规格/厂家），才视为不同药品新增入库。
 * 新增前还会做一次查重，避免写入重复记录。
 *
 * @param {Object} params
 * @param {string} [params.drugCode] 前端选中的药品编码
 * @param {string} params.name 药品名称（必填）
 * @param {string} [params.specification] 规格（用于新增入库时写入）
 * @param {string} [params.manufacturer] 生产单位（用于新增入库时写入）
 * @param {string} [params.dosageForm] 剂型（用于新增入库时写入）
 * @param {string} [params.approvalNumber] 批准文号（用于新增入库时写入）
 * @param {number} [params.specDosage] 规格数值（每片/袋含量）
 * @param {string} [params.specDosageUnit] 规格单位（片/袋等）
 * @param {number} [params.unitCapacity] 单位容量数值（每包装含量）
 * @param {string} [params.unitCapacityUnit] 包装单位（盒/瓶等）
 * @param {string} [params.ownerUserId] 创建者用户ID（新建药品时写入，用于私有数据隔离）
 * @param {string[]} [params.familyUserIds] 当前用户及家庭组成员ID列表（名称匹配可见范围过滤）
 * @returns {Promise<{code:string, name:string, specification:string, manufacturer:string, dosageForm:string, approvalNumber:string, specDosage:number, specDosageUnit:string, unitCapacity:number, unitCapacityUnit:string, created:boolean}>}
 */
async function resolveDrugCode(params) {
  const pool = getPool();
  const {
    drugCode,
    name,
    specification = null,
    manufacturer = null,
    dosageForm = null,
    approvalNumber = null,
    specDosage = null,
    specDosageUnit = null,
    unitCapacity = null,
    unitCapacityUnit = null,
    ownerUserId = null,
    familyUserIds = null
  } = params || {};

  // 可见范围过滤条件：标准共享数据(owner_user_id IS NULL) + 当前用户及家庭组私有数据
  const { sql: scopeSql, params: scopeParams } = scopeClause(familyUserIds);

  const trimmedName = (name || '').trim();
  if (!trimmedName && !drugCode) {
    throw new Error('药品名称不能为空');
  }

  const specFields = { specification, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer };
  // 参与匹配/查重的完整字段（含名称）
  const matchFields = { name: trimmedName, ...specFields };

  // 1) 前端传入 drugCode：校验存在性（限定可见范围）。显式选中库中药 → 精确复用，不新建
  if (drugCode) {
    const [rows] = await pool.query(
      `SELECT code, name, specification, manufacturer, dosage_form, approval_number, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit FROM drugs WHERE code = ? AND ${scopeSql} LIMIT 1`,
      [drugCode, ...scopeParams]
    );
    if (rows.length > 0) {
      logger.info('药品解析: 按 code 复用已有药品', { code: rows[0].code, name: rows[0].name });
      return await _resolveExisting(pool, rows[0], specFields);
    }
    // drugCode 无效则继续走名称匹配
  }

  // 2) 按名称召回库中的同名药品，用 名称+规格+单位容量+生产厂商 综合评分选最佳匹配
  if (trimmedName) {
    const [rows] = await pool.query(
      `SELECT code, name, specification, manufacturer, dosage_form, approval_number, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit FROM drugs WHERE name = ? AND ${scopeSql}`,
      [trimmedName, ...scopeParams]
    );
    if (rows.length > 0) {
      const ranked = rows
        .map(r => ({ r, s: scoreDrugMatch(matchFields, normalizeDrugRow(r)) }))
        .sort((a, b) => (b.s.score - a.s.score) || (b.s.completeness - a.s.completeness));
      const best = ranked.find(x => x.s.conflicts.length === 0);
      if (best) {
        logger.info('药品解析: 按名称+规格/厂家复用已有药品', {
          code: best.r.code, name: trimmedName, score: best.s.score,
          agreements: best.s.agreements, candidates: rows.length
        });
        return await _resolveExisting(pool, best.r, specFields);
      }
      // 所有同名条目都与传入的规格/厂家冲突 → 确属不同规格/厂家的药品，新增独立条目
      logger.info('药品解析: 同名但规格/厂家均冲突，新增独立药品', {
        name: trimmedName, specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer, ownerUserId
      });
    }
  }

  // 3) 未匹配到：新增入库（UUID 作为 code，避免与国家本位码冲突），写入 owner_user_id 标记私有
  //    新增前查重，避免同名同规格同厂家重复写入
  const dup = await findDuplicateDrug(pool, matchFields, familyUserIds);
  if (dup) {
    logger.info('药品解析: 新增前查重命中，复用已有药品', { code: dup.code, name: trimmedName });
    return await _resolveExisting(pool, dup, specFields);
  }
  const newCode = await _createDrugRow(pool, { name: trimmedName, ...specFields, ownerUserId });

  return {
    code: newCode,
    name: trimmedName,
    specification: specification || '',
    manufacturer: manufacturer || '',
    dosageForm: dosageForm || '',
    approvalNumber: approvalNumber || '',
    specDosage: specDosage,
    specDosageUnit: specDosageUnit || '',
    unitCapacity: unitCapacity,
    unitCapacityUnit: unitCapacityUnit || '',
    created: true
  };
}

/**
 * 在 drugs 表新增一条药品记录（UUID code），返回新 code。
 */
async function _createDrugRow(pool, { name, specification = null, specDosage = null, specDosageUnit = null, unitCapacity = null, unitCapacityUnit = null, manufacturer = null, ownerUserId = null, dosageForm = null, approvalNumber = null }) {
  const code = uuidv4();
  const pinyinAbbr = getPinyinAbbr(name);
  await pool.query(
    `INSERT INTO drugs (code, approval_number, name, pinyin_abbr, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, approvalNumber || null, name, pinyinAbbr, dosageForm || null, specification || null, specDosage || null, specDosageUnit || null, unitCapacity || null, unitCapacityUnit || null, manufacturer || null, ownerUserId || null]
  );
  return code;
}

/**
 * 处理已存在的药品：补全空的规格字段（不覆盖已有值），返回规范化记录。
 * spec_dosage 为空时优先从 specification 解析，再用前端传入值补全 unit_capacity/unit_capacity_unit 等。
 * 这样处方/药箱保存时前端传入的规格字段能写回 drugs 表（仅补全空字段，已有值不覆盖）。
 */
async function _resolveExisting(pool, r, { specDosage, specDosageUnit, unitCapacity, unitCapacityUnit, manufacturer }) {
  let specDosageVal = r.spec_dosage != null ? Number(r.spec_dosage) : null;
  let specDosageUnitVal = r.spec_dosage_unit || '';
  let unitCapacityVal = r.unit_capacity != null ? Number(r.unit_capacity) : null;
  let unitCapacityUnitVal = r.unit_capacity_unit || '';
  let manuVal = r.manufacturer || '';

  // spec_dosage 为空时优先从 specification 解析
  if (specDosageVal === null && r.specification) {
    const parsed = parseSpecification(r.specification);
    if (parsed.specDosage !== null) {
      specDosageVal = parsed.specDosage;
      specDosageUnitVal = parsed.specDosageUnit || '';
    }
  }

  // 前端传入值补全空字段（不覆盖已有值）
  const updates = [];
  const params = [];
  if (specDosageVal === null && specDosage != null) {
    specDosageVal = Number(specDosage);
    updates.push('spec_dosage = ?'); params.push(specDosageVal);
  }
  if (!specDosageUnitVal && specDosageUnit) {
    specDosageUnitVal = specDosageUnit;
    updates.push('spec_dosage_unit = ?'); params.push(specDosageUnitVal);
  }
  if (unitCapacityVal === null && unitCapacity != null) {
    unitCapacityVal = Number(unitCapacity);
    updates.push('unit_capacity = ?'); params.push(unitCapacityVal);
  }
  if (!unitCapacityUnitVal && unitCapacityUnit) {
    unitCapacityUnitVal = unitCapacityUnit;
    updates.push('unit_capacity_unit = ?'); params.push(unitCapacityUnitVal);
  }
  if (!manuVal && manufacturer) {
    manuVal = manufacturer;
    updates.push('manufacturer = ?'); params.push(manuVal);
  }
  if (updates.length > 0) {
    params.push(r.code);
    await pool.query(`UPDATE drugs SET ${updates.join(', ')} WHERE code = ?`, params);
  }

  return {
    code: r.code,
    name: r.name,
    specification: r.specification || '',
    manufacturer: manuVal,
    dosageForm: r.dosage_form || '',
    approvalNumber: r.approval_number || '',
    specDosage: specDosageVal,
    specDosageUnit: specDosageUnitVal,
    unitCapacity: unitCapacityVal,
    unitCapacityUnit: unitCapacityUnitVal,
    created: false
  };
}

module.exports = {
  getPinyinAbbr, parseSpecification, resolveDrugCode,
  normalizeDrugRow, scoreDrugMatch, calcNameSimilarity, findDuplicateDrug, scopeClause,
  normalizeDoseUnit, normalizeCapacityUnit, normalizeManufacturer, normalizeSpecText
};
