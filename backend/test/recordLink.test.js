// 自动关联病历的候选筛选逻辑回归
// js/app.js 里的 filterRecordCandidates 是纯函数（不依赖 DOM / 网络），
// 直接从源码 eval 出来测，避免为前端逻辑引入 jsdom。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');
const start = src.indexOf('function filterRecordCandidates');
assert.notEqual(start, -1, 'js/app.js 里找不到 filterRecordCandidates');
// js/app.js 是 CRLF 行尾，不能写死 '\n}\n'，否则切出来的代码不完整
const m = /\n\r?\}\r?\n/.exec(src.slice(start));
assert.ok(m, '找不到 filterRecordCandidates 的结尾');
const code = src.slice(start, start + m.index + m[0].length);
// 注意：本地变量不能也叫 filterRecordCandidates，否则 eval 里的函数声明
// 会命中模块作用域里处于 TDZ 的同名绑定，报 "before initialization"
eval(`${code}; global.__filterRecordCandidates = filterRecordCandidates;`);
const filter = global.__filterRecordCandidates;

// 库里的真实病历（2026-10-16 建外第二社区卫生服务中心，医生字段为空）
const target = {
  id: '9d9a61d0', visitDate: '2026-10-16',
  hospital: '北京市朝阳区建外第二社区卫生服务中心', department: '全科', doctor: ''
};

test('★ 实拍场景：处方 OCR 出姓氏「王」，病历医生为空 → 必须命中', () => {
  const out = filter([target], '2026-10-16', '全科', '王');
  assert.equal(out.length, 1, '被医生的空值整条筛掉了');
  assert.equal(out[0].id, target.id);
});

test('病历有全名、处方只有姓氏 → 命中', () => {
  const rec = { ...target, doctor: '王建国' };
  const out = filter([rec], '2026-10-16', '全科', '王');
  assert.equal(out.length, 1);
});

test('两边医生都不同 → 不命中', () => {
  const rec = { ...target, doctor: '何春' };
  const out = filter([rec], '2026-10-16', '全科', '王');
  assert.equal(out.length, 0);
});

test('就诊日期不同 → 不命中', () => {
  const out = filter([target], '2026-10-17', '全科', '王');
  assert.equal(out.length, 0);
});

test('科室不同 → 不命中', () => {
  const out = filter([target], '2026-10-16', '骨科', '王');
  assert.equal(out.length, 0);
});

test('日期或科室缺失 → 直接返回空，不做宽泛匹配', () => {
  assert.equal(filter([target], '', '全科', '王').length, 0);
  assert.equal(filter([target], '2026-10-16', '', '王').length, 0);
});

test('科室名含空格/全角差异时归一后仍命中', () => {
  const rec = { ...target, department: ' 全科 ' };
  const out = filter([rec], '2026-10-16', '全科', '王');
  assert.equal(out.length, 1);
});

test('同名就诊有多条候选时全部保留（交给上层按医院/唯一性兜底）', () => {
  const recs = [target, { ...target, id: 'other', doctor: '王' }];
  const out = filter(recs, '2026-10-16', '全科', '王');
  assert.equal(out.length, 2);
});
