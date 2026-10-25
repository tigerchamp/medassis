// 入库记录「余量」校验回归：validateRemainingQuantity 是纯函数，直接 require 控制器测（无需 DB）。
// 背景：用户在药品详情的「添加记录」里可以把余量改成比初始数量还大的数，这是不对的。
// 余量是「还剩下多少」，不能是负数，也不能比这条入库记录的初始数量（total）多。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRemainingQuantity } = require('../src/controllers/drugController.js');

test('M2.1-01 余量等于初始数量 → 通过', () => {
  assert.equal(validateRemainingQuantity(10, 10), '');
});

test('M2.1-02 余量小于初始数量 → 通过', () => {
  assert.equal(validateRemainingQuantity(3, 10), '');
});

test('M2.1-03 ★ 余量大于初始数量 → 报错（这正是要拦住的 bug）', () => {
  const msg = validateRemainingQuantity(5, 1);
  assert.notEqual(msg, '');
  assert.ok(msg.includes('初始数量'), '要提示不能大于初始数量：' + msg);
});

test('M2.1-04 余量为负 → 报错', () => {
  assert.notEqual(validateRemainingQuantity(-1, 10), '');
});

test('M2.1-05 余量非数字 → 报错', () => {
  assert.notEqual(validateRemainingQuantity('abc', 10), '');
});

test('M2.1-06 total 缺失（null/undefined）→ 按 0 处理，任何正数都超限', () => {
  assert.notEqual(validateRemainingQuantity(1, null), '');
  assert.notEqual(validateRemainingQuantity(1, undefined), '');
});
