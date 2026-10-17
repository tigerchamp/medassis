/**
 * 测试用数据库连接助手
 *
 * 只读连接，供集成测试使用。MySQL 不可用时 connect() 返回 null，
 * 调用方据此跳过集成用例（t.skip），不让整个套件失败——
 * 这样在没起 MySQL 的机器上跑 `npm test` 也有意义。
 *
 * 重要：必须在 require 任何 controller 之前 require 本文件。
 * src/config/database.js 在模块加载时就读取 process.env 建连接池，
 * 若 .env 还没加载，会以空密码连库 → ER_ACCESS_DENIED_ERROR。
 */
'use strict';
const path = require('path');
const mysql = require('mysql2/promise');

let _conn = null;
let _checked = false;

function loadEnv() {
  // 无论从哪里执行，都固定加载 backend/.env
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
}

// 立即加载，保证后续 require 的 controller 能拿到正确的 DB_* 配置
loadEnv();

async function connect() {
  if (_checked) return _conn;
  _checked = true;
  try {
    _conn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'family_health',
      connectTimeout: 5000,
      timezone: '+08:00'
    });
  } catch (err) {
    _conn = null;
  }
  return _conn;
}

async function end() {
  if (_conn) { try { await _conn.end(); } catch (e) { /* 忽略 */ } }
  _conn = null;
  _checked = false;
}

// 初始化连接池（部分 controller 内部直接调 getPool()，必须先跑 checkDatabase()）
// 幂等，可重复调用；返回 true 表示可用。
async function initPool() {
  loadEnv();
  const db = require('../../src/config/database.js');
  await db.checkDatabase();
  try {
    await db.getPool().query('SELECT 1');
    return true;
  } catch (e) {
    return false;
  }
}

// 关闭全部连接池（含 database.js 内部的 basePool），
// 否则 test runner 子进程不退出，会挂到超时判失败
async function closePool() {
  loadEnv();
  const db = require('../../src/config/database.js');
  await db.closeAll();
}

// 把单个连接包装成 pool 形状，供接受 pool 参数的内部函数使用
const asPool = (conn) => ({ query: (sql, params) => conn.query(sql, params) });

module.exports = { connect, end, loadEnv, initPool, closePool, asPool };
