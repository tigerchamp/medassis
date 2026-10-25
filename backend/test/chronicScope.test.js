// 长期用药「保存时删哪些行」的范围回归（纯函数，不需要 MySQL）
//
// 背景：同一个登录账号可以替家里几个人设置长期用药（成员档案页 → 长期用药）。
// 早先 saveChronicMeds 的 DELETE 只按 user_id + family_id，给成员 B 保存会把成员 A 的一起删掉。
// 这条守的是「只删当前服药人的」，改回一把删会立刻踩雷。
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteChronicSql, deleteChronicParams } = require('../src/controllers/drugController.js');

test('M3.1-01 ★ 有 elderId 时 DELETE 必须按服药人限定（不能跨成员删）', () => {
  const sql = deleteChronicSql('elder-b');
  assert.ok(sql.includes('cm.elder_id'), 'DELETE 要按 cm.elder_id 限定：' + sql);
  assert.ok(sql.includes('di.elder_id'), '历史数据（cm.elder_id 为 NULL）要按库存归属兜底：' + sql);
  assert.deepEqual(deleteChronicParams('u1', 'f1', 'elder-b'), ['u1', 'f1', 'elder-b', 'elder-b']);
});

test('M3.1-02 没给 elderId 时退回旧行为（只按 user_id + family_id）', () => {
  const sql = deleteChronicSql(null);
  assert.ok(!sql.includes('cm.elder_id'), '没有服药人时不该带 elder 条件');
  assert.deepEqual(deleteChronicParams('u1', 'f1', null), ['u1', 'f1']);
});

test('M3.1-03 参数个数与 SQL 里的占位符一致', () => {
  const sql = deleteChronicSql('elder-b');
  const holes = (sql.match(/\?/g) || []).length;
  assert.equal(holes, deleteChronicParams('u1', 'f1', 'elder-b').length,
    '占位符个数和参数个数对不上会导致 SQL 报错：' + sql);
});
