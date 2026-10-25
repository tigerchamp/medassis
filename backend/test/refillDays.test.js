// 开药倒计时「剩余天数」回归：calcRefillDays 是纯函数，直接从源码 eval 出来测。
// 背景：用户把某长期药余量改成 5，首页倒计时却仍显示「剩余 0 天」。
// 根因：原公式 daysLeft = qty*packDays - daysUsed，daysUsed 是「用药起始日至今」，
// 长期药起始日早、daysUsed 远大于库存天数，于是余量改多大都算成 0。
// 现在余量是「当前剩余库存」，天数 = qty * packDays，不再减 daysUsed。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');
const start = src.indexOf('function calcRefillDays');
assert.notEqual(start, -1, 'js/app.js 里找不到 calcRefillDays');
const endIdx = src.indexOf('function validateMedEndDate');
assert.ok(endIdx > start, '找不到 calcRefillDays 的结尾');
const block = src.slice(start, endIdx);
eval(block + '; global.__f = calcRefillDays;');
const calc = global.__f;

// 复刻「旧公式」用于对比，证明新公式修好了 bug
const oldFormula = (qty, packDays, daysUsed) => (qty <= 0 ? 0 : Math.max(0, qty * packDays - daysUsed));

test('M2.2-01 正常：余量 5 盒、每盒 30 天 → 150 天', () => {
  assert.equal(calc(5, 30), 150);
});

test('M2.2-02 余量为 0 → 0 天', () => {
  assert.equal(calc(0, 30), 0);
});

test('M2.2-03 ★ 关键回归：长期药起始日早（daysUsed 很大）也不该再算成 0 天', () => {
  const qty = 5, packDays = 30, daysUsed = 400; // 吃了一年多
  // 旧公式：max(0, 150 - 400) = 0  → 这是用户看到的 bug
  assert.equal(oldFormula(qty, packDays, daysUsed), 0);
  // 新公式：只按当前剩余库存算 → 150
  assert.equal(calc(qty, packDays), 150);
});

test('M2.2-04 余量为负 → 0 天（不出现负数天数）', () => {
  assert.equal(calc(-3, 30), 0);
});

test('M2.2-05 小数向下取整', () => {
  assert.equal(calc(1, 30.4), 30);
});

test('M2.2-06 非数字输入兜底为 0', () => {
  assert.equal(calc('abc', 30), 0);
  assert.equal(calc(null, 30), 0);
});
