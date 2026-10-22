// 环境变量自检回归（checkEnv 是纯函数，env 由参数传入，无需 DB / 网络）
// 背景：服务器 .env 曾丢失 SHOWAPI_KEY，药品说明书长期取不到却没有任何日志线索。
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEnv, formatEnvProblems, GROUPS } = require('../src/config/env.js');

// 一份「全配置」的样本：从 GROUPS 里自动生成，避免以后新增配置项时漏改用例
function fullEnv(overrides = {}) {
  const env = {};
  for (const g of GROUPS) {
    for (const k of g.keys) env[k] = 'real-value';
  }
  return { ...env, ...overrides };
}

test('配置齐全 → ok，无告警', () => {
  const r = checkEnv(fullEnv());
  assert.equal(r.ok, true);
  assert.equal(r.problems.length, 0);
});

test('★ 缺 SHOWAPI_KEY → 报「药品说明书」不可用', () => {
  const env = fullEnv();
  delete env.SHOWAPI_KEY;
  const r = checkEnv(env);
  assert.equal(r.ok, false);
  const p = r.problems.find((x) => x.feature.includes('说明书'));
  assert.ok(p, 'SHOWAPI_KEY 缺失未被检出');
  assert.deepEqual(p.missing, ['SHOWAPI_KEY']);
});

test('★ 占位符（your_xxx）等同于没配', () => {
  const r = checkEnv(fullEnv({ SHOWAPI_KEY: 'your_showapi_key_here' }));
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((x) => x.feature.includes('说明书')));
});

test('空串 / 空白串也算缺失', () => {
  assert.equal(checkEnv(fullEnv({ JWT_SECRET: '' })).ok, false);
  assert.equal(checkEnv(fullEnv({ JWT_SECRET: '   ' })).ok, false);
});

test('缺 OCR 双密钥 → 报「拍照识别」不可用', () => {
  const env = fullEnv();
  delete env.BAIDU_OCR_API_KEY;
  delete env.BAIDU_OCR_SECRET_KEY;
  const r = checkEnv(env);
  const p = r.problems.find((x) => x.feature.includes('OCR'));
  assert.deepEqual(p.missing, ['BAIDU_OCR_API_KEY', 'BAIDU_OCR_SECRET_KEY']);
});

test('缺数据库配置 → 报「数据库」不可用', () => {
  const env = fullEnv();
  delete env.DB_HOST;
  const r = checkEnv(env);
  assert.ok(r.problems.some((x) => x.feature === '数据库'));
});

test('多项同时缺失 → 全部列出（不是只报第一项）', () => {
  const env = fullEnv();
  delete env.SHOWAPI_KEY;
  delete env.MINIO_BUCKET;
  delete env.JWT_SECRET;
  const r = checkEnv(env);
  assert.equal(r.problems.length, 3);
});

test('告警文案含缺失项与影响', () => {
  const env = fullEnv();
  delete env.SHOWAPI_KEY;
  const lines = formatEnvProblems(checkEnv(env));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /SHOWAPI_KEY/);
  assert.match(lines[0], /说明书/);
});
