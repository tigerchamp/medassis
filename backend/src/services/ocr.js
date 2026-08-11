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

// 提取医师姓名：支持"医师：孙畅"（有分隔符）、"医师孙畅"（无分隔符）、"医师\n孙畅"（姓名在下一行）三种格式
function extractDoctor(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // 申请医生/申请医师 优先（化验单/检查报告的申请医生），再退回到签名类关键词
  const keywords = ['申请医生', '申请医师', '报告医师', '检查医师', '医师签名', '医师签字', '主治医师', '接诊医生', '医师', '医生', '签名'];
  // 姓名：2-4个连续中文，或2-20个英文字母
  const isName = (s) => /^[\u4e00-\u9fa5]{2,4}$/.test(s) || /^[a-zA-Z]{2,20}$/.test(s);
  for (const kw of keywords) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.includes(kw)) continue;
      // 1. 有分隔符：医师：孙畅
      const after = extractAfter(l);
      if (after && /^[\u4e00-\u9fa5a-zA-Z]/.test(after)) {
        return after.replace(/[(（]签章[)）]/g, '').trim();
      }
      // 2. 无分隔符：医师孙畅 → 去掉关键词取剩余
      const rest = l.replace(kw, '').replace(/^[:：】\]]\s*/, '').trim();
      // 过滤纯标点/数字/签章等非姓名内容，要求至少2个连续中文或英文字符
      if (rest && /^[\u4e00-\u9fa5a-zA-Z]{2,}/.test(rest)) {
        return rest.replace(/[(（]签章[)）]/g, '').trim();
      }
      // 3. 关键词单独成行（如 "医师" / "医师："），姓名在相邻行
      const aloneRe = new RegExp(`^${kw}[:：]?$`);
      if (aloneRe.test(l)) {
        // 向后查找：医师\n任乐乐（跳过纯数字工号）
        for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
          const nl = lines[j];
          if (/^\d+$/.test(nl)) continue;       // 跳过工号(如 80586)
          if (/[:：]/.test(nl)) break;          // 遇到标签行停止
          if (isName(nl)) return nl;
          break;
        }
        // 向前查找：任乐乐\n80586\n医师（签名在抬头之前）
        for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
          const nl = lines[j];
          if (/^\d+$/.test(nl)) continue;       // 跳过工号
          if (/[:：]/.test(nl)) break;          // 遇到标签行停止
          if (isName(nl)) return nl;
          break;
        }
      }
    }
  }
  return '';
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
      // 去掉后缀类词汇：门诊病历、病历、处方笺、处方、检验报告单等
      const cleaned = l.replace(/(门诊病历|门诊处方|检验结果报告单|检验报告单|化验报告单|化验单|检验单|检查报告单|检查报告|报告单|报告|病历|处方笺|处方|就诊记录|就诊)$/, '').trim();
      return cleaned || l;
    }
  }
  return '';
}

