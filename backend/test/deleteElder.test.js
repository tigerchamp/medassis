/**
 * 删除成员 = 「转注册成员 + 解绑」，不是真删数据（Issue #2）
 *
 * 背景：管理员删掉的手动成员，往往是家里老人几年攒下的病历和用药记录。
 * 前端仍按硬删除警告（用户要的就是这个心理警戒），但后端必须保留数据：
 * 给该成员分配随机账号、把档案与全部关联数据迁到它的新家庭组，
 * 这样本家庭再也看不到（体感=删了），管理员误删却还有救。
 *
 * 本测试用内存 fakePool 顶上 getPool()，不需要 MySQL。
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fakePool, db } = require('../src/mock/fakePool.js');

// 让 controller 拿到内存库而不是真实连接池（必须在 require controller 之前）
require.cache[require.resolve('../src/config/database.js')] = {
  exports: { getPool: () => fakePool }
};
const { deleteElder } = require('../src/controllers/elderController.js');

const FAM = 'fam-home';
const OTHER_FAM = 'fam-other';

function setup() {
  db.families = [{ id: FAM, name: '家', invite_code: 'AAA111' }];
  db.users = [
    { id: 'u-admin', name: '管理员', phone: '13800000001', password: 'x', role: 'admin', family_id: FAM },
    { id: 'u-member', name: '普通成员', phone: '13800000002', password: 'x', role: 'member', family_id: FAM }
  ];
  db.user_families = [
    { id: 'uf1', user_id: 'u-admin', family_id: FAM, role: 'admin' },
    { id: 'uf2', user_id: 'u-member', family_id: FAM, role: 'member' }
  ];
  db.elders = [
    { id: 'e-manual', family_id: FAM, user_id: null, name: '奶奶', avatar: '奶', relation: 'parent' },
    { id: 'e-bound', family_id: FAM, user_id: 'u-member', name: '普通成员', relation: 'self' }
  ];
  db.records = [{ id: 'r1', elder_id: 'e-manual', family_id: FAM }];
  db.medications = [{ id: 'm1', elder_id: 'e-manual', family_id: FAM }];
  db.drug_inventory = [{ id: 'd1', elder_id: 'e-manual', family_id: FAM }];
  db.chronic_medications = [{ id: 'cm1', user_id: 'u-admin', family_id: FAM, elder_id: 'e-manual', drug_inventory_id: 'd1' }];
  db.med_logs = [];
}

function call(req) {
  return new Promise((resolve) => {
    const res = {
      code: 200,
      body: null,
      json(b) { this.body = b; resolve(this); },
      status(c) { this.code = c; return this; }
    };
    deleteElder(req, res).catch(err => { res.code = 500; res.body = { error: err.message }; resolve(res); });
  });
}

test('M1.2-07 ★ 管理员删除手动成员：不真删，档案与全部关联数据迁到新家庭组', async () => {
  setup();
  const res = await call({ params: { id: 'e-manual' }, familyId: FAM, user: db.users[0] });
  assert.equal(res.code, 200);

  const elder = db.elders.find(e => e.id === 'e-manual');
  assert.ok(elder, '档案行必须还在（数据没销毁）');
  assert.notEqual(elder.family_id, FAM, '档案必须离开原家庭');
  assert.ok(elder.user_id, '必须挂到一个新分配的随机账号上');
  assert.equal(elder.relation, 'self', '转注册成员后，对那个账号来说就是「本人」');

  const newUser = db.users.find(u => u.id === elder.user_id);
  assert.ok(newUser, '随机账号必须真的建出来');
  assert.equal(newUser.family_id, elder.family_id);
  assert.ok(/^\d{11}$/.test(String(newUser.phone)), '随机账号要有可用于登录的手机号');
  assert.ok(newUser.password, '随机账号要有密码');

  assert.equal(db.families.find(f => f.id === elder.family_id).name, '奶奶的家庭');

  // 关联数据全部跟着走，否则新账号登录后看不到自己的病历
  for (const t of ['records', 'medications', 'drug_inventory']) {
    const row = db[t].find(r => r.id === { records: 'r1', medications: 'm1', drug_inventory: 'd1' }[t]);
    assert.equal(row.family_id, elder.family_id, `${t} 的 family_id 必须迁移`);
  }
  const cm = db.chronic_medications.find(c => c.id === 'cm1');
  assert.equal(cm.family_id, elder.family_id, '长期用药的 family_id 必须迁移');
  assert.equal(cm.user_id, elder.user_id, '长期用药的 owner 要转给新账号');
});

test('M1.2-08 非管理员不能删手动成员', async () => {
  setup();
  const res = await call({ params: { id: 'e-manual' }, familyId: FAM, user: db.users[1] });
  assert.equal(res.code, 403);
  assert.equal(db.elders.find(e => e.id === 'e-manual').family_id, FAM, '拒绝时不能动数据');
});

test('M1.2-09 绑定了登录账号的成员不能走删除，应提示移出家庭组', async () => {
  setup();
  const res = await call({ params: { id: 'e-bound' }, familyId: FAM, user: db.users[0] });
  assert.equal(res.code, 400);
  assert.match(res.body.error, /移出家庭组/);
  assert.equal(db.elders.find(e => e.id === 'e-bound').family_id, FAM);
});

test('M1.2-10 跨家庭不能删别人家的成员', async () => {
  setup();
  const res = await call({ params: { id: 'e-manual' }, familyId: OTHER_FAM, user: db.users[0] });
  assert.equal(res.code, 404);
  assert.equal(db.elders.find(e => e.id === 'e-manual').family_id, FAM);
});
