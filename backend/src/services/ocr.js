/**
 * 百度智能云 OCR 服务
 * 文档：https://cloud.baidu.com/doc/OCR/s/Ck3h7y2ia
 * 接入流程：在百度智能云控制台创建"文字识别"应用，获取 API_KEY / SECRET_KEY，
 * 填入 .env 的 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY。
 */
'use strict';

const sharp = require('sharp');

const API_KEY = process.env.BAIDU_OCR_API_KEY;
const SECRET_KEY = process.env.BAIDU_OCR_SECRET_KEY;
// accurate_basic: 通用文字识别高精度版（默认）；general_basic: 通用文字识别标准版（免费额度更大）
const OCR_API = process.env.BAIDU_OCR_API || 'accurate_basic';

const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const OCR_URL = `https://aip.baidubce.com/rest/2.0/ocr/v1/${OCR_API}`;

// 内存缓存 access_token（有效期 30 天）
let _token = null;
let _tokenExpireAt = 0;

function isConfigured() {
  return !!(API_KEY && SECRET_KEY);
}

async function getAccessToken() {
  if (!isConfigured()) {
    const err = new Error('未配置百度OCR密钥');
    err.code = 'OCR_NOT_CONFIGURED';
    throw err;
  }
  // 提前 5 分钟刷新
  if (_token && Date.now() < _tokenExpireAt - 5 * 60 * 1000) {
    return _token;
  }
  const url = `${TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(API_KEY)}&client_secret=${encodeURIComponent(SECRET_KEY)}`;
  const resp = await fetch(url, { method: 'POST' });
  const data = await resp.json();
  if (!data.access_token) {
    const err = new Error('获取百度 access_token 失败: ' + (data.error_description || JSON.stringify(data)));
    err.code = 'OCR_TOKEN_ERROR';
    throw err;
  }
  _token = data.access_token;
  _tokenExpireAt = Date.now() + (data.expires_in || 2592000) * 1000;
  return _token;
}

/**
 * 预处理图片：缩放到最长边 ≤1024px 并转为 JPEG。
 * 解决两个问题：1) 手机原图过大(3-8MB)导致上传连接被重置(fetch failed)；
 *              2) HEIC/不支持的格式导致百度返回 image format error(216201)。
 * 百度建议：base64 后 <1MB，最长边 ≤1024px。
 */
async function preprocessImage(imageBuffer) {
  try {
    const meta = await sharp(imageBuffer).metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);
    let pipeline = sharp(imageBuffer).rotate(); // 自动按 EXIF 方向校正
    if (longest > 1024) {
      pipeline = pipeline.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true });
    }
    return await pipeline.jpeg({ quality: 85 }).toBuffer();
  } catch (err) {
    // sharp 无法处理时退回原图（让百度自行报错）
    console.error('OCR preprocessImage fallback:', err.message);
    return imageBuffer;
  }
}

/**
 * 识别单张图片，返回拼接后的文本
 * @param {Buffer} imageBuffer
 * @returns {Promise<{text: string, wordsCount: number}>}
 */
async function recognizeText(imageBuffer) {
  const token = await getAccessToken();
  // 预处理：缩放 + 转 JPEG，控制体积与格式
  const processed = await preprocessImage(imageBuffer);
  // 百度要求：标准 base64 编码（保留 + / =，不做 URL-safe 转换），再 urlencode 上传
  const b64 = processed.toString('base64');
  const body = `image=${encodeURIComponent(b64)}`;

  // fetch 偶发失败(大图/网络抖动)时重试一次
  let data, lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${OCR_URL}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      data = await resp.json();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      // 记录 fetch 失败的具体原因（undici 把细节放在 err.cause）
      console.error(`OCR fetch failed (attempt ${attempt + 1}):`, err.message, err.cause ? `cause: ${err.cause.message || err.cause.code}` : '');
      if (attempt === 0) await new Promise(r => setTimeout(r, 500));
    }
  }
  if (lastErr) {
    const err = new Error(`OCR请求失败: ${lastErr.cause ? (lastErr.cause.message || lastErr.cause.code) : lastErr.message}`);
    err.code = 'OCR_RECOGNIZE_ERROR';
    throw err;
  }
  if (data.error_code) {
    const err = new Error(`百度OCR识别失败(${data.error_code}): ${data.error_msg}`);
    err.code = 'OCR_RECOGNIZE_ERROR';
    throw err;
  }
  const words = (data.words_result || []).map(w => w.words || '');
  return { text: words.join('\n'), wordsCount: data.words_result_num || words.length };
}

// ============ 结构化解析（启发式，best-effort） ============

function findLine(text, keywords) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const kw of keywords) {
    const hit = lines.find(l => l.includes(kw));
    if (hit) return hit;
  }
  return '';
}

function extractAfter(line) {
  // 取关键词后的内容
  const m = line.match(/[:：]\s*(.+)$/);
  return m ? m[1].trim() : '';
}

function findHospital(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (/(医院|门诊|诊所|中心卫生院|卫生院|卫生服务中心|保健院|人民医院|中心)/.test(l) && l.length < 40) {
      return l.replace(/^.*?院|校|所/, '').trim() || l;
    }
  }
  return '';
}

function findDepartment(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    const m = l.match(/(科室|科别)[:：]\s*(.+)/);
    if (m) return m[2].trim();
  }
  for (const l of lines) {
    if (/科$/.test(l) && l.length <= 12 && !/(科室|科别)/.test(l)) return l;
  }
  return '';
}