function findDepartment(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // 去掉"门诊"后缀：消化内科门诊 → 消化内科
  const cleanDept = (d) => d.replace(/门诊$/, '').trim();
  for (const l of lines) {
    const m = l.match(/(科室|科别)[:：]\s*(.+)/);
    if (m) return cleanDept(m[2]);
  }
  for (const l of lines) {
    if (/科$/.test(l) && l.length <= 12 && !/(科室|科别)/.test(l)) return cleanDept(l);
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

// 提取诊断：只保留疾病名称，过滤掉多栏排版噪声、药品信息、医师信息等
// 解决"诊断："后整段内容（含药品、用法、医师签名）被当作诊断的问题
function extractDiagnosis(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const startKws = ['初步诊断', '临床诊断', '诊断'];  // 长关键字优先

  // 找到诊断关键字所在行
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startKws.some(kw => lines[i].includes(kw))) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return '';

  // 同行分隔符后的内容（如"诊断：便秘"）
  const firstLine = lines[startIdx].replace(/^[^:：】\]]*[:：】\]]\s*/, '').trim();
  const parts = firstLine ? [firstLine] : [];

  // 结束标志：处方/药品区、医师区、其他区块标签
  // 比 extractBlock 的 endRe 多了 R:/Rp/处方/药品/用法/用量/体重/取药/注 等处方相关标志
  const stopRe = /^[【\[][^】\]]*[】\]]/;
  const endRe = /(医师签名|医师签字|主治医师|接诊医生|签章|第\s*\d+\s*页|共\s*\d+\s*页|审核|调配|核对|发药|签名|^R[pP]?(?:[:：]|$)|^处方|^药品|^用法[:：]|^用量|^体重[:：]|^取药|^注[:：]|^过敏试验)/;

  for (let j = startIdx + 1; j < lines.length; j++) {
    const nl = lines[j];
    if (stopRe.test(nl) || endRe.test(nl)) break;
    if (/^<\/?[^>]+>$/.test(nl)) continue;
    parts.push(nl);
  }

  // 过滤：只保留疾病名称候选
  // 常见非疾病短词（用法、体征、角色等）
  const noiseWords = new Set([
    '口服', '外用', '静注', '静滴', '肌注', '皮下', '含服', '吸入', '静脉', '肌内',
    '医师', '医生', '护士', '药师', '签名', '签章', '注', '处方', '医嘱', '主诉',
    '病史', '体温', '血压', '脉搏', '呼吸', '心率', '体重', '身高', '复诊', '随访',
    '建议', '嘱', 'Rp', 'R'
  ]);
  // 药品/剂型后缀
  const drugSuffix = /(片|丸|胶囊|口服液|注射液|颗粒|分散片|糖浆|滴丸|软膏|乳膏|气雾剂|喷剂|含片|栓|溶液|散|合剂|露|茶|贴|膏|滴剂|冲剂|瓶|盒|袋|支|次|日|周|月|年)$/i;
  // 位置/流程词
  const locationRe = /(楼|层|位置|门诊|病房|窗口|大厅|药房|取药|收费|挂号)/;

  const candidates = [];
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    // 跳过含分隔符的标签行（身份:xxx、体重：等）
    if (/[:：、，,。.（()()\[\]【】\/\\]/.test(s)) continue;
    // 跳过纯数字/编号
    if (/^\d+$/.test(s)) continue;
    // 跳过含拉丁字母的（R、Rp、100ml 等）
    if (/[a-zA-Z]/.test(s)) continue;
    // 长度限制：2-8个字符
    if (s.length < 2 || s.length > 8) continue;
    // 必须为中文（允许含数字，如 2型糖尿病）
    if (!/^[\u4e00-\u9fa5\d]+$/.test(s)) continue;
    // 跳过噪声词
    if (noiseWords.has(s)) continue;
    // 跳过药品/剂型后缀
    if (drugSuffix.test(s)) continue;
    // 跳过位置词
    if (locationRe.test(s)) continue;
    candidates.push(s);
  }

  return candidates.join('、');
}

function parseRecord(text) {
  return {
    hospital: findHospital(text),
    department: findDepartment(text),
    visitDate: findDate(text),
    diagnosis: extractDiagnosis(text) || '',
    chiefComplaint: extractBlock(text, ['主诉']) || '',
    // 无"医嘱"时用"处置"等区块内容代替（多行药品/用法文本）
    orders: extractBlock(text, ['医嘱', '处置', '处理', '处理意见', '治疗方案', '建议', 'Rp']) || '',
    doctor: extractDoctor(text),
    metrics: findMetrics(text)
  };
}

