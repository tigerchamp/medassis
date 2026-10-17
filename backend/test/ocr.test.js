/**
 * OCR 解析回归测试
 * 覆盖：类型自动判定 / 病历字段解析 / 药盒规格解析
 *
 * 样本来自真实病历，见 ./ocr_samples.js
 * 跑：npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { detectType, parseRecord, parseDrug } = require('../src/services/ocr.js');
const samples = require('./ocr_samples.js');

// ============ 1. 类型自动判定 ============
const TYPE_CASES = [
  ['药盒(邦之 匹伐他汀钙片)', '邦之\n®\n匹伐他汀钙片\nPitavastatin Calcium Tablets\n一\n2mg\nFOSUNPHARMA\n复星医药\n14片/盒', 'drug'],
  ['药盒只剩药名+剂量', '匹伐他汀钙片\n2mg', 'drug'],
  ['药盒(带*包装数)', '阿托伐他汀钙片\n20mg*7', 'drug'],
  ['处方药盒(国药准字齐全)', '阿托伐他汀钙片\n20mg*7片\n凭医师处方销售、购买和使用！\n批准文号：国药准字H20051408\n生产日期：20240105\n有效期至：202612\n生产企业：北京嘉林药业股份有限公司', 'drug'],
  ['处方药盒(国药准字漏识别)', '阿托伐他汀钙片\n20mg*7片\n凭医师处方销售、购买和使用！\n生产日期：20240105\n有效期至：202612\n生产企业：北京嘉林药业股份有限公司', 'drug'],
  ['OTC药盒', '布洛芬缓释胶囊\n0.3g*20粒\nOTC\n生产企业：中美天津史克制药有限公司', 'drug'],
  ['处方笺(完整)', 'XX医院门诊处方笺\n科室：心内科\n姓名：张三 性别：男 年龄：60\n临床诊断：高血压\nRp:\n阿托伐他汀钙片 20mg*7\n用法：口服，每日1次，每次1片\n医师：李四\n金额：128.50', 'prescription'],
  ['处方笺(用法用量表头)', 'XX医院处方笺\n药品名称 规格 数量 用法用量\n阿托伐他汀钙片 20mg*7 1盒 口服每日1次\n医师：李四', 'prescription'],
  ['处方笺(仅Rp)', 'Rp\n阿托伐他汀钙片 20mg*7\n用法：口服 每日1次', 'prescription'],
  ['化验报告', 'XX医院检验报告单\n标本：血清\n项目名称 结果 单位 参考范围\n丙氨酸氨基转移酶 43.5 U/L 9-50\n报告医师：赵六', 'report'],
  ['体检报告(含注意事项)', '健康体检报告\n检查项目：腹部超声\n检查所见：肝脏大小正常\n注意事项：请空腹检查', 'report'],
  ['门诊病历', 'XX医院门诊病历\n主诉：头晕乏力3天\n初步诊断：高血压2级\n处置：硝苯地平控释片 30mg*7 口服 每日1次\n医师：王五', 'record'],
  ['空文本', '', 'record']
];

for (const [label, text, expect] of TYPE_CASES) {
  test(`类型判定 / ${label}`, () => {
    assert.equal(detectType(text), expect);
  });
}

// ============ 2. 病历字段解析（真实样本） ============
for (const [name, s] of Object.entries(samples)) {
  if (s.type !== 'record') continue;
  test(`病历解析 / ${name}`, () => {
    const r = parseRecord(s.text);
    for (const [k, v] of Object.entries(s.expect)) {
      assert.equal(r[k], v, `${name} 的 ${k} 字段`);
    }
    // 主诉不应把后面整份正文都吞进来
    const cc = String(r.chiefComplaint || '');
    assert.ok(cc.length <= 40, `主诉过长(${cc.length}字)，疑似吸收了后续正文`);
    // 诊断不应混入"西药方/中药方/医生签名"这类后续短行
    const dx = String(r.diagnosis || '');
    ['西药方', '中药方', '何春', '医生', '医师', '签名'].forEach(noisy => {
      assert.ok(!dx.includes(noisy), `诊断混入了噪声词「${noisy}」`);
    });
  });
}

// ============ 3. 药盒规格解析 ============
const DRUG_CASES = [
  {
    label: '药盒正面板式（剂量与包装分行）',
    text: '邦之\n®\n匹伐他汀钙片\nPitavastatin Calcium Tablets\n一\n2mg\nFOSUNPHARMA\n复星医药\n14片/盒',
    expect: { name: '匹伐他汀钙片', specification: '2mg', specDosage: '2', specDosageUnit: 'mg', unitCapacity: '14', unitCapacityUnit: '片' }
  },
  {
    label: '带*的规格写法',
    text: '阿托伐他汀钙片\n20mg*7片\n批准文号：国药准字H20051408\n生产企业：北京嘉林药业股份有限公司',
    expect: { name: '阿托伐他汀钙片', specDosage: '20', specDosageUnit: 'mg', unitCapacity: '7', unitCapacityUnit: '片', manufacturer: '北京嘉林药业股份有限公司' }
  },
  {
    label: '私有药：无单位容量（兜底为片）',
    text: '布洛芬缓释胶囊\n0.3g',
    expect: { name: '布洛芬缓释胶囊', specDosage: '0.3', specDosageUnit: 'g', unitCapacity: '' }
  }
];

for (const c of DRUG_CASES) {
  test(`药盒解析 / ${c.label}`, () => {
    const r = parseDrug(c.text);
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal(String(r[k] == null ? '' : r[k]), String(v), `${c.label} 的 ${k} 字段`);
    }
  });
}
