/**
 * 环境变量自检
 *
 * 为什么要有这个模块：.env 少配一项时，相关功能不会报错，只会「静默失效」。
 * 线上出过一次：服务器 .env 缺 SHOWAPI_KEY，药品说明书一直取不到，
 * 但 fetchInfo 在打日志之前就 return 了 —— 日志里一条线索都没有，
 * 只能靠对比数据最后更新时间才定位到（2026-08-15 之后再无成功）。
 * 所以启动时要主动把「缺什么 → 哪个功能不可用」打出来。
 *
 * checkEnv() 是纯函数（env 从参数传入），便于离线单测；
 * logEnvStatus() 负责启动期的告警输出。
 */
'use strict';

// 这些值等同于没配：空串，或 .env.example 里的占位符被原样留在了 .env 里
const PLACEHOLDERS = new Set(['changeme', 'xxx', 'null', 'undefined']);
const PLACEHOLDER_RE = /^(your|请填写|todo)/i;

function isMissing(env, key) {
  const v = env[key];
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return s === '' || PLACEHOLDER_RE.test(s) || PLACEHOLDERS.has(s.toLowerCase());
}

// 每组里缺任一项，该功能就不可用
const GROUPS = [
  {
    feature: '数据库',
    keys: ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'],
    impact: '所有数据接口不可用',
  },
  {
    feature: '登录鉴权',
    keys: ['JWT_SECRET'],
    impact: '回退到默认密钥，任何人都可伪造登录 token',
  },
  {
    feature: '图片存储(MinIO)',
    keys: ['MINIO_ENDPOINT', 'MINIO_PORT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET'],
    impact: '图片上传与查看不可用',
  },
  {
    feature: '拍照识别(百度OCR)',
    keys: ['BAIDU_OCR_API_KEY', 'BAIDU_OCR_SECRET_KEY'],
    impact: '拍照识别病历/处方/药盒不可用',
  },
  {
    feature: '药品说明书(ShowAPI)',
    keys: ['SHOWAPI_KEY'],
    impact: '说明书在线获取不可用，只能显示库内已有数据',
  },
];

/**
 * 检查环境变量
 * @param {object} env 默认 process.env（单测时传自定义对象）
 * @returns {{ok: boolean, problems: Array<{feature:string, missing:string[], impact:string}>}}
 */
function checkEnv(env = process.env) {
  const problems = [];
  for (const g of GROUPS) {
    const missing = g.keys.filter((k) => isMissing(env, k));
    if (missing.length > 0) {
      problems.push({ feature: g.feature, missing, impact: g.impact });
    }
  }
  return { ok: problems.length === 0, problems };
}

// 生成人可读的告警行（启动日志与日志共用）
function formatEnvProblems(result) {
  return result.problems.map(
    (p) => `缺少 ${p.missing.join('、')} → ${p.feature}不可用（${p.impact}）`
  );
}

/**
 * 启动期告警：把缺失项打到控制台与日志文件（日志文件便于事后回看）
 * @param {object} logger utils/logger 实例（可选，测试时可省略）
 * @param {object} env 默认 process.env
 */
function logEnvStatus(logger, env = process.env) {
  const result = checkEnv(env);
  if (result.ok) {
    console.log('✓ 环境变量检查通过');
    return result;
  }
  const lines = formatEnvProblems(result);
  console.warn(`⚠ 环境变量缺失 ${result.problems.length} 组：`);
  lines.forEach((l) => console.warn(`  · ${l}`));
  if (logger && typeof logger.warn === 'function') {
    logger.warn(`环境变量缺失 ${result.problems.length} 组`, { problems: result.problems });
  }
  return result;
}

module.exports = { checkEnv, logEnvStatus, formatEnvProblems, GROUPS };