// 检查报告的描述/结论常为多行文本：收集关键词所在行及后续行，直到遇到下一个区块标签
// 比 extractAfter（仅取同行分隔符后内容）更灵活，适配"超声所见：\n肝脏大小正常..."这类多行描述
function extractReportBlock(text, keywords) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const stopRe = /^[【\[][^】\]]*[】\]]/;
  // 遇到下一个报告区块标签或报告尾信息即停止收集
  const endRe = /(超声提示|检查提示|提示[:：]|检查结论|结论[:：]|印象|诊断意见|诊断结果|检查所见|超声所见|影像所见|超声描述|超声表现|影像表现|检查描述|描述[:：]|所见[:：]|检查项目|检查部位|部位[:：]|医师签名|医师签字|主治医师|审核|报告医师|检查医师|报告日期|第\s*\d+\s*页|共\s*\d+\s*页)/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!keywords.some(kw => l.includes(kw))) continue;
    // 同行分隔符后的内容
    const after = l.replace(/^[^:：】\]]*[:：】\]]\s*/, '').trim();
    const parts = after ? [after] : [];
    for (let j = i + 1; j < lines.length; j++) {
      const nl = lines[j];
      if (stopRe.test(nl) || endRe.test(nl)) break;
      if (/^<\/?[^>]+>$/.test(nl)) continue;
      parts.push(nl);
    }
    return parts.filter(Boolean).join('\n').trim();
  }
  return '';
}

// 判定是否为验血/化验单：含"标本"或"项目名称"+"参考范围"，且非影像学报告
function isBloodTestReport(text) {
  if (/超声|影像|CT|MRI|MR|放射|X线|X光|B超|核磁|心电图|脑电图|造影/.test(text)) return false;
  if (/参考范围|参考值|正常范围/.test(text) && /标本|项目名称/.test(text)) return true;
  if (/化验|检验/.test(text) && /参考范围|参考值/.test(text)) return true;
  // 兜底：含"参考范围"且数值指标行较多
  if (/参考范围|参考值/.test(text) && findMetrics(text).length >= 4) return true;
  return false;
}

