/**
 * 成员编辑 / 删除权限回归（纯内存，不需要 MySQL）
 *
 * 背景（Issue #2）：
 *  - 手动添加的成员（elders.user_id 为空，一般是老人或小孩）家庭组里人人该能编辑，不做授权控制；
 *  - 这种成员只有家庭管理员能删，且删除是「转注册账号 + 解绑」，不是真删数据。
 * 守的是 canModifyElder 的三条分支和 checkElderDeletable 的白名单。
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { fakePool, db } = require('../src/mock/fakePool.js');
const {
  isManualMember,
  checkElderDeletable,
  canModifyElder,
  isFamilyAdmin,
  isFamilyMember
} = require('../src/utils/familyAccess.js');

const FAM = 'fam-1';
const OTHER_FAM = 'fam-2';

function seedAuth() {
  db.families = [
    { id: FAM, name: '家', invite_code: 'AAA111' },
    { id: OTHER_FAM, name: '别家', invite_code: 'BBB222' }
  ];
  db.users = [
    { id: 'u-admin', name: '管理员', role: 'admin', family_id: FAM },
    { id: 'u-member', name: '普通成员', role: 'member', family_id: FAM },
    { id: 'u-outsider', name: '外人', role: 'admin', family_id: OTHER_FAM }
  ];
  db.user_families = [
    { id: 'uf1', user_id: 'u-admin', family_id: FAM, role: 'admin' },
    { id: 'uf2', user_id: 'u-member', family_id: FAM, role: 'member' },
    { id: 'uf3', user_id: 'u-outsider', family_id: OTHER_FAM, role: 'admin' }
  ];
  db.elders = [
    { id: 'e-manual', family_id: FAM, user_id: null, name: '奶奶', relation: 'parent' },
    { id: 'e-self-admin', family_id: FAM, user_id: 'u-admin', name: '管理员', relation: 'self' },
    { id: 'e-self-member', family_id: FAM, user_id: 'u-member', name: '普通成员', relation: 'self' },
    { id: 'e-other-family', family_id: OTHER_FAM, user_id: null, name: '别家奶奶', relation: 'parent' }
  ];
  db.member_authorizations = [
    { id: 'a1', granter_user_id: 'u-admin', grantee_user_id: 'u-member', authorized: true }
  ];
}

test('M1.2-01 手动添加的成员：无 user_id 才算，self 档案不算', () => {
  assert.equal(isManualMember({ user_id: null }), true);
  assert.equal(isManualMember({ user_id: 'u1' }), false);
  assert.equal(isManualMember(null), false);
});

test('M1.2-02 ★ 手动添加的成员：家庭组内任何成员都可编辑，不看授权表', async () => {
  seedAuth();
  assert.equal(await canModifyElder(fakePool, 'e-manual', 'u-member', FAM), true,
    '普通成员也应能改手动添加的成员');
  assert.equal(await canModifyElder(fakePool, 'e-manual', 'u-admin', FAM), true);
});

test('M1.2-03 手动添加的成员：跨家庭成员不能改', async () => {
  seedAuth();
  assert.equal(await canModifyElder(fakePool, 'e-manual', 'u-outsider', FAM), false);
  assert.equal(await canModifyElder(fakePool, 'e-manual', 'u-outsider', OTHER_FAM), false,
    '传了当前家庭时，档案不属于该家庭一律拒绝');
});

test('M1.2-04 绑定账号的成员仍走授权表：未授权不能改，授权后能改', async () => {
  seedAuth();
  // 普通成员改管理员的 self 档案：管理员已授权 → 允许
  assert.equal(await canModifyElder(fakePool, 'e-self-admin', 'u-member', FAM), true);
  // 管理员改普通成员的 self 档案：反向没有授权记录 → 拒绝
  assert.equal(await canModifyElder(fakePool, 'e-self-member', 'u-admin', FAM), false);
  // 自己的档案恒可改
  assert.equal(await canModifyElder(fakePool, 'e-self-member', 'u-member', FAM), true);
});

test('M1.2-05 ★ 删除只对手动添加的成员开放，绑定账号的必须走「移出家庭组」', () => {
  assert.equal(checkElderDeletable({ user_id: null }), '');
  assert.match(checkElderDeletable({ user_id: 'u-member' }), /移出家庭组/);
  assert.match(checkElderDeletable(null), /不存在/);
});

test('M1.2-06 家庭角色按 user_families 判定，不能拿全局 users.role 顶替', async () => {
  seedAuth();
  assert.equal(await isFamilyAdmin(fakePool, 'u-admin', FAM), true);
  assert.equal(await isFamilyAdmin(fakePool, 'u-member', FAM), false,
    '普通成员在自己家不是管理员');
  // 外人在别的家庭是 admin，但在这个家庭不是成员
  assert.equal(await isFamilyAdmin(fakePool, 'u-outsider', FAM), false);
  assert.equal(await isFamilyMember(fakePool, 'u-outsider', FAM), false);
  assert.equal(await isFamilyMember(fakePool, 'u-member', FAM), true);
});
