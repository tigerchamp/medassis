/**
 * 药品库工具函数单元测试（纯逻辑，不需要数据库）
 * 跑：npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPinyinAbbr, parseSpecification, normalizeDrugRow,
  scoreDrugMatch, calcNameSimilarity,
  normalizeDoseUnit, normalizeCapacityUnit, normalizeManufacturer, normalizeSpecText
} = require('../src/utils/drugLibrary.js');

test('拼音首字母缩写', () => {
  assert.equal(getPinyinAbbr('三黄片'), 'SHP');
  assert.equal(getPinyinAbbr('匹伐他汀钙片'), 'PFTTGP');
  assert.equal(getPinyinAbbr(''), '');
});

test('规格文本解析：数字+单位', () => {
  assert.deepEqual(parseSpecification('0.25g'), { specDosage: 0.25, specDosageUnit: 'g' });
  assert.deepEqual(parseSpecification('2mg'), { specDosage: 2, specDosageUnit: 'mg' });
  assert.deepEqual(parseSpecification('50μg'), { specDosage: 50, specDosageUnit: 'μg' });
  // 括号内容需先剔除
  assert.deepEqual(parseSpecification('0.1g(按C16H19N3O5S计)'), { specDosage: 0.1, specDosageUnit: 'g' });
  assert.deepEqual(parseSpecification(''), { specDosage: null, specDosageUnit: null });
});

test('剂量单位归一化', () => {
  assert.equal(normalizeDoseUnit('ug'), 'μg');
  assert.equal(normalizeDoseUnit('毫克'), 'mg');
  assert.equal(normalizeDoseUnit('克'), 'g');
  assert.equal(normalizeDoseUnit('mg'), 'mg');
});

test('单位容量单位归一化（别名）', () => {
  assert.equal(normalizeCapacityUnit('颗'), '粒');
  assert.equal(normalizeCapacityUnit('枚'), '粒');
  assert.equal(normalizeCapacityUnit('片'), '片');
});

test('厂商归一化：剥离企业后缀', () => {
  assert.equal(normalizeManufacturer('北京嘉林药业股份有限公司'), '北京嘉林');
  assert.equal(normalizeManufacturer('中美天津史克制药有限公司'), '中美天津史克');
});

test('规格文本归一化：统一乘号并小写', () => {
  assert.equal(normalizeSpecText('20MG×7'), '20mg*7');
});

test('综合评分：名称一致 + 规格一致 → 可自动选中', () => {
  const q = { name: '匹伐他汀钙片', specDosage: '2', specDosageUnit: 'mg', unitCapacity: '14', unitCapacityUnit: '片' };
  const drug = normalizeDrugRow({
    code: 'c1', name: '匹伐他汀钙片',
    spec_dosage: 2, spec_dosage_unit: 'mg',
    unit_capacity: 14, unit_capacity_unit: '片',
    manufacturer: '复星万邦（江苏）医药集团有限公司', specification: '2mg'
  });
  const m = scoreDrugMatch(q, drug);
  assert.equal(m.nameEq, true);
  assert.deepEqual(m.conflicts, []);
  assert.ok(m.agreements.includes('specDosage'), '规格应记为一致');
  assert.ok(m.agreements.includes('unitCapacity'), '单位容量应记为一致');
  assert.equal(m.canAutoSelect, true);
});

test('综合评分：规格冲突 → 扣分且不可自动选中', () => {
  const q = { name: '匹伐他汀钙片', specDosage: '2', specDosageUnit: 'mg' };
  const drug = normalizeDrugRow({
    code: 'c1', name: '匹伐他汀钙片', spec_dosage: 20, spec_dosage_unit: 'mg'
  });
  const m = scoreDrugMatch(q, drug);
  assert.ok(m.conflicts.includes('specDosage'));
  assert.equal(m.canAutoSelect, false);
});

test('归一化：spec_dosage 为空时从 specification 解析', () => {
  const n = normalizeDrugRow({ code: 'c1', name: '布洛芬缓释胶囊', spec_dosage: null, specification: '0.3g*20粒', unit_capacity: 20, unit_capacity_unit: '粒' });
  assert.equal(n.specDosage, 0.3);
  assert.equal(n.specDosageUnit, 'g');
});
