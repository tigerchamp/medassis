// 用药计划「结束日期」校验回归：validateMedEndDate 是纯函数，直接从源码 eval 出来测。
// 背景：用户可能忘了及时点结束，所以结束日期允许往回补填，但不能早于开始服药日期、不能晚于今天。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');
const start = src.indexOf('function validateMedEndDate');
assert.notEqual(start, -1, 'js/app.js 里找不到 validateMedEndDate');
const endIdx = src.indexOf('' + String.fromCharCode(10) + '}', start);
assert.ok(endIdx > start, '找不到 validateMedEndDate 的结尾');
eval(src.slice(start, endIdx + 2) + '; global.__v = validateMedEndDate;');
const validate = global.__v;

const TODAY = '2026-10-25';
const START = '2026-10-01';

test('M4.1-01 结束日期 = 今天（最常见）→ 通过', () => {
  assert.equal(validate(TODAY, START, TODAY), '');
});

test('M4.1-02 忘了及时结束，往前补填（开始日期之后）→ 通过', () => {
  assert.equal(validate('2026-10-20', START, TODAY), '');
});

test('M4.1-03 结束日期 = 开始服药日期（当天开始当天停）→ 通过', () => {
  assert.equal(validate(START, START, TODAY), '');
});

test('M4.1-04 ★ 早于开始服药日期 → 报错，且提示里带开始日期', () => {
  const msg = validate('2026-09-30', START, TODAY);
  assert.notEqual(msg, '');
  assert.ok(msg.includes(START), '错误信息里要说明不能早于哪天：' + msg);
});

test('M4.1-05 ★ 晚于今天 → 报错', () => {
  assert.notEqual(validate('2026-10-26', START, TODAY), '');
  assert.notEqual(validate('2027-01-01', START, TODAY), '');
});

test('M4.1-06 没选日期 / 格式不对 → 提示选择结束日期', () => {
  assert.equal(validate('', START, TODAY), '请选择结束日期');
  assert.equal(validate('2026/10/20', START, TODAY), '请选择结束日期');
  assert.equal(validate('2026-10', START, TODAY), '请选择结束日期');
});

test('M4.1-07 没有开始服药日期时只校验不晚于今天', () => {
  assert.equal(validate('2020-01-01', '', TODAY), ''); // 远早于今天也放行（开始日期未知）
  assert.equal(validate(TODAY, '', TODAY), '');
  assert.notEqual(validate('2026-10-26', '', TODAY), '');
});

test('M4.1-08 字符串比较而非 new Date 比较（跨月/跨年边界）', () => {
  assert.equal(validate('2027-01-01', '2026-12-31', '2027-01-01'), '');
  assert.notEqual(validate('2026-12-31', '2027-01-01', '2027-01-01'), '');
});
