/**
 * 用药计划集成测试（需要 MySQL）
 *
 * 核心回归点：**status=ended 的用药记录（历史快照）绝不能增加药箱库存**。
 * 编辑用药计划保存时会写一条 ended 快照做归档，而 addMedication 内部会调
 * _syncToDrugInventory() 按 drug_code 命中已有库存并数量 +1。
 * 若这条快照参与同步，每编辑一次药箱就多一盒（线上出过：某药被反复编辑后加到 6 盒）。
 *
 * 跑：cd backend && npm test
 */
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// 必须先加载 env：src/config/database.js 在模块加载时就用 process.env 建连接池
const db = require('./helpers/db.js');
const { addMedication } = require('../src/controllers/medicationController.js');

after(async () => {
  await db.end();
  await db.closePool();
});

async function setup() {
  const conn = await db.connect();
  if (!conn) return null;
  try {
    await db.withTimeout(db.initPool(), 30000);
  } catch (e) {
    return null;
  }
  // 找一个有库存行、有服药人的真实药品作为操作对象
  const [rows] = await db.withTimeout(conn.query(
    `SELECT di.family_id, di.elder_id, di.drug_code, di.name
     FROM drug_inventory di
     WHERE di.elder_id IS NOT NULL AND di.drug_code IS NOT NULL
     ORDER BY di.created_at DESC LIMIT 1`
  ), 15000);
  if (!rows.length) return null;
  const r = rows[0];
  const [u] = await conn.query('SELECT id FROM users LIMIT 1');
  return {
    conn,
    familyId: r.family_id,
    elderId: r.elder_id,        // 注意：SQL 返回的是 snake_case
    drugCode: r.drug_code,
    drugName: r.name,
    userId: u[0] ? u[0].id : null
  };
}

const sumRemain = (conn, familyId, elderId, drugCode) => conn.query(
  `SELECT SUM(CASE WHEN remaining_quantity IS NULL THEN quantity ELSE remaining_quantity END) AS total
   FROM drug_inventory WHERE family_id = ? AND elder_id = ? AND drug_code = ?`,
  [familyId, elderId, drugCode]
).then(r => Number(r[0][0].total || 0));

// 直接调 controller；新建的记录由测试自己删除，保证不留脏数据
function callAddMedication(req, body) {
  return new Promise((resolve, reject) => {
    req.body = body;
    addMedication(req, {
      json: (b) => resolve(b),
      status: () => ({ json: (b) => reject(new Error(JSON.stringify(b))) })
    });
  });
}

test('集成 / 新增 status=ended 的用药记录不增加药箱库存', async (t) => {
  const s = await setup();
  if (!s) return t.skip('MySQL 不可用，跳过集成用例');
  const { conn, familyId, elderId, drugCode, drugName, userId } = s;

  const before = await sumRemain(conn, familyId, elderId, drugCode);
  const req = { familyId, user: { id: userId }, body: {} };
  let created = null;
  try {
    const res = await db.withTimeout(callAddMedication(req, {
      elderId, name: drugName, status: 'ended',
      quantity: 1, quantityUnit: '盒',
      frequency: 1, times: ['08:00'],
      note: '[测试] ended 快照不应增加库存'
    }), 30000);
    created = res.medication;
    const afterNum = await sumRemain(conn, familyId, elderId, drugCode);
    assert.equal(afterNum, before, `ended 记录不应加库存：改前 ${before} → 改后 ${afterNum}`);
    t.diagnostic(`库存保持 ${before}（未被 +1）`);
  } finally {
    if (created && created.id) {
      await conn.query('DELETE FROM medications WHERE id = ?', [created.id]);
      t.diagnostic('已清理测试记录 ' + created.id.slice(0, 8));
    }
  }
});
