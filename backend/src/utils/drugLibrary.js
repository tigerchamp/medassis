const { getPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { pinyin } = require('pinyin-pro');

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

/**
 * 解析药品编码：优先使用传入的 drugCode（需在 drugs 表存在）；
 * 否则按名称精确匹配 drugs 表；若仍未匹配到，则将该药品新增入库（UUID 作为 code）。
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
  const scope = familyUserIds && familyUserIds.length
    ? `(owner_user_id IS NULL OR owner_user_id IN (${familyUserIds.map(() => '?').join(',')}))`
    : `owner_user_id IS NULL`;
  const scopeParams = familyUserIds && familyUserIds.length ? familyUserIds : [];

  const trimmedName = (name || '').trim();
  if (!trimmedName && !drugCode) {
    throw new Error('药品名称不能为空');
  }

  // 1) 前端传入 drugCode：校验存在性（限定可见范围）
  if (drugCode) {
    const [rows] = await pool.query(
      `SELECT code, name, specification, manufacturer, dosage_form, approval_number, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit FROM drugs WHERE code = ? AND ${scope} LIMIT 1`,
      [drugCode, ...scopeParams]
    );
    if (rows.length > 0) {
      const r = rows[0];
      let specDosageVal = r.spec_dosage != null ? Number(r.spec_dosage) : null;
      let specDosageUnitVal = r.spec_dosage_unit || '';
      // 若 spec_dosage 为空，尝试从 specification 解析并回写
      if (specDosageVal === null && r.specification) {
        const parsed = parseSpecification(r.specification);
        if (parsed.specDosage !== null) {
          specDosageVal = parsed.specDosage;
          specDosageUnitVal = parsed.specDosageUnit || '';
          await pool.query(
            'UPDATE drugs SET spec_dosage = ?, spec_dosage_unit = ? WHERE code = ? AND spec_dosage IS NULL',
            [specDosageVal, specDosageUnitVal, r.code]
          );
        }
      }
      return {
        code: r.code,
        name: r.name,
        specification: r.specification || '',
        manufacturer: r.manufacturer || '',
        dosageForm: r.dosage_form || '',
        approvalNumber: r.approval_number || '',
        specDosage: specDosageVal,
        specDosageUnit: specDosageUnitVal,
        unitCapacity: r.unit_capacity != null ? Number(r.unit_capacity) : null,
        unitCapacityUnit: r.unit_capacity_unit || '',
        created: false
      };
    }
    // drugCode 无效则继续走名称匹配
  }

  // 2) 按名称精确匹配（限定可见范围）
  if (trimmedName) {
    const [rows] = await pool.query(
      `SELECT code, name, specification, manufacturer, dosage_form, approval_number, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit FROM drugs WHERE name = ? AND ${scope} LIMIT 1`,
      [trimmedName, ...scopeParams]
    );
    if (rows.length > 0) {
      const r = rows[0];
      let specDosageVal = r.spec_dosage != null ? Number(r.spec_dosage) : null;
      let specDosageUnitVal = r.spec_dosage_unit || '';
      if (specDosageVal === null && r.specification) {
        const parsed = parseSpecification(r.specification);
        if (parsed.specDosage !== null) {
          specDosageVal = parsed.specDosage;
          specDosageUnitVal = parsed.specDosageUnit || '';
          await pool.query(
            'UPDATE drugs SET spec_dosage = ?, spec_dosage_unit = ? WHERE code = ? AND spec_dosage IS NULL',
            [specDosageVal, specDosageUnitVal, r.code]
          );
        }
      }
      return {
        code: r.code,
        name: r.name,
        specification: r.specification || '',
        manufacturer: r.manufacturer || '',
        dosageForm: r.dosage_form || '',
        approvalNumber: r.approval_number || '',
        specDosage: specDosageVal,
        specDosageUnit: specDosageUnitVal,
        unitCapacity: r.unit_capacity != null ? Number(r.unit_capacity) : null,
        unitCapacityUnit: r.unit_capacity_unit || '',
        created: false
      };
    }
  }

  // 3) 未匹配到：新增入库（UUID 作为 code，避免与国家本位码冲突），写入 owner_user_id 标记私有
  const newCode = uuidv4();
  const pinyinAbbr = getPinyinAbbr(trimmedName);
  await pool.query(
    `INSERT INTO drugs (code, approval_number, name, pinyin_abbr, dosage_form, specification, spec_dosage, spec_dosage_unit, unit_capacity, unit_capacity_unit, manufacturer, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newCode, approvalNumber || null, trimmedName, pinyinAbbr, dosageForm || null, specification || null, specDosage || null, specDosageUnit || null, unitCapacity || null, unitCapacityUnit || null, manufacturer || null, ownerUserId || null]
  );

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

module.exports = { getPinyinAbbr, parseSpecification, resolveDrugCode };
