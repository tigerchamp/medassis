// 服药时间段「默认选中」回归：每日 2 次必须是 早+晚，不能是 早+中
// MedTimesUI 是纯对象（只有方法体里才碰 DOM），直接从源码 eval 出来测 defaultKeys，
// 避免为前端逻辑引入 jsdom。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');
const start = src.indexOf('const MedTimesUI = {');
assert.notEqual(start, -1, 'js/app.js 里找不到 MedTimesUI');
// js/app.js 是 CRLF 行尾，不能写死 '\n};\n'，否则切出来的代码不完整
const m = /\r?\n\};\r?\n/.exec(src.slice(start));
assert.ok(m, '找不到 MedTimesUI 的结尾');
const code = src.slice(start, start + m.index + m[0].length);
eval(`${code}; global.__MedTimesUI = MedTimesUI;`);
const MedTimesUI = global.__MedTimesUI;

test('★ 每日 2 次 → 早 + 晚（不是早 + 中）', () => {
  assert.deepEqual(MedTimesUI.defaultKeys(2), ['morning', 'evening']);
});

test('每日 1 次 → 早', () => {
  assert.deepEqual(MedTimesUI.defaultKeys(1), ['morning']);
});

test('每日 3 次 → 早 / 中 / 晚', () => {
  assert.deepEqual(MedTimesUI.defaultKeys(3), ['morning', 'noon', 'evening']);
});

test('每日 4 次 → 四个时间段全选', () => {
  assert.deepEqual(MedTimesUI.defaultKeys(4), ['morning', 'noon', 'evening', 'night']);
});

test('频次非法或越界时兜底：向下取 1 次，向上取全部', () => {
  assert.deepEqual(MedTimesUI.defaultKeys(0), ['morning']);
  assert.deepEqual(MedTimesUI.defaultKeys('abc'), ['morning']);
  assert.deepEqual(MedTimesUI.defaultKeys(99), MedTimesUI.slots.map(s => s.key));
});

test('返回的是副本，调用方改动不会污染下一次默认值', () => {
  const keys = MedTimesUI.defaultKeys(2);
  keys.push('noon');
  assert.deepEqual(MedTimesUI.defaultKeys(2), ['morning', 'evening']);
});
