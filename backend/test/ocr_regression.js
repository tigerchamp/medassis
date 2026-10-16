/**
 * OCR 解析回归测试
 * 用法：node backend/test/ocr_regression.js
 *
 * 样本见 ./ocr_samples.js（真实病历），另含药品/处方/报告的判定回归。
 */
const { parse, detectType } = require('../src/services/ocr.js');
const samples = require('./ocr_samples.js');

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = String(actual || '') === String(expected || '');
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(10)}= ${actual || '(空)'}${ok ? '' : `   期望: ${expected}`}`);
};

// ---------- 1. 病历样本字段解析 ----------
for (const [name, s] of Object.entries(samples)) {
  console.log(`\n[病历] ${name}`);
  const r = parse(s.type, s.text);
  for (const [k, v] of Object.entries(s.expect)) check(k, r[k], v);
  // 主诉不应把后面的正文都吞进来
  const cc = String(r.chiefComplaint || '');
  console.log(`  ${cc.length <= 40 ? 'OK  ' : 'FAIL'}  主诉长度  = ${cc.length}${cc.length <= 40 ? '' : '   疑似吸收了过多正文'}`);
  if (cc.length <= 40) pass++; else fail++;
}

// ---------- 2. 类型判定回归 ----------
console.log('\n[类型判定]');
const typeCases = [
  ['邦之 匹伐他汀钙片药盒', '邦之\n®\n匹伐他汀钙片\nPitavastatin Calcium Tablets\n一\n2mg\nFOSUNPHARMA\n复星医药\n14片/盒', 'drug'],
  ['只剩药名+剂量', '匹伐他汀钙片\n2mg', 'drug'],
  ['处方药盒(国药准字齐全)', '阿托伐他汀钙片\n20mg*7片\n凭医师处方销售、购买和使用！\n批准文号：国药准字H20051408\n生产日期：20240105\n有效期至：202612\n生产企业：北京嘉林药业股份有限公司', 'drug'],
  ['处方药盒(漏国药准字)', '阿托伐他汀钙片\n20mg*7片\n凭医师处方销售、购买和使用！\n生产日期：20240105\n有效期至：202612\n生产企业：北京嘉林药业股份有限公司', 'drug'],
  ['OTC药盒', '布洛芬缓释胶囊\n0.3g*20粒\nOTC\n生产企业：中美天津史克制药有限公司', 'drug'],
  ['处方笺', 'XX医院门诊处方笺\n科室：心内科\n姓名：张三 性别：男 年龄：60\n临床诊断：高血压\nRp:\n阿托伐他汀钙片 20mg*7\n用法：口服，每日1次，每次1片\n医师：李四\n金额：128.50', 'prescription'],
  ['化验报告', 'XX医院检验报告单\n标本：血清\n项目名称 结果 单位 参考范围\n丙氨酸氨基转移酶 43.5 U/L 9-50\n报告医师：赵六', 'report']
];
for (const [label, text, expect] of typeCases) check(label, detectType(text), expect);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