// 将化验单指标表解析为 GFM markdown 表格字符串
// 适配两种 OCR 排版：
//   1) 表头与每列各占一行（列名独立成行）、数据值各占一行
//   2) 表头一行、每条指标一行（空格分隔列）
// 例：*丙氨酸氨基转移酶ALT / 43.5 / U/L / 9-50 / I  →  | *丙氨酸氨基转移酶 | ALT | 43.5 | U/L | 9-50 | I |
function parseLabTable(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return '';

  // 标准列（顺序固定，与输出表头一致）
  const COLS = [
    { key: 'name', label: '项目名称', re: /项目名称|项目名|中文名/ },
    { key: 'abbr', label: '缩写', re: /缩写|英文|代码|代号/ },
    { key: 'result', label: '结果', re: /结果/ },
    { key: 'unit', label: '单位', re: /单位/ },
    { key: 'ref', label: '参考范围', re: /参考范围|参考值|正常范围|正常值|生物参考/ },
    { key: 'method', label: '方法', re: /方法|测定法|检测方法/ }
  ];
  // 表头 token 判定（用于定位表头/数据边界）
  const HEADER_TOKEN_RE = /^(项目名称|项目名|项目|中文名|中文名字|缩写|英文缩写|英文|代码|代号|结果|单位|参考范围|参考值|正常范围|正常值|生物参考区间|方法|检测方法|测定法|提示|异常标记|标志)$/;

  // 1. 定位表头起点：行首 token 为"项目名称"（或 中文名/项目名），避免误匹配"带*为...通用项目"这类正文行
  const firstToken = (l) => l.split(/\s+/).filter(Boolean)[0] || '';
  let headerStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^(项目名称|项目名|中文名)$/.test(firstToken(lines[i]))) { headerStart = i; break; }
  }
  if (headerStart === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (firstToken(lines[i]) === '项目' && /结果|参考范围|单位|缩写/.test(lines[i])) { headerStart = i; break; }
    }
  }
  if (headerStart === -1) return '';

  // 2. 数据区结束：遇到页脚（备注/医师/报告时间/方法图例等）停止，避免把人名、方法图例当作数据
  const FOOTER_RE = /^(备注|申请医师|报告时间|报告日期|检验者|审核者|复核|方法[:：]|注[:：]|地址|打印|送检|采集时间|接收时间|临床诊断)/;
  let dataEnd = lines.length;
  for (let i = headerStart + 1; i < lines.length; i++) {
    if (FOOTER_RE.test(lines[i])) { dataEnd = i; break; }
  }

  // 3. token 化（表头 + 数据区），切出"表头 token 段"与"数据 token 段"
  const allTokens = [];
  for (let i = headerStart; i < dataEnd; i++) {
    allTokens.push(...lines[i].split(/\s+/).filter(Boolean));
  }
  let idx = 0;
  while (idx < allTokens.length && HEADER_TOKEN_RE.test(allTokens[idx])) idx++;
  const headerTokens = allTokens.slice(0, idx);
  const dataTokens = allTokens.slice(idx);
  if (!dataTokens.length) return '';

  // 判断实际存在的列（至少要有 项目名称 + 结果）
  const headerText = headerTokens.join(' ');
  const presentCols = COLS.filter(c => c.re.test(headerText));
  if (!presentCols.find(c => c.key === 'name') || !presentCols.find(c => c.key === 'result')) return '';

  // 4. token 分类器
  //    名称：含 ≥2 个中文字符（适配 *γ-谷氨酰基转移酶 这类以希腊字母开头但含中文的指标名）
  const isName = (t) => /[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/.test(t);
  const isNumber = (t) => /^[<>↑↓]?\d+\.?\d*[<>↑↓]?$/.test(t);
  const isArrow = (t) => /^[↑↓]$/.test(t);
  const isRange = (t) => ((/[-~]/.test(t) && /\d/.test(t) && !isNumber(t)) || /^[<>]\d/.test(t));
  const unitRe = /^(mmol\/L|U\/L|IU\/L|mIU\/L|U\/mL|g\/L|mg\/dL|mg\/L|μg\/L|ug\/L|μmol\/L|umol\/L|ng\/ml|ng\/dL|pg\/ml|pg|fL|mmol|mg|g|ml|%|×10[⁹9]\/L|×10[¹1]2?\/L|kPa|mmHg|g\/dL|IU|U|个\/L|\/L|×10\^?\d\/L)$/i;
  const isUnit = (t) => unitRe.test(t);
  // 缩写候选：2-10 位拉丁字母/数字/斜杠（A/G、ALT、TBIL），但排除单位（U/L、g/L 等）
  const isAbbrCandidate = (t) => /^[A-Za-z][A-Za-z0-9/+.\-]{1,9}$/.test(t) && !isUnit(t);

  // 5. 第一遍：定位所有"名称锚点"，并为每个名称在 [name, 下一个 name) 区间内配对首个缩写
  //    支持名称+缩写连写（*丙氨酸氨基转移酶ALT）；双栏 OCR 交错时缩写可能离名称较远
  const anchors = [];
  for (let i = 0; i < dataTokens.length; i++) {
    const t = dataTokens[i];
    if (!isName(t)) continue;
    let name, abbr = '', abbrPos = -1;
    // 拆分尾部拉丁缩写（允许名称以 γ 等非汉字字符开头）
    const m = t.match(/^(\*?[\u4e00-\u9fa5γ][\u4e00-\u9fa5（）()γ·\-]+)([A-Za-z][A-Za-z0-9/+.\-]+)$/);
    if (m) { name = m[1]; abbr = m[2]; abbrPos = i; }
    else {
      name = t;
      // 向后到下一个 name 之前，找首个缩写候选
      for (let j = i + 1; j < dataTokens.length; j++) {
        if (isName(dataTokens[j])) break;
        if (isAbbrCandidate(dataTokens[j])) { abbr = dataTokens[j]; abbrPos = j; break; }
      }
    }
    anchors.push({ name, abbr, namePos: i, abbrPos });
  }
  if (!anchors.length) return '';

  // 6. 第二遍：为每个锚点收集值
  //    值区间 = [本行 abbrPos+1 或 namePos+1, 下一行 abbrPos 或 namePos)
  //    双栏交错时，左栏的值可能出现在右栏名称之后、右栏缩写之前 —— 此区间恰好覆盖，且跳过其中的名称 token
  const rows = [];
  for (let a = 0; a < anchors.length; a++) {
    const anc = anchors[a];
    const start = anc.abbrPos >= 0 ? anc.abbrPos + 1 : anc.namePos + 1;
    let end;
    if (a + 1 < anchors.length) {
      const next = anchors[a + 1];
      end = next.abbrPos >= 0 ? next.abbrPos : next.namePos;
    } else {
      end = dataTokens.length;
    }
    const row = { name: anc.name, abbr: anc.abbr, result: '', unit: '', ref: '', method: '' };
    const ranges = [];
    for (let i = start; i < end; i++) {
      const t = dataTokens[i];
      if (isName(t)) continue;                 // 跳过夹在中间的下一行名称
      if (isArrow(t)) {
        if (row.result && !/[↑↓]$/.test(row.result)) row.result += t;
      } else if (isNumber(t)) {
        if (!row.result) row.result = t;
        else row.method = row.method ? row.method + ' ' + t : t;
      } else if (isUnit(t)) {
        if (!row.unit) row.unit = t;
      } else if (isRange(t)) {
        ranges.push(t);                        // 参考范围可能多个(含噪声)，取最后一个
      } else if (/^[A-Z]$/.test(t)) {
        row.method = row.method ? row.method + ' ' + t : t;   // 单字母方法码
      }
      // 其余 token 忽略（含其他行的缩写候选等）
    }
    if (ranges.length) row.ref = ranges[ranges.length - 1];
    rows.push(row);
  }

  // 过滤无有效值的噪声行
  const validRows = rows.filter(r => r.name && (r.result || r.unit || r.ref));
  if (!validRows.length) return '';

  // 7. 生成 markdown 表格（仅转义 | 分隔符；* 是互认项目标记，保留原样不转义）
  const esc = (v) => (v || '').replace(/\|/g, '\\|');
  const header = '| ' + presentCols.map(c => c.label).join(' | ') + ' |';
  const sep = '| ' + presentCols.map(c => (c.key === 'result' || c.key === 'ref') ? '---:' : ':---').join(' | ') + ' |';
  const body = validRows.map(r => '| ' + presentCols.map(c => esc(r[c.key])).join(' | ') + ' |').join('\n');
  return header + '\n' + sep + '\n' + body;
}

