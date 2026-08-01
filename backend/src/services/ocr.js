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
    console.log(`[OCR] 预处理: 原图 ${meta.width}x${meta.height} 格式=${meta.format} 大小=${imageBuffer.length} bytes`);
    let pipeline = sharp(imageBuffer).rotate(); // 自动按 EXIF 方向校正
    if (longest > 1024) {
      pipeline = pipeline.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true });
    }
    const out = await pipeline.jpeg({ quality: 85 }).toBuffer();
    console.log(`[OCR] 预处理后: ${out.length} bytes (JPEG)`);
    return out;
  } catch (err) {
    // sharp 无法处理时退回原图（让百度自行报错）
    console.error('[OCR] 预处理失败，退回原图:', err.message);
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
  console.log(`[OCR] 调用百度API: ${OCR_API}, base64长度=${b64.length}`);

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
      console.log(`[OCR] 百度响应: error_code=${data.error_code || '无'}, words_result_num=${data.words_result_num || 0}, log_id=${data.log_id || ''}`);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      // 记录 fetch 失败的具体原因（undici 把细节放在 err.cause）
      console.error(`[OCR] fetch failed (attempt ${attempt + 1}):`, err.message, err.cause ? `cause: ${err.cause.message || err.cause.code}` : '');
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
  // 取关键词后的内容，支持 ：】 ] 等分隔符
  const m = line.match(/[:：】\]]\s*(.+)$/);
  return m ? m[1].trim() : '';
}

// 收集某关键词所在行及其后续行，直到遇到下一个【标签】或结束标志（用于多行内容如"处置"区块）
function extractBlock(text, keywords) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const stopRe = /^[【\[][^】\]]*[】\]]/;          // 下一个【标签】
  const endRe = /(医师签名|医师签字|签章|第\s*\d+\s*页|共\s*\d+\s*页|审核|调配|核对|发药)/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!keywords.some(kw => l.includes(kw))) continue;
    // 同行分隔符后的内容
    const after = l.replace(/^[^:：】\]]*[:：】\]]\s*/, '').trim();
    const parts = after ? [after] : [];
    for (let j = i + 1; j < lines.length; j++) {
      const nl = lines[j];
      if (stopRe.test(nl) || endRe.test(nl)) break;
      // 跳过 <西药> </西药> <中药> 等分类标签
      if (/^<\/?[^>]+>$/.test(nl)) continue;
      parts.push(nl);
    }
    return parts.filter(Boolean).join('\n').trim();
  }
  return '';
}

