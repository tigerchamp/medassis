// 记住密码「凭据存取」回归：RememberCreds 是纯对象（只有方法体里才碰 document/localStorage），
// 直接从源码 eval 出来测，避免为前端逻辑引入 jsdom。
//
// 重点是 M1.1-02：手机上是安卓 WebView，若没开 DomStorage，localStorage 重启即丢，
// 必须靠 cookie 兜底才能真正「记住」。这条挂了就等于手机上记不住密码。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');
const start = src.indexOf('const REMEMBER_KEY');
assert.notEqual(start, -1, 'js/app.js 里找不到 RememberCreds');
const end = src.indexOf('const App = {', start);
assert.ok(end > start, '找不到 RememberCreds 的结尾');
eval(src.slice(start, end) + '; global.__RC = RememberCreds;');
const RC = global.__RC;

// 最小浏览器环境替身：只提供 RememberCreds 用到的那点 API
let cookieJar = '';
global.document = {
  get cookie() { return cookieJar; },
  set cookie(v) { cookieJar = v.split(';')[0].trim(); },
};
let store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; },
};

function reset() { cookieJar = ''; store = {}; }

test('M1.1-01 存了就能取回账号密码', () => {
  reset();
  RC.save('13800138000', 'abc123');
  assert.deepEqual(RC.get(), { phone: '13800138000', password: 'abc123' });
});

test('M1.1-02 ★ localStorage 丢失时靠 cookie 兜底（WebView 未开 DomStorage）', () => {
  reset();
  RC.save('13800138000', 'abc123');
  store = {}; // 模拟 APP 重启后 localStorage 被清空
  assert.deepEqual(RC.get(), { phone: '13800138000', password: 'abc123' });
});

test('M1.1-03 cookie 里夹杂其他 cookie / 密码含特殊字符', () => {
  reset();
  const pwd = 'p@ss' + String.fromCharCode(34) + 'w&rd';
  RC.save('13800138000', pwd);
  store = {};
  cookieJar = 'other=1; ' + cookieJar + '; last=2';
  assert.deepEqual(RC.get(), { phone: '13800138000', password: pwd });
});

test('M1.1-04 脏数据（非 JSON）返回 null，不抛异常', () => {
  reset();
  cookieJar = 'fh_remember=notjson';
  assert.equal(RC.get(), null);
});

test('M1.1-05 没存过返回 null', () => {
  reset();
  assert.equal(RC.get(), null);
});

test('M1.1-06 取消记住 → localStorage 与 cookie 都清掉', () => {
  reset();
  RC.save('13800138000', 'abc123');
  RC.clear();
  assert.equal(RC.get(), null);
  assert.equal(store['fh_remember'], undefined);
});