function parseReport(text) {
  const base = {
    hospital: findHospital(text),
    department: findDepartment(text),
    visitDate: findDate(text),
    doctor: extractDoctor(text)
  };
  // 验血化验单：检查项目取"标本"，检查所见整理为 markdown 表格
  if (isBloodTestReport(text)) {
    const table = parseLabTable(text);
    return Object.assign(base, {
      examName: extractAfter(findLine(text, ['标本类型', '标本种类', '标本'])) || '',
      findings: table || '',
      conclusion: ''
    });
  }
  // 影像/超声等检查报告：灵活匹配关键词 + 多行描述块
  return Object.assign(base, {
    examName: extractAfter(findLine(text, ['检查项目', '检查名称', '检查部位', '部位', '检查种类', '检查方式'])) || '',
    findings: extractReportBlock(text, ['检查所见', '超声所见', '影像所见', '超声描述', '超声表现', '影像表现', '检查描述', '描述', '所见']) || '',
    conclusion: extractReportBlock(text, ['检查结论', '超声提示', '检查提示', '提示', '结论', '印象', '诊断意见', '诊断结果']) || ''
  });
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
      // 同行规格后可能还有数量（如 2.5mg*7X1盒 → 数量1盒）
      const afterSpec = l.substring(specM.index + specM[0].length);
      const qtyInLine = afterSpec.match(/(\d+)\s*(盒|瓶|袋|支|板|包)/);
      if (qtyInLine) {
        currentMed.quantity = parseInt(qtyInLine[1]);
        currentMed.quantityUnit = qtyInLine[2];
      }
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

    // 2.5 用法/用量/服法行：提取剂量和频次（如 用法：2.5mg口服1/日）
    if (/^[用法用量服法]+[:：]/.test(l)) {
      const usage = l.replace(/^[用法用量服法]+[:：]\s*/, '');
      const dM = usage.match(/(\d+\.?\d*)\s*(mg|g|ml|片|粒|袋|丸|支|ug|μg)/i);
      if (dM) { currentMed.doseAmount = dM[1]; currentMed.doseUnit = dM[2]; }
      const fM = usage.match(freqRe);
      if (fM) currentMed.frequency = fM[1];
      continue;
    }

    // 3. 频次
    const freqM = l.match(freqRe);
    if (freqM) {
      currentMed.frequency = freqM[1];
      // 同行可能还有剂量（如 2.5mg口服1/日，无"用法："前缀的情况）
      if (!currentMed.doseAmount) {
        const dM = l.match(/(\d+\.?\d*)\s*(mg|g|ml|片|粒|袋|丸|支|ug|μg)/i);
        if (dM) { currentMed.doseAmount = dM[1]; currentMed.doseUnit = dM[2]; }
      }
      continue;
    }

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
  return {
    hospital: findHospital(text),
    department: findDepartment(text),
    visitDate: findDate(text),
    diagnosis: extractDiagnosis(text) || '',
    doctor: extractDoctor(text),
    medications: meds
  };
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

// 根据OCR文本内容自动判定类型
// 规则：
//   病历：标题含"病历"
//   处方：标题含"处方"或有价格金额
//   检查报告：标题含"报告"或"检验"、"化验"
//   药品：文字含"国药准字"、"适应症"、"成份"、"性状"等
function detectType(text) {
  if (!text || !text.trim()) return 'record';
  const head = text.substring(0, 300); // 标题区域（前300字符）
  const full = text;

  // 1. 病历：标题含"病历"
  if (/病历/.test(head)) return 'record';

  // 2. 检查报告：标题含"报告"或"检验"、"化验"
  if (/报告|检验报告|化验|检查报告|影像诊断|超声|CT报告|MRI|放射/.test(head)) return 'report';

  // 3. 处方：标题含"处方"或有价格金额
  if (/处方|Rp[:：]?|R[:：]/.test(head)) return 'prescription';
  if (/[¥￥]\s*\d|金额[:：]?\s*\d|合计[:：]?\s*\d|价格[:：]?\s*\d|费用[:：]?\s*\d|元\s*\d+\.\d{2}/.test(full)) return 'prescription';

  // 4. 药品：文字含"国药准字"、"适应症"、"成份"、"性状"等
  if (/国药准字|批准文号/.test(full)) return 'drug';
  if (/适应[症证]/.test(full) && /成份|成分|性状/.test(full)) return 'drug';

  // 默认：病历
  return 'record';
}

function parse(type, text) {
  // type='auto' 时自动判定
  if (type === 'auto') {
    type = detectType(text);
    console.log(`[OCR] 自动判定类型: ${type}`);
  }
  switch (type) {
    case 'record': return parseRecord(text);
    case 'report': return parseReport(text);
    case 'prescription': return parsePrescription(text);
    case 'drug': return parseDrug(text);
    default: return parseRecord(text);
  }
}

module.exports = { isConfigured, recognizeText, parse, parseRecord, parseReport, parsePrescription, parseDrug, detectType };
