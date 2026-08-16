/**
 * ShowAPI 药品信息服务
 * 文档：
 *   药品详细信息(按批准文号/药品ID): https://www.showapi.com/apiGateway/view/1468/3
 *   药名查询药品信息: https://www.showapi.com/apiGateway/view/1468/4
 *
 * 查询策略：
 *   1. 优先用批准文号调 1468/3 (searchType=2)
 *   2. 查不到再用药名调 1468/4 (无需 classifyId)
 */

const SHOWAPI_KEY = process.env.SHOWAPI_KEY || '';
const API_DETAIL = 'https://route.showapi.com/1468-3';   // 按批准文号/药品ID
const API_NAME   = 'https://route.showapi.com/1468-4';   // 按药品名

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
  'hypy',          // 豁免用药
  'price',         // 价格
  'detailUrl',     // 药品详情URL
  'old_id',        // '旧ID',
  'ywm',           // '药品名称',
]);

// 字段名映射：API 返回字段 -> 中文显示名
const FIELD_LABELS = {
  drugName: '药品名称',
  spmc: '商品名',
  tymc: '通用名',
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
  yb: '医保',
  bz: '包装',
  lx: '类型',
  yxq: '有效期',
  pzwh: '批准文号',
  manu: '生产企业',
  zxbz: '执行标准',
  xz: '性状',
  zycf: '主要成分',
  yldl: '药理毒理',
  yddlx: '药代动力学',
  yfyy: '孕妇用药',
  yfjbrqfnyy: '儿童用药',
  lryy: '老人用药',
  etyy: '特殊人群用药',
  hypy: '豁免',
  price: '价格',
  pp: '品牌',
  drugId: '药品ID',
  type2: '药品小分类',
  type2Code: '药品小分类ID',
  detailUrl: '药品详情URL',
  old_id: '旧ID',
  ywdl: '药物毒理',
  ywgl: '药物过量',
  ywm: '药品名称',
};

function isConfigured() {
  return !!SHOWAPI_KEY && SHOWAPI_KEY !== 'your_showapi_key_here';
}

/**
 * 调用 ShowAPI 获取药品详情
 * 优先用批准文号(1468/3 searchType=3)查询，查不到再用药名(1468/4)查询
 */
async function fetchDrugInfo(params) {
  if (!isConfigured()) {
    const err = new Error('ShowAPI 未配置');
    err.code = 'SHOWAPI_NOT_CONFIGURED';
    throw err;
  }

  const { drugName, approvalNumber } = params;

  // 1. 先用批准文号查（1468/3, searchType=3）
  if (approvalNumber && approvalNumber.trim()) {
    console.log(`[ShowAPI] 尝试用批准文号查询: ${approvalNumber}`);
    const result = await _requestDetail('3', approvalNumber.trim());
    if (result) {
      console.log(`[ShowAPI] 批准文号查询成功`);
      return result;
    }
    console.log(`[ShowAPI] 批准文号查询无结果，改用药品名查询`);
  }

  // 2. 再用药品名查（1468/4，专用药名查询接口，无需 classifyId）
  if (drugName && drugName.trim()) {
    console.log(`[ShowAPI] 尝试用药品名查询: ${drugName}`);
    const result = await _requestByName(drugName.trim());
    if (result) {
      console.log(`[ShowAPI] 药品名查询成功`);
      return result;
    }
  }

  return null;
}

/**
 * 按批准文号/药品ID查询（1468/3）
 * searchType: 3=国药准字, 4=药品ID
 */
async function _requestDetail(searchType, searchKey) {
  const params = new URLSearchParams({
    appKey: SHOWAPI_KEY,
    searchType,
    searchKey,
    page: '1',
    maxResult: '10'
  });

  const url = `${API_DETAIL}?${params.toString()}`;
  return await _doRequest(url);
}

/**
 * 按药品名查询（1468/4，专用接口，无需 classifyId）
 */
async function _requestByName(drugName) {
  const params = new URLSearchParams({
    appKey: SHOWAPI_KEY,
    searchKey: drugName,
    page: '1',
    maxResult: '10'
  });

  const url = `${API_NAME}?${params.toString()}`;
  return await _doRequest(url);
}

/**
 * 通用请求处理
 */
async function _doRequest(url) {
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
  if (!type1 && drug.type1) {
    type1 = drug.type1;
  }

  const syz = drug.syz || null;
  const jx = drug.jx || null;
  const wyy = drug.wyy === '是' || drug.wyy === 1 || drug.wyy === true ? 1 : 0;
  const fl = drug.fl || null;
  const yfyl = drug.yfyl || null;

  // 组合药品说明
  const descParts = [];

  // 用户最关心的字段放前面
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

  // 剩余字段
  for (const [key, val] of Object.entries(drug)) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    if (priorityOrder.includes(key)) continue;
    if (val === null || val === undefined || val === '') continue;
    if (Array.isArray(val)) continue;
    const label = FIELD_LABELS[key] || key;
    descParts.push(`【${label}】${val}`);
  }

  const description = descParts.length > 0 ? descParts.join('\n') : null;

  return { type1, syz, jx, wyy, fl, yfyl, description };
}

module.exports = { fetchDrugInfo, parseDrugInfo, isConfigured };
