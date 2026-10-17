/**
 * 长期用药 & 用药计划联动 集成测试（需要 MySQL）
 *
 * MySQL 不可用时整组跳过（t.skip），不会误报失败。
 * 所有写操作在事务里执行，最后 rollback，不落盘。
 *
 * 跑：cd backend && npm test
 */
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// 必须先加载 env：src/config/database.js 在模块加载时就用 process.env 建连接池
const db = require('./helpers/db.js');
const { familyAccessFilter } = require('../src/utils/familyAccess.js');
const {
  getChronicMeds, _aggregateInventory, _syncMedicationPlans
} = require('../src/controllers/drugController.js');

// 构造一个最小的 req/res，直接调用 controller（不启动 HTTP 服务）
const stubRes = (onJson, onError) => ({
  json: (body) => onJson(body),
  status: () => ({ json: (body) => onError && onError(body) })
});

/**
 * 先探测 MySQL 是否可用，不可用则调用方 skip
 * 返回 { conn, familyId, elderId } 或 null
 */
async function setup() {
  const conn = await db.connect();
  if (!conn) return null;
  await db.initPool();
  const [fams] = await conn.query(
    `SELECT cm.family_id, cm.elder_id FROM chronic_medications cm
     WHERE cm.elder_id IS NOT NULL ORDER BY cm.created_at DESC LIMIT 1`
  );
  if (!fams.length) return null;
  return { conn, familyId: fams[0].family_id, elderId: fams[0].elder_id };
}

// 关闭连接与连接池，保证 test runner 子进程能正常退出
after(async () => {
  await db.end();
  await db.closePool();
});

test('集成 / getChronicMeds 按「药 + 服药人」聚合余量', async (t) => {
  const s = await setup();
  if (!s) return t.skip('MySQL 不可用，跳过集成用例');
  const { conn, familyId } = s;

  const agg = await _aggregateInventory(db.asPool(conn), familyId);
  const items = await new Promise((resolve) => {
    getChronicMeds({ query: {}, familyId, user: { id: null } }, stubRes((b) => resolve(b.chronicMeds)));
  });

  assert.ok(items.length > 0, '应返回长期用药条目');
  for (const it of items) {
    const key = `${it.drugCode ? 'CODE__' + it.drugCode : 'NAME__' + it.drugName}||${it.elderId || '__none__'}`;
    const g = agg.get(key);
    if (!g) continue; // 该药在本家庭无库存行，走单行兜底
    assert.equal(it.drug.quantity, g.quantity, `${it.drugName} 聚合余量不符`);
  }
  t.diagnostic(`family=${familyId.slice(0, 8)} 校验 ${items.length} 条`);
});

test('集成 / getChronicMeds 同药多条入库时返回合计而非单条', async (t) => {
  const s = await setup();
  if (!s) return t.skip('MySQL 不可用，跳过集成用例');
  const { conn, familyId } = s;

  // 找出本家庭内同一 药+服药人 有 ≥2 条入库记录的组合
  const access = familyAccessFilter(familyId, 'di.');
  const [rows] = await conn.query(
    `SELECT di.drug_code, di.name, di.elder_id, COUNT(*) AS n,
            SUM(CASE WHEN di.remaining_quantity IS NULL THEN di.quantity ELSE di.remaining_quantity END) AS total
     FROM drug_inventory di
     WHERE (${access.sql})
     GROUP BY di.drug_code, di.name, di.elder_id
     HAVING n >= 2
     LIMIT 1`,
    access.params
  );
  if (!rows.length) return t.skip('库中没有同药多条入库的样本，跳过');
  const target = rows[0];

  const items = await new Promise((resolve) => {
    getChronicMeds({ query: {}, familyId, user: { id: null } }, stubRes((b) => resolve(b.chronicMeds)));
  });
  const hit = items.find(i => (i.drugCode === target.drug_code || i.drugName === target.name)
    && (i.elderId || null) === (target.elder_id || null));
  if (!hit) return t.skip('该组合未被勾选为长期用药，跳过');

  assert.equal(String(hit.drug.quantity), String(target.total),
    `应为余量合计 ${target.total}（共 ${target.n} 条入库），实际 ${hit.drug.quantity}`);
  t.diagnostic(`「${target.name}」 ${target.n} 条入库 -> 聚合余量 ${target.total}`);
});

test('集成 / 用药计划联动：新建 → 幂等 → 停止 → 恢复', async (t) => {
  const s = await setup();
  if (!s) return t.skip('MySQL 不可用，跳过集成用例');
  const { conn, familyId, elderId } = s;

  // 取一条真实库存行（同家庭、有 elder_id、有 drug_code）作为"新勾选"的对象
  const [inv] = await conn.query(
    `SELECT di.id, di.drug_code, di.name, di.specification, di.quantity, di.remaining_quantity
     FROM drug_inventory di
     WHERE di.family_id = ? AND di.elder_id IS NOT NULL AND di.drug_code IS NOT NULL
     LIMIT 1`, [familyId]
  );
  if (!inv.length) return t.skip('没有可用于集成测试的库存行，跳过');

  const row = inv[0];
  const currentRows = [{ id: row.id, drug_code: row.drug_code, name: row.name, specification: row.specification }];
  const prevRows = [{ drug_inventory_id: row.id, drug_code: row.drug_code, drug_name: row.name }];

  await conn.beginTransaction();
  try {
    const a = await _syncMedicationPlans(conn, { familyId, userId: null, elderId, prevRows: [], currentRows });
    t.diagnostic('① 新建: ' + JSON.stringify(a));
    assert.equal(a.created + a.restored, 1, '应新建 1 条计划');

    const b = await _syncMedicationPlans(conn, { familyId, userId: null, elderId, prevRows: [], currentRows });
    t.diagnostic('② 重复保存: ' + JSON.stringify(b));
    assert.deepEqual(b, { created: 0, restored: 0, ended: 0 }, '已有在用计划时不应重复建');

    const c = await _syncMedicationPlans(conn, { familyId, userId: null, elderId, prevRows, currentRows: [] });
    t.diagnostic('③ 取消勾选: ' + JSON.stringify(c));
    assert.equal(c.ended, 1, '应停止 1 条计划');

    const d = await _syncMedicationPlans(conn, { familyId, userId: null, elderId, prevRows: [], currentRows });
    t.diagnostic('④ 重新勾选: ' + JSON.stringify(d));
    assert.equal(d.restored, 1, '应恢复历史计划而不是新建');
  } finally {
    await conn.rollback();
    t.diagnostic('事务已 rollback，未写入任何数据');
  }
  await db.end();
});

test('集成 / 无 elderId 时跳过联动（不误伤其他成员）', async (t) => {
  const s = await setup();
  if (!s) return t.skip('MySQL 不可用，跳过集成用例');
  const r = await _syncMedicationPlans(s.conn, {
    familyId: 'x', userId: 'y', elderId: null, prevRows: [], currentRows: [{ id: '1' }]
  });
  assert.deepEqual(r, { created: 0, restored: 0, ended: 0 });
});