function findDate(text) {
  const m = text.match(/(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return '';
}

// 数值型指标：行中含 数字+单位（mmol/L、mmHg、g/L、% 等），尽量带参考范围
function findMetrics(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const metrics = [];
  const unitRe = /(mmol\/L|mmHg|g\/L|mg\/dL|μmol\/L|umol\/L|U\/L|×10[⁹9]\/L|×10[¹1]2?\/L|次\/分|bpm|%|kPa|ng\/ml|μg\/L)/;
  for (const l of lines) {
    if (!/\d/.test(l) || !unitRe.test(l)) continue;
    // 名称：行首到第一个数字之前
    const nameMatch = l.match(/^(.*?)[\s::]?\s*\d/);
    let name = nameMatch ? nameMatch[1].replace(/[:：]/g, '').trim() : '';
    if (!name || name.length > 16) continue;
    const valueMatch = l.match(/(\d+\.?\d*)\s*(mmol\/L|mmHg|g\/L|mg\/dL|μmol\/L|umol\/L|U\/L|%|kPa|ng\/ml|μg\/L|bpm|次\/分)/);
    if (!valueMatch) continue;
    // 参考范围
    const refMatch = l.match(/(\d+\.?\d*)\s*[-~]\s*(\d+\.?\d*)/);
    const ref = refMatch ? `${refMatch[1]}-${refMatch[2]}` : '';
    const abnormal = refMatch ? (parseFloat(valueMatch[1]) < parseFloat(refMatch[1]) || parseFloat(valueMatch[1]) > parseFloat(refMatch[2])) : false;
    metrics.push({ name, value: valueMatch[1], unit: valueMatch[2], ref, abnormal });
  }
  return metrics;
}

function parseRecord(text) {
  return {
    hospital: findHospital(text),
    department: findDepartment(text),
    visitDate: findDate(text),
    diagnosis: extractAfter(findLine(text, ['诊断', '初步诊断', '临床诊断'])) || '',
    chiefComplaint: extractAfter(findLine(text, ['主诉'])) || '',
    orders: extractAfter(findLine(text, ['处理', '医嘱', '建议', '处理意见', '治疗方案', 'Rp'])) || '',
    doctor: extractAfter(findLine(text, ['医师', '医生', '接诊医生', '主治医师', '签名'])) || '',
    metrics: findMetrics(text)
  };
}

function parseReport(text) {
  return {
    hospital: findHospital(text),
    department: findDepartment(text),
    visitDate: findDate(text),
    examName: extractAfter(findLine(text, ['检查项目', '检查名称', '检查部位'])) || '',
    findings: extractAfter(findLine(text, ['检查所见', '影像所见', '检查描述', '描述'])) || '',
    conclusion: extractAfter(findLine(text, ['检查结论', '结论', '印象', '诊断意见'])) || ''
  };
}

function parsePrescription(text) {
  // 按行扫描含剂量线索的药品行
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const meds = [];
  const seen = new Set();
  const doseRe = /(\d+\.?\d*\s*(?:mg|g|ml|片|粒|袋|支|丸|ug|μg))/i;
  const freqRe = /(每日\d次|每天\d次|qd|bid|tid|qid|qn|prn|必要时|每日一次|每日两次|每日三次|每晚一次|每周一次)/i;
  for (const l of lines) {
    if (l.length < 2 || l.length > 60) continue;
    if (/^(Rp|处方|日期|医院|科室|姓名|性别|年龄|主诉|诊断|用法|用量|服法|签名|审核|调配|发药|药费|金额|费用|电话|地址)/.test(l)) continue;
    if (!doseRe.test(l) && !/(片|粒|袋|胶囊|丸|注射液|口服液|喷|滴)/.test(l)) continue;
    // 药名：行首到剂量/数字前
    const nameMatch = l.match(/^(.*?)[\s\d]/);
    let name = nameMatch ? nameMatch[1].replace(/[:：]/g, '').trim() : '';
    name = name.replace(/[（(].*$/, '').trim();
    if (!name || name.length > 24 || seen.has(name)) continue;
    seen.add(name);
    const doseM = l.match(doseRe);
    const freqM = l.match(freqRe);
    meds.push({ name, dose: doseM ? doseM[1] : '', frequency: freqM ? freqM[1] : '每日1次', note: '' });
  }
  return { medications: meds };
}

function parseDrug(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // 药名：第一个不含标点且较短的行
  let name = '';
  for (const l of lines) {
    if (l.length >= 2 && l.length <= 24 && !/^[（(【\[]/.test(l) && !/(公司|厂|企业|生产)/.test(l)) {
      name = l.replace(/【.*?】/g, '').trim();
      break;
    }
  }
  // 规格：含 数字+单位 + /盒 或 × 片
  let specification = '';
  for (const l of lines) {
    const m = l.match(/(\d+\.?\d*\s*(?:mg|g|ml|ug|μg)[*×x]?\d*\s*(?:片|粒|袋|丸|支|盒)?\/?(?:盒|瓶|板)?)/i);
    if (m) { specification = m[1]; break; }
    const m2 = l.match(/(\d+\s*(?:片|粒|袋|丸|支)\/(?:盒|瓶|板))/);
    if (m2) { specification = m2[1]; break; }
  }
  // 厂商
  let manufacturer = '';
  for (const l of lines) {
    const m = l.match(/(?:生产企业|生产厂家|生产厂商|公司)[:：]?\s*(.+)/) || l.match(/(.+?(?:公司|制药厂|药业|集团))$/);
    if (m && m[1] && m[1].length < 40) { manufacturer = m[1].trim(); break; }
  }
  return { name, specification, manufacturer };
}

function parse(type, text) {
  switch (type) {
    case 'record': return parseRecord(text);
    case 'report': return parseReport(text);
    case 'prescription': return parsePrescription(text);
    case 'drug': return parseDrug(text);
    default: return parseRecord(text);
  }
}

module.exports = { isConfigured, recognizeText, parse, parseRecord, parseReport, parsePrescription, parseDrug };
