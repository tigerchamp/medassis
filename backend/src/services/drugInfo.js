/**
 * ShowAPI 药品详细信息服务
 * 文档：https://www.showapi.com/apiGateway/view/1468/3
 * 功能：根据药品名称从 ShowAPI 获取详细说明书信息，并解析为数据库字段
 * 
 * 接口地址：https://route.showapi.com/1468-3
 * 请求参数：searchType=1（按名称）, searchKey=药品名称, appKey=密钥
 * 返回数据：showapi_res_body.drugList 数组
 */

const SHOWAPI_KEY = process.env.SHOWAPI_KEY || '';
const SHOWAPI_URL = 'https://route.showapi.com/1468-3';

// 不需要出现在说明书正文中的字段
const EXCLUDED_FIELDS = new Set([
  'drugId',        // 药品ID
  'type2',         // 药品小分类
  'type2Code',     // 药品小分类ID
  'type',          // 分类数组（已提取 type1）
  'typeCode',      // 分类代码
  'ret_code',      // 返回码
  'msg',           // 消息
  'page',          // 页码
  'count',         // 总数
]);

// 字段名映射：API 返回字段 -> 中文显示名（用户关心的放前面）
const FIELD_LABELS = {
  drugName: '药品名称',
  spmc: '商品名',
  tymc: '通用名',
  englishName: '英文名称',
  pinyin: '汉语拼音',
  type1: '药品类别',
  syz: '适应症',
  jx: '剂型',
  gg: '规格',
  wyy: '是否外用',
  fl: '中西药',
  yfyl: '用法用量',
  blfy: '不良反应',
  jj: '禁忌',
  zysx: '注意事项',
  ywxhzy: '药物相互作用',
  zc: '贮藏',
  yxq: '有效期',
  pzwh: '批准文号',
  manu: '生产企业',
  zxbz: '执行标准',
  xz: '性状',
  zycf: '主要成分',
  ywdl: '药理毒理',
  ywgl: '药代动力学',
  yfyy: '孕妇用药',
  yfjbrqfnyy: '儿童用药',
  lryy: '老人用药',
  etyy: '特殊人群用药',
  hypy: '豁免',
  price: '价格',
  pp: '品牌',
};

function isConfigured() {
  return !!SHOWAPI_KEY && SHOWAPI_KEY !== 'your_showapi_key_here';
}

/**
 * 调用 ShowAPI 获取药品详情
 * 优先用批准文号(searchType=3)查询，查不到再用药品名(searchType=1)查询
 * @param {object} params 查询参数
 * @param {string} params.drugName 药品名称
 * @param {string} [params.approvalNumber] 批准文号（药准字号）
 * @returns {Promise<object|null>} drugList 中的第一个药品数据或 null
 */
async function fetchDrugInfo(params) {
  if (!isConfigured()) {
    const err = new Error('ShowAPI 未配置');
    err.code = 'SHOWAPI_NOT_CONFIGURED';
    throw err;
  }

  const { drugName, approvalNumber } = params;

  // 先用批准文号查（searchType=3）
  if (approvalNumber && approvalNumber.trim()) {
    console.log(`[ShowAPI] 尝试用批准文号查询: ${approvalNumber}`);
    const result = await _request('3', approvalNumber.trim());
    if (result) {
      console.log(`[ShowAPI] 批准文号查询成功`);
      return result;
    }
    console.log(`[ShowAPI] 批准文号查询无结果，改用药品名查询`);
  }

  // 再用药品名查（searchType=1）
  if (drugName && drugName.trim()) {
    console.log(`[ShowAPI] 尝试用药品名查询: ${drugName}`);
    const result = await _request('1', drugName.trim());
    if (result) {
      console.log(`[ShowAPI] 药品名查询成功`);
      return result;
    }
  }

  return null;
}

/**
 * 底层请求方法
 * @param {string} searchType 搜索类型
 * @param {string} searchKey 搜索关键词
 * @returns {Promise<object|null>}
 */
async function _request(searchType, searchKey) {
  const params = new URLSearchParams({
    appKey: SHOWAPI_KEY,
    searchType,
    searchKey,
    page: '1',
    maxResult: '10'
  });

  const url = `${SHOWAPI_URL}?${params.toString()}`;

  try {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      console.warn(`[ShowAPI] HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();

    if (data.showapi_res_code !== 0) {
      console.warn(`[ShowAPI] 返回错误: code=${data.showapi_res_code}, msg=${data.showapi_res_error}`);
      return null;
    }

    const body = data.showapi_res_body || {};
    if (body.ret_code !== '0' && body.ret_code !== 0) {
      console.warn(`[ShowAPI] 业务错误: ${body.msg || body.ret_code}`);
      return null;
    }

    const drugList = body.drugList || [];
    if (drugList.length === 0) {
      return null;
    }
    return drugList[0];
  } catch (err) {
    console.error('[ShowAPI] 请求异常:', err.message);
    return null;
  }
}

/**
 * 将 API 返回数据解析为数据库字段
 * @param {object} drug ShowAPI 返回的单个药品数据（drugList[0]）
 * @returns {{ type1: string|null, syz: string|null, jx: string|null, wyy: number, fl: string|null, description: string|null }}
 */
function parseDrugInfo(drug) {
  if (!drug) {
    return { type1: null, syz: null, jx: null, wyy: 0, fl: null, description: null };
  }

  // 从 type 数组提取 type1（药品类别）
  let type1 = null;
  if (Array.isArray(drug.type) && drug.type.length > 0) {
    type1 = drug.type[0].type1 || null;
  }
  // 也兼容直接返回 type1 的情况
  if (!type1 && drug.type1) {
    type1 = drug.type1;
  }

  const syz = drug.syz || null;
  const jx = drug.jx || null;
  const wyy = drug.wyy === '是' || drug.wyy === 1 || drug.wyy === true ? 1 : 0;
  const fl = drug.fl || null;

  // 组合药品说明
  const descParts = [];

  // 第一部分：用户最关心的字段（按 FIELD_LABELS 定义的顺序）
  const priorityOrder = [
    'drugName', 'spmc', 'tymc',
    'type1', 'syz', 'jx', 'gg', 'wyy', 'fl',
    'yfyl', 'blfy', 'jj', 'zysx', 'ywxhzy',
    'zc', 'yxq',
    'pzwh', 'manu', 'zxbz', 'xz', 'zycf',
  ];
  for (const key of priorityOrder) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    const val = drug[key];
    if (val === null || val === undefined || val === '') continue;
    const label = FIELD_LABELS[key] || key;
    descParts.push(`【${label}】${val}`);
  }

  // 第二部分：剩余字段
  for (const [key, val] of Object.entries(drug)) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    if (priorityOrder.includes(key)) continue;
    if (val === null || val === undefined || val === '') continue;
    if (Array.isArray(val)) continue;
    const label = FIELD_LABELS[key] || key;
    descParts.push(`【${label}】${val}`);
  }

  const description = descParts.length > 0 ? descParts.join('\n') : null;

  return { type1, syz, jx, wyy, fl, description };
}

module.exports = { fetchDrugInfo, parseDrugInfo, isConfigured };
