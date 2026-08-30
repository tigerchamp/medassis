/**
 * 轻量级请求/业务日志模块（零依赖）
 *
 * 特性：
 *  - 按天分文件：logs/app-YYYY-MM-DD.log
 *  - 按大小切片：单文件超过 MAX_SIZE 时滚动为 app-YYYY-MM-DD.log.1 / .2 ...
 *    （避免单个日志文件过大）
 *  - 多级：debug / info / warn / error（文件级别由 LOG_LEVEL 控制，默认 info）
 *  - 请求参数记录 + 敏感字段脱敏（password / token / secret 等）
 *  - 大 body 自动截断，避免日志被 base64 图片等撑爆
 *
 * 用法：
 *   const logger = require('./utils/logger');
 *   logger.info('用户登录成功', { userId });
 *   app.use('/api', logger.requestLogger);          // 记录每个 API 入参与耗时
 *   app.use(logger.errorLogger);                    // 全局错误兜底，记录堆栈
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const MAX_SIZE = parseInt(process.env.LOG_MAX_SIZE || '', 10) || 10 * 1024 * 1024; // 默认 10MB
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;
const BODY_MAX_LEN = parseInt(process.env.LOG_BODY_MAX || '', 10) || 2000; // body 序列化后最大字符数

// 需要脱敏的字段（不区分大小写，支持点路径浅层匹配）
const SENSITIVE_KEYS = new Set([
  'password', 'pwd', 'passwd', 'token', 'authorization', 'auth',
  'secret', 'secretkey', 'secret_key', 'refreshtoken', 'refresh_token',
  'accesstoken', 'access_token', 'cookie', 'credential', 'apikey', 'api_key'
]);

let dirReady = false;
function ensureDir() {
  if (dirReady) return;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    dirReady = true;
  } catch (e) {
    // 目录创建失败时退回控制台，避免影响主流程
    console.error('[logger] 无法创建日志目录:', e.message);
  }
}

function dayFile(base) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `app-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`;
  return path.join(LOG_DIR, name);
}

function ts() {
  // 本地时间（已强制 Asia/Shanghai），毫秒精度
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function isSensitive(key) {
  if (!key) return false;
  const k = String(key).toLowerCase();
  return SENSITIVE_KEYS.has(k) || k.endsWith('password') || k.endsWith('token') || k.endsWith('secret');
}

/**
 * 递归脱敏 + 截断，保证日志不包含明文凭证，也不至于过大
 */
function sanitize(obj, depth = 0) {
  if (obj === null || obj === undefined) return obj;
  if (depth > 5) return '[object]';
  if (typeof obj === 'string') {
    return obj.length > BODY_MAX_LEN ? `[string ${obj.length} chars]` : obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((v) => sanitize(v, depth + 1));
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitive(k)) {
      out[k] = '***';
    } else if (typeof v === 'string' && v.length > BODY_MAX_LEN) {
      out[k] = `[string ${v.length} chars]`;
    } else if (typeof v === 'object' && v !== null) {
      out[k] = sanitize(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---- 串行写入队列：保证日志顺序，且 rotate 与 append 不会交错 ----
let chain = Promise.resolve();

function rotateIfNeeded(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const { size } = fs.statSync(filePath);
    if (size < MAX_SIZE) return;
    let n = 1;
    while (fs.existsSync(`${filePath}.${n}`)) n++;
    fs.renameSync(filePath, `${filePath}.${n}`);
  } catch (e) {
    console.error('[logger] 切片失败:', e.message);
  }
}

function doWrite(line) {
  ensureDir();
  const filePath = dayFile();
  rotateIfNeeded(filePath);
  return new Promise((resolve) => {
    fs.appendFile(filePath, line + '\n', 'utf8', () => resolve());
  });
}

function log(level, msg, meta) {
  if (LEVELS[level] < LOG_LEVEL) return;
  const tag = (level || 'info').toUpperCase().padEnd(5);
  let line = `[${ts()}] [${tag}] ${msg}`;
  if (meta !== undefined && meta !== null) {
    try {
      const safe = (typeof meta === 'object') ? sanitize(meta) : meta;
      const m = (typeof safe === 'string') ? safe : JSON.stringify(safe);
      if (m) line += ' | ' + m;
    } catch (e) {
      line += ' | [meta 序列化失败]';
    }
  }
  // 文件落盘（串行）
  chain = chain.then(() => doWrite(line));
  // 控制台：error/warn 始终输出，便于开发/运维实时观察
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.LOG_CONSOLE === '1') console.log(line);
}

const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),

  /**
   * Express 中间件：记录每个 API 请求的方法 / URL / 状态码 / 耗时 / 入参。
   * 仅挂载在 /api 前缀下使用，避免记录静态资源请求。
   */
  requestLogger: (req, res, next) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '-';
    // 文件上传（multipart）：body 不含文件内容，只记录字段名与文件元信息
    let bodyMeta = undefined;
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart')) {
      const f = req.file || req.files;
      bodyMeta = { _multipart: true, fields: req.body ? Object.keys(req.body) : [], files: fileMeta(f) };
    } else if (req.body && Object.keys(req.body).length) {
      bodyMeta = req.body;
    }
    res.on('finish', () => {
      const dur = Date.now() - start;
      logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${dur}ms)`, {
        ip,
        query: Object.keys(req.query || {}).length ? req.query : undefined,
        body: bodyMeta,
      });
    });
    next();
  },

  /**
   * Express 全局错误中间件：兜底未捕获异常，记录堆栈 + 请求信息。
   */
  errorLogger: (err, req, res, next) => {
    logger.error('未处理异常', {
      message: err && err.message,
      stack: err && err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.headers['x-forwarded-for'] || req.ip || '-',
      body: req.body,
    });
    if (res.headersSent) return next(err);
    res.status(500).json({ error: '服务器内部错误' });
  },
};

function fileMeta(f) {
  if (!f) return undefined;
  if (Array.isArray(f)) return f.map((x) => ({ field: x.fieldname, name: x.originalname, size: x.size }));
  if (f.buffer !== undefined || f.originalname) {
    return { field: f.fieldname, name: f.originalname, size: f.size };
  }
  return Object.keys(f).map((k) => ({
    field: k,
    name: Array.isArray(f[k]) ? f[k].map((x) => x.originalname) : f[k].originalname,
  }));
}

module.exports = logger;