function findHospital(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (/(医院|门诊|诊所|中心卫生院|卫生院|卫生服务中心|保健院|人民医院|中心)/.test(l) && l.length < 40) {
      // 去掉后缀类词汇：门诊病历、病历、处方笺、处方等
      const cleaned = l.replace(/(门诊病历|门诊处方|病历|处方笺|处方|就诊记录|就诊)$/, '').trim();
      return cleaned || l;
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
    diagnosis: extractBlock(text, ['诊断', '初步诊断', '临床诊断']) || '',
    chiefComplaint: extractBlock(text, ['主诉']) || '',
    // 无"医嘱"时用"处置"等区块内容代替（多行药品/用法文本）
    orders: extractBlock(text, ['医嘱', '处置', '处理', '处理意见', '治疗方案', '建议', 'Rp']) || '',
    doctor: extractAfter(findLine(text, ['医师签名', '医师签字', '医师', '医生', '接诊医生', '主治医师', '签名'])) || '',
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
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const meds = [];
  const seen = new Set();

  // 规格行：6g*12, 0.6g*48, 30mg×14片
  const specLineRe = /(\d+\.?\d*)\s*(mg|g|ml|ug|μg)\s*[*×x]\s*(\d+)/i;
  // 单次剂量行（行首）：6g口服, 4.8g, 1片
  const doseLineRe = /^(\d+\.?\d*)\s*(mg|g|ml|片|粒|袋|丸|支|ug|μg)/i;
  // 频次：3/日, 2/日, 每日3次, bid, tid
  const freqRe = /(\d\s*\/\s*日|每日\d次|每天\d次|qd|bid|tid|qid|qn|prn|必要时|每日[一二三四]次|每晚[一二]?次|每周[一二]?次)/i;
  // 数量：2盒, 1瓶, 3袋
  const qtyRe = /(\d+\s*(?:盒|瓶|袋|支|板|包))/i;
  // 元数据行（不作为药名候选）
  const metaRe = /^(R[pxp]?[:：]?|诊断|用法|用量|服法|口服|外用|科室|姓名|性别|年龄|身份|体重|费别|药房|病人|医保|医疗|机构|编号|NO|参考|过敏|取药|新门诊|微信|点单|防止|请扫|主[:：]|医师|签章|调配|审核|核对|发药|日期|底方)/i;

  // 药名候选：含中文、无数字、长度2-20、非元数据、无分号逗号（诊断常含分号）
  function isNameCandidate(l) {
    return /[\u4e00-\u9fa5]/.test(l) && !/\d/.test(l) && l.length >= 2 && l.length <= 20
      && !metaRe.test(l) && !/[；;，,]/.test(l);
  }

  // 找到处方正文起点（R: / Rp:）
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^R[pxp]?[:：]?$/i.test(lines[i])) { startIdx = i + 1; break; }
  }

  let currentMed = null;
  const flush = () => {
    if (currentMed && currentMed.name && !seen.has(currentMed.name)) {
      seen.add(currentMed.name);
      meds.push(currentMed);
    }
    currentMed = null;
  };

  for (let i = startIdx; i < lines.length; i++) {
    const l = lines[i];

    // 1. 规格行 → 药名（同行或往前找）
    const specM = l.match(specLineRe);
    if (specM) {
      let name = '';
      const before = l.substring(0, specM.index).trim();
      if (before && /[\u4e00-\u9fa5]/.test(before)) {
        name = before.replace(/[（(【\[].*$/, '').trim();
      }
      if (!name) {
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          if (specLineRe.test(lines[j]) || doseLineRe.test(lines[j])) break;
          if (isNameCandidate(lines[j])) { name = lines[j].replace(/[（(【\[].*$/, '').trim(); break; }
        }
      }
      flush();
      currentMed = {
        name,
        specDosage: specM[1], specDosageUnit: specM[2], unitCap: specM[3],
        doseAmount: '', doseUnit: '',
        quantity: 1, quantityUnit: '',
        frequency: '每日1次', note: ''
      };
      continue;
    }

    // 2. 单次剂量行且无当前药品 → 往前找药名（无规格的处方）
    const doseM = l.match(doseLineRe);
    if (doseM && !currentMed) {
      let name = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (specLineRe.test(lines[j]) || doseLineRe.test(lines[j])) break;
        if (isNameCandidate(lines[j])) { name = lines[j].replace(/[（(【\[].*$/, '').trim(); break; }
      }
      if (name) {
        flush();
        currentMed = { name, specDosage: '', specDosageUnit: '', unitCap: '', doseAmount: doseM[1], doseUnit: doseM[2], quantity: 1, quantityUnit: '', frequency: '每日1次', note: '' };
        continue;
      }
    }

    if (!currentMed) continue;

    // 3. 频次
    const freqM = l.match(freqRe);
    if (freqM) { currentMed.frequency = freqM[1]; continue; }

    // 4. 数量（如 2盒、1瓶、3袋）→ 拆分为数值和单位
    const qtyM = l.match(qtyRe);
    if (qtyM) {
      const qm = qtyM[1].match(/^(\d+)\s*(盒|瓶|袋|支|板|包)$/);
      if (qm) { currentMed.quantity = parseInt(qm[1]); currentMed.quantityUnit = qm[2]; }
      continue;
    }

    // 5. 单次剂量（独立行，如 6g口服 / 4.8g）
    if (doseM && !currentMed.doseAmount) {
      currentMed.doseAmount = doseM[1];
      currentMed.doseUnit = doseM[2];
    }
  }
  flush();
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
