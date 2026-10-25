// 记住密码「凭据存取」回归：RememberCreds 是纯对象（只有方法体里才碰 document/localStorage），
// 直接从源码 eval 出来测，避免为前端逻辑引入 jsdom。
//
// 两条最要紧的：
// - M1.1-02：手机上是安卓 WebView，若没开 DomStorage，localStorage 重启即丢，必须靠 cookie 兜底。
// - M1.1-03/04：一台手机可能记住家里几个人的账号，后者不能把前者顶掉。
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
function phones(list) { return list.map(a => a.phone); }

test('M1.1-01 存了就能取回账号密码', () => {
  reset();
  RC.save('13800138000', 'abc123', '张三');
  const a = RC.get('13800138000');
  assert.deepEqual({ phone: a.phone, password: a.password, name: a.name },
    { phone: '13800138000', password: 'abc123', name: '张三' });
});

test('M1.1-02 ★ localStorage 丢失时靠 cookie 兜底（WebView 未开 DomStorage）', () => {
  reset();
  RC.save('13800138000', 'abc123');
  store = {}; // 模拟 APP 重启后 localStorage 被清空
  assert.equal(RC.getLast().phone, '13800138000');
  assert.equal(RC.get('13800138000').password, 'abc123');
});

test('M1.1-03 ★ 多账号并存：后登录的不顶掉先记住的，且排在前面', () => {
  reset();
  RC.save('13800138000', 'pwA', '张三');
  RC.save('13900139000', 'pwB', '李四');
  assert.equal(RC.list().length, 2);
  assert.deepEqual(phones(RC.list()), ['13900139000', '13800138000']);
  assert.equal(RC.getLast().phone, '13900139000');
  // 换回张三登录后，张三变成最近登录的
  RC.save('13800138000', 'pwA2', '张三');
  assert.deepEqual(phones(RC.list()), ['13800138000', '13900139000']);
  assert.equal(RC.get('13900139000').password, 'pwB');
});

test('M1.1-04 同一手机号重复登录 → 不产生重复条目，只更新密码', () => {
  reset();
  RC.save('13800138000', 'old');
  RC.save('13800138000', 'new');
  assert.equal(RC.list().length, 1);
  assert.equal(RC.get('13800138000').password, 'new');
});

test('M1.1-05 忘记某一个账号 → 只删这一个，其他还在', () => {
  reset();
  RC.save('13800138000', 'pwA');
  RC.save('13900139000', 'pwB');
  RC.remove('13800138000');
  assert.deepEqual(phones(RC.list()), ['13900139000']);
  RC.remove('13900139000');
  assert.deepEqual(RC.list(), []);
  assert.equal(RC.getLast(), null);
});

test('M1.1-06 ★ 主动退出 → 不再自动登录，但账号都还留着', () => {
  reset();
  RC.save('13800138000', 'pwA');
  RC.save('13900139000', 'pwB');
  RC.pauseAutoLogin();
  assert.equal(RC.autoLoginAllowed(), false);
  assert.deepEqual(phones(RC.list()), ['13900139000', '13800138000']); // 选择列表还在
});

test('M1.1-07 手动登录成功 → 恢复自动登录', () => {
  reset();
  RC.save('13800138000', 'pwA');
  RC.pauseAutoLogin();
  RC.save('13900139000', 'pwB');
  assert.equal(RC.autoLoginAllowed(), true);
});

test('M1.1-08 没记住任何账号 → 不允许自动登录', () => {
  reset();
  assert.equal(RC.autoLoginAllowed(), false);
  RC.pauseAutoLogin(); // 没账号时是空操作，不该写出垃圾数据
  assert.equal(RC.autoLoginAllowed(), false);
});

test('M1.1-09 兼容旧格式（只存了一个账号的 {phone,password}）', () => {
  reset();
  store['fh_remember'] = JSON.stringify({ phone: '13800138000', password: 'abc123' });
  assert.equal(RC.get('13800138000').password, 'abc123');
  assert.equal(RC.autoLoginAllowed(), true);
});

test('M1.1-10 脏数据（非 JSON / 结构不对）返回空，不抛异常', () => {
  reset();
  cookieJar = 'fh_remember=notjson';
  assert.deepEqual(RC.list(), []);
  store['fh_remember'] = JSON.stringify({ accounts: 'oops' });
  assert.deepEqual(RC.list(), []);
});

test('M1.1-11 cookie 里夹杂其他 cookie / 密码含特殊字符', () => {
  reset();
  const pwd = 'p@ss' + String.fromCharCode(34) + 'w' + String.fromCharCode(38) + 'rd';
  RC.save('13800138000', pwd);
  store = {};
  cookieJar = 'other=1; ' + cookieJar + '; last=2';
  assert.equal(RC.get('13800138000').password, pwd);
});

test('M1.1-12 clear() 全清', () => {
  reset();
  RC.save('13800138000', 'pwA');
  RC.save('13900139000', 'pwB');
  RC.clear();
  assert.deepEqual(RC.list(), []);
  assert.equal(store['fh_remember'], undefined);
});
