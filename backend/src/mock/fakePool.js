const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const FAMILY_ID = 'mock-family-001';
const USER_ID = 'mock-user-001';
const ELDER_ID_SELF = 'mock-elder-self';
const ELDER_ID_1 = 'mock-elder-001';
const ELDER_ID_2 = 'mock-elder-002';

// 预生成 123456 的 bcrypt 哈希，mock 登录账号：13800138000 / 123456
const MOCK_PASSWORD_HASH = bcrypt.hashSync('123456', 10);

const now = new Date();
const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

const db = {
  users: [],
  families: [],
  elders: [],
  records: [],
  medications: [],
  med_logs: [],
  drug_inventory: [],
  files: []
};

function seed() {
  db.families = [
    { id: FAMILY_ID, name: '我的家庭', invite_code: 'MOCK123', invite_expiry: null, created_at: nowStr, updated_at: nowStr }
  ];

  db.users = [
    { id: USER_ID, name: '张三', phone: '13800138000', password: MOCK_PASSWORD_HASH, role: 'admin', family_id: FAMILY_ID, authorized: true, avatar: '张', created_at: nowStr, updated_at: nowStr }
  ];

  db.elders = [
    { id: ELDER_ID_SELF, family_id: FAMILY_ID, user_id: USER_ID, name: '张三', gender: '男', age: 35, blood_type: 'A型', allergies: '青霉素', conditions: '高血压', phone: '13800138000', avatar: '张', relation: 'self', created_at: nowStr, updated_at: nowStr },
    { id: ELDER_ID_1, family_id: FAMILY_ID, user_id: null, name: '张爷爷', gender: '男', age: 72, blood_type: 'O型', allergies: '无', conditions: '糖尿病、高血压', phone: '13900139001', avatar: '爷', relation: 'parent', created_at: nowStr, updated_at: nowStr },
    { id: ELDER_ID_2, family_id: FAMILY_ID, user_id: null, name: '李奶奶', gender: '女', age: 68, blood_type: 'B型', allergies: '海鲜', conditions: '心脏病', phone: '13900139002', avatar: '奶', relation: 'parent', created_at: nowStr, updated_at: nowStr }
  ];

  db.records = [
    { id: 'mock-record-001', elder_id: ELDER_ID_1, family_id: FAMILY_ID, type: '病历', visit_date: '2024-01-15', hospital: '市人民医院', department: '内分泌科', diagnosis: '2型糖尿病', chief_complaint: '多饮、多尿、体重下降1个月', findings: null, conclusion: null, metrics: JSON.stringify({ fasting_glucose: '12.5 mmol/L', hba1c: '8.2%', weight: '65kg' }), orders: '二甲双胍 0.5g 每日两次，饭后服用；控制饮食，适量运动；每周监测血糖。', image_url: null, confidence: 95.5, notes: JSON.stringify(['定期复查', '注意饮食控制']), created_at: nowStr, updated_at: nowStr },
    { id: 'mock-record-002', elder_id: ELDER_ID_1, family_id: FAMILY_ID, type: '检查报告', visit_date: '2024-02-20', hospital: '市人民医院', department: '检验科', diagnosis: null, chief_complaint: null, findings: '血糖偏高，肝功能正常，肾功能正常。', conclusion: '2型糖尿病随访，血糖控制一般，建议调整用药。', metrics: JSON.stringify({ fasting_glucose: '9.8 mmol/L', hba1c: '7.5%', alt: '35 U/L', creatinine: '78 μmol/L' }), orders: null, image_url: null, confidence: 98.0, notes: JSON.stringify([]), created_at: nowStr, updated_at: nowStr },
    { id: 'mock-record-003', elder_id: ELDER_ID_2, family_id: FAMILY_ID, type: '病历', visit_date: '2024-03-10', hospital: '市中心医院', department: '心内科', diagnosis: '冠心病、高血压2级', chief_complaint: '胸闷、心悸一周', findings: null, conclusion: null, metrics: JSON.stringify({ blood_pressure: '150/95 mmHg', heart_rate: '88次/分', cholesterol: '6.2 mmol/L' }), orders: '阿司匹林肠溶片 100mg 每日一次；阿托伐他汀 20mg 每晚一次；硝苯地平缓释片 30mg 每日一次。', image_url: null, confidence: 92.0, notes: JSON.stringify(['避免情绪激动', '低盐低脂饮食']), created_at: nowStr, updated_at: nowStr }
  ];

  db.medications = [
    { id: 'mock-med-001', elder_id: ELDER_ID_1, family_id: FAMILY_ID, name: '二甲双胍缓释片', dose: '0.5g', frequency: '每日两次', times: JSON.stringify(['08:00', '20:00']), start_date: '2024-01-16', end_date: null, note: '饭后服用', source_prescription_id: 'mock-record-001', reminder: true, status: 'active', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-med-002', elder_id: ELDER_ID_1, family_id: FAMILY_ID, name: '格列美脲片', dose: '2mg', frequency: '每日一次', times: JSON.stringify(['07:30']), start_date: '2024-02-21', end_date: null, note: '早餐前服用', source_prescription_id: 'mock-record-002', reminder: true, status: 'active', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-med-003', elder_id: ELDER_ID_2, family_id: FAMILY_ID, name: '阿司匹林肠溶片', dose: '100mg', frequency: '每日一次', times: JSON.stringify(['08:00']), start_date: '2024-03-11', end_date: null, note: '饭后服用', source_prescription_id: 'mock-record-003', reminder: true, status: 'active', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-med-004', elder_id: ELDER_ID_2, family_id: FAMILY_ID, name: '阿托伐他汀钙片', dose: '20mg', frequency: '每晚一次', times: JSON.stringify(['21:00']), start_date: '2024-03-11', end_date: null, note: '睡前服用', source_prescription_id: 'mock-record-003', reminder: true, status: 'active', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-med-005', elder_id: ELDER_ID_2, family_id: FAMILY_ID, name: '硝苯地平缓释片', dose: '30mg', frequency: '每日一次', times: JSON.stringify(['07:00']), start_date: '2024-03-11', end_date: null, note: '晨起服用', source_prescription_id: 'mock-record-003', reminder: true, status: 'active', created_at: nowStr, updated_at: nowStr }
  ];

  const today = new Date();
  const medLogs = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = day.toISOString().slice(0, 10);
    db.medications.forEach((med, idx) => {
      const times = JSON.parse(med.times || '[]');
      times.forEach((time, tIdx) => {
        const scheduled = `${dateStr} ${time}:00`;
        const missed = Math.random() > 0.8;
        medLogs.push({ id: `mock-log-${i}-${idx}-${tIdx}`, med_id: med.id, scheduled_time: scheduled, actual_time: missed ? null : scheduled, marked_by: USER_ID, missed: missed, created_at: scheduled });
      });
    });
  }
  db.med_logs = medLogs;

  const futureStr = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const soonStr = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pastStr = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  db.drug_inventory = [
    { id: 'mock-drug-001', family_id: FAMILY_ID, elder_id: ELDER_ID_1, name: '二甲双胍缓释片', specification: '0.5g*30片/盒', manufacturer: '中美上海施贵宝制药有限公司', quantity: 3, expiry_date: futureStr, status: 'valid', source_prescription_id: null, note: '常用降糖药', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-drug-002', family_id: FAMILY_ID, elder_id: ELDER_ID_1, name: '格列美脲片', specification: '2mg*30片/盒', manufacturer: '赛诺菲制药有限公司', quantity: 2, expiry_date: soonStr, status: 'expiring_soon', source_prescription_id: null, note: '即将过期，注意使用', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-drug-003', family_id: FAMILY_ID, elder_id: ELDER_ID_2, name: '阿司匹林肠溶片', specification: '100mg*30片/盒', manufacturer: '拜耳医药保健有限公司', quantity: 5, expiry_date: futureStr, status: 'valid', source_prescription_id: null, note: null, created_at: nowStr, updated_at: nowStr },
    { id: 'mock-drug-004', family_id: FAMILY_ID, elder_id: ELDER_ID_2, name: '阿托伐他汀钙片', specification: '20mg*7片/盒', manufacturer: '辉瑞制药有限公司', quantity: 1, expiry_date: pastStr, status: 'expired', source_prescription_id: null, note: '已过期，请丢弃', created_at: nowStr, updated_at: nowStr },
    { id: 'mock-drug-005', family_id: FAMILY_ID, elder_id: null, name: '感冒灵颗粒', specification: '10g*9袋/盒', manufacturer: '三九医药股份有限公司', quantity: 2, expiry_date: futureStr, status: 'valid', source_prescription_id: null, note: '家庭常备药', created_at: nowStr, updated_at: nowStr }
  ];

  db.files = [];
}

seed();

function formatRow(row) { return { ...row }; }

function matchCondition(row, condition) {
  if (!condition) return true;
  if (condition.type === 'and') return condition.conditions.every(c => matchCondition(row, c));
  if (condition.type === 'or') return condition.conditions.some(c => matchCondition(row, c));
  if (condition.type === 'compare') {
    const left = getFieldValue(row, condition.left);
    const right = condition.right;
    switch (condition.op) {
      case '=': if (left === null || right === null) return left === right; return String(left) === String(right);
      case '!=': case '<>': if (left === null || right === null) return left !== right; return String(left) !== String(right);
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      case 'LIKE':
        if (typeof left !== 'string' || typeof right !== 'string') return false;
        const pattern = right.replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(`^${pattern}$`, 'i').test(left);
      default: return false;
    }
  }
  if (condition.type === 'in') { const val = getFieldValue(row, condition.field); return condition.values.some(v => String(v) === String(val)); }
  if (condition.type === 'isnull') { const val = getFieldValue(row, condition.field); return val === null || val === undefined; }
  if (condition.type === 'notnull') { const val = getFieldValue(row, condition.field); return val !== null && val !== undefined; }
  return true;
}

function getFieldValue(row, fieldExpr) {
  if (typeof fieldExpr !== 'string') return fieldExpr;
  if (fieldExpr.includes('.')) { const [, col] = fieldExpr.split('.'); return row[col] !== undefined ? row[col] : row[fieldExpr]; }
  return row[fieldExpr];
}

function tokenize(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === "'" || c === '"') {
      const quote = c; let str = ''; i++;
      while (i < sql.length && sql[i] !== quote) { if (sql[i] === '\\' && i + 1 < sql.length) { str += sql[i + 1]; i += 2; } else { str += sql[i]; i++; } }
      i++; tokens.push({ type: 'string', value: str }); continue;
    }
    if (c >= '0' && c <= '9' || c === '.' && sql[i + 1] >= '0' && sql[i + 1] <= '9') {
      let num = ''; while (i < sql.length && (sql[i] >= '0' && sql[i] <= '9' || sql[i] === '.')) { num += sql[i]; i++; }
      tokens.push({ type: 'number', value: parseFloat(num) }); continue;
    }
    if ('()=<>+-*/%,;'.includes(c)) {
      if ((c === '<' || c === '>' || c === '!') && sql[i + 1] === '=') { tokens.push({ type: 'op', value: c + '=' }); i += 2; continue; }
      if (c === '<' && sql[i + 1] === '>') { tokens.push({ type: 'op', value: '<>' }); i += 2; continue; }
      tokens.push({ type: 'punct', value: c }); i++; continue;
    }
    let word = ''; while (i < sql.length && !' ()=<>+-*/%,;\t\n\r'.includes(sql[i])) { word += sql[i]; i++; }
    const upper = word.toUpperCase();
    if (['SELECT','FROM','WHERE','AND','OR','INSERT','INTO','VALUES','UPDATE','SET','DELETE','ORDER','BY','ASC','DESC','LIMIT','JOIN','LEFT','RIGHT','INNER','ON','AS','COUNT','SUM','AVG','MAX','MIN','GROUP','HAVING','CASE','WHEN','THEN','ELSE','END','FIELD','IS','NULL','NOT','LIKE','IN','DISTINCT','DATE_ADD','CURDATE','NOW','INTERVAL','TRUE','FALSE'].includes(upper)) {
      tokens.push({ type: 'keyword', value: upper, raw: word });
    } else { tokens.push({ type: 'ident', value: word }); }
  }
  return tokens;
}

function parseWhere(tokens, startIdx) { const c = parseOrExpr(tokens, startIdx); return { condition: c.cond, endIdx: c.endIdx }; }
function parseOrExpr(tokens, startIdx) {
  let idx = startIdx; const left = parseAndExpr(tokens, idx); idx = left.endIdx; const conds = [left.cond];
  while (idx < tokens.length && tokens[idx].type === 'keyword' && tokens[idx].value === 'OR') { idx++; const r = parseAndExpr(tokens, idx); conds.push(r.cond); idx = r.endIdx; }
  return { cond: conds.length === 1 ? conds[0] : { type: 'or', conditions: conds }, endIdx: idx };
}
function parseAndExpr(tokens, startIdx) {
  let idx = startIdx; const left = parseCmp(tokens, idx); idx = left.endIdx; const conds = [left.cond];
  while (idx < tokens.length && tokens[idx].type === 'keyword' && tokens[idx].value === 'AND') { idx++; const r = parseCmp(tokens, idx); conds.push(r.cond); idx = r.endIdx; }
  return { cond: conds.length === 1 ? conds[0] : { type: 'and', conditions: conds }, endIdx: idx };
}
function parseCmp(tokens, startIdx) {
  let idx = startIdx;
  if (tokens[idx]?.type === 'punct' && tokens[idx].value === '(') { idx++; const inner = parseOrExpr(tokens, idx); idx = inner.endIdx; if (tokens[idx]?.type === 'punct' && tokens[idx].value === ')') idx++; return { cond: inner.cond, endIdx: idx }; }
  const left = tokens[idx]; idx++;
  if (left?.type === 'keyword' && left.value === 'NOT') { const nr = parseCmp(tokens, idx); return { cond: { type: 'not', cond: nr.cond }, endIdx: nr.endIdx }; }
  if (left?.type === 'keyword' && left.value === 'IS') {
    const field = tokens[idx - 2]?.value || '';
    if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'NULL') { idx++; return { cond: { type: 'isnull', field }, endIdx: idx }; }
    if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'NOT') { idx++; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'NULL') { idx++; return { cond: { type: 'notnull', field }, endIdx: idx }; } }
  }
  const op = tokens[idx]; idx++;
  if (op?.type === 'keyword' && op.value === 'LIKE') { const right = tokens[idx]; idx++; return { cond: { type: 'compare', left: left.value, op: 'LIKE', right: right.value }, endIdx: idx }; }
  if (op?.type === 'keyword' && op.value === 'IN') {
    idx++; const values = [];
    if (tokens[idx]?.type === 'punct' && tokens[idx].value === '(') { idx++; while (idx < tokens.length && tokens[idx].value !== ')') { if (tokens[idx].type === 'string' || tokens[idx].type === 'number') values.push(tokens[idx].value); idx++; if (tokens[idx]?.type === 'punct' && tokens[idx].value === ',') idx++; } if (tokens[idx]?.type === 'punct' && tokens[idx].value === ')') idx++; }
    return { cond: { type: 'in', field: left.value, values }, endIdx: idx };
  }
  if (op?.type === 'keyword' && op.value === 'IS') { if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'NULL') { idx++; return { cond: { type: 'isnull', field: left.value }, endIdx: idx }; } }
  if (op?.type === 'op' || ['=', '<>', '!=', '>', '>=', '<', '<='].includes(op?.value)) { const right = tokens[idx]; idx++; return { cond: { type: 'compare', left: left.value, op: op.value, right: right?.value }, endIdx: idx }; }
  return { cond: { type: 'compare', left: left.value, op: '=', right: true }, endIdx: idx };
}

function parseOrderBy(tokens, startIdx) {
  let idx = startIdx; const orders = [];
  if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'ORDER') { idx++; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'BY') { idx++;
    while (idx < tokens.length && !(tokens[idx].type === 'keyword' && tokens[idx].value === 'LIMIT')) {
      if (tokens[idx].type === 'keyword' && tokens[idx].value === 'FIELD') { idx++; if (tokens[idx]?.type === 'punct' && tokens[idx].value === '(') { idx++; const field = tokens[idx]?.value; idx++; const values = [];
        while (idx < tokens.length && tokens[idx].value !== ')') { if (tokens[idx].type === 'punct' && tokens[idx].value === ',') { idx++; continue; } if (tokens[idx].type === 'string' || tokens[idx].type === 'ident') values.push(tokens[idx].value); idx++; }
        if (tokens[idx]?.type === 'punct' && tokens[idx].value === ')') idx++; let dir = 'ASC'; if (tokens[idx]?.type === 'keyword' && (tokens[idx].value === 'ASC' || tokens[idx].value === 'DESC')) { dir = tokens[idx].value; idx++; } orders.push({ type: 'field', field, values, dir });
      } if (tokens[idx]?.type === 'punct' && tokens[idx].value === ',') { idx++; continue; } continue; }
      const field = tokens[idx]?.value; idx++; let dir = 'ASC'; if (tokens[idx]?.type === 'keyword' && (tokens[idx].value === 'ASC' || tokens[idx].value === 'DESC')) { dir = tokens[idx].value; idx++; } orders.push({ type: 'simple', field, dir });
      if (tokens[idx]?.type === 'punct' && tokens[idx].value === ',') { idx++; continue; } break;
    }
  } }
  return { orders, endIdx: idx };
}

function executeSelect(sql, params) {
  let paramIdx = 0;
  const replacedSql = sql.replace(/\?/g, () => { const val = params[paramIdx++]; if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`; if (val === null || val === undefined) return 'NULL'; return String(val); });
  const tokens = tokenize(replacedSql); let idx = 0;
  if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'SELECT') idx++;
  const selectItems = [];
  while (idx < tokens.length && !(tokens[idx].type === 'keyword' && tokens[idx].value === 'FROM')) {
    if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'COUNT') { idx++; if (tokens[idx]?.type === 'punct' && tokens[idx].value === '(') { idx++; if (tokens[idx]?.value === '*') idx++; idx++; if (tokens[idx]?.type === 'punct' && tokens[idx].value === ')') idx++; } let alias = 'count'; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'AS') { idx++; alias = tokens[idx]?.value; idx++; } selectItems.push({ type: 'count', alias }); }
    else if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'CASE') { const ce = { type: 'case', whens: [], else: null, alias: 'case_result' }; idx++; while (idx < tokens.length && tokens[idx].type === 'keyword' && tokens[idx].value === 'WHEN') { idx++; const wc = parseOrExpr(tokens, idx); idx = wc.endIdx; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'THEN') { idx++; const tv = tokens[idx]?.value; idx++; ce.whens.push({ condition: wc.cond, value: tv }); } } if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'ELSE') { idx++; ce.else = tokens[idx]?.value; idx++; } if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'END') idx++; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'AS') { idx++; ce.alias = tokens[idx]?.value; idx++; } selectItems.push(ce); }
    else if (tokens[idx]?.value === '*') { selectItems.push({ type: 'all' }); idx++; }
    else { let field = tokens[idx]?.value; idx++; let alias = field; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'AS') { idx++; alias = tokens[idx]?.value; idx++; } selectItems.push({ type: 'field', field, alias }); }
    if (tokens[idx]?.type === 'punct' && tokens[idx].value === ',') { idx++; continue; } break;
  }
  if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'FROM') idx++;
  const tableNames = []; while (idx < tokens.length && tokens[idx].type === 'ident') { tableNames.push(tokens[idx].value); idx++; if (tokens[idx]?.type === 'punct' && tokens[idx].value === ',') { idx++; continue; } break; }
  let condition = null; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'WHERE') { idx++; const wr = parseWhere(tokens, idx); condition = wr.condition; idx = wr.endIdx; }
  let orders = []; const or = parseOrderBy(tokens, idx); orders = or.orders; idx = or.endIdx;
  let limit = null; if (tokens[idx]?.type === 'keyword' && tokens[idx].value === 'LIMIT') { idx++; limit = tokens[idx]?.value; idx++; }
  const tableName = tableNames[0]; let rows = (db[tableName] || []).map(formatRow);
  rows = rows.filter(row => matchCondition(row, condition));
  if (orders.length > 0) { rows.sort((a, b) => { for (const o of orders) { let cmp = 0; if (o.type === 'field') { const aV = String(a[o.field] || ''), bV = String(b[o.field] || ''); const aI = o.values.indexOf(aV), bI = o.values.indexOf(bV); cmp = (aI === -1 ? o.values.length : aI) - (bI === -1 ? o.values.length : bI); } else { if (a[o.field] < b[o.field]) cmp = -1; else if (a[o.field] > b[o.field]) cmp = 1; } if (o.dir === 'DESC') cmp = -cmp; if (cmp !== 0) return cmp; } return 0; }); }
  if (limit !== null) rows = rows.slice(0, parseInt(limit));
  if (selectItems.some(s => s.type === 'count')) { const result = {}; selectItems.forEach(item => { if (item.type === 'count') result[item.alias] = rows.length; }); return [result]; }
  return rows.map(row => { if (selectItems.some(s => s.type === 'all')) return row; const obj = {}; selectItems.forEach(item => { if (item.type === 'field') obj[item.alias] = row[item.field] !== undefined ? row[item.field] : row[item.alias]; else if (item.type === 'case') { let val = item.else; for (const w of item.whens) { if (matchCondition(row, w.condition)) { val = w.value; break; } } obj[item.alias] = val; } }); return obj; });
}

function executeInsert(sql, params) {
  const tm = sql.match(/INSERT\s+INTO\s+(\w+)/i); if (!tm) return { affectedRows: 0 };
  const tableName = tm[1]; const cm = sql.match(/\(([^)]+)\)\s*VALUES/i);
  const columns = cm ? cm[1].split(',').map(s => s.trim()) : [];
  const newRow = {}; columns.forEach((col, i) => { newRow[col] = params[i]; });
  newRow.created_at = nowStr; newRow.updated_at = nowStr;
  if (db[tableName]) db[tableName].push(newRow);
  return { affectedRows: 1, insertId: newRow.id };
}

function executeUpdate(sql, params) {
  const tm = sql.match(/UPDATE\s+(\w+)\s+SET/i); if (!tm) return { affectedRows: 0 };
  const tableName = tm[1]; const sm = sql.match(/SET\s+(.+?)\s+WHERE/i); const wm = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
  let condition = null;
  if (wm) { let pi = 0; const ws = 'WHERE ' + wm[1]; const rw = ws.replace(/\?/g, () => { const val = params[params.length - (wm[1].match(/\?/g) || []).length + pi]; pi++; if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`; if (val === null || val === undefined) return 'NULL'; return String(val); }); const tk = tokenize(rw); if (tk[0]?.type === 'keyword' && tk[0].value === 'WHERE') { const wr = parseWhere(tk, 1); condition = wr.condition; } }
  const setStr = sm ? sm[1] : ''; const setPairs = setStr.split(',').map(s => s.trim()); const updates = {}; let spi = 0;
  setPairs.forEach(() => { const pair = setPairs[spi]; const eqIdx = pair.indexOf('='); const col = pair.slice(0, eqIdx).trim(); const valPart = pair.slice(eqIdx + 1).trim();
    if (valPart === '?') { updates[col] = params[spi]; } else { if (valPart.startsWith("'") && valPart.endsWith("'")) updates[col] = valPart.slice(1, -1); else if (!isNaN(parseFloat(valPart)) && valPart !== '') updates[col] = parseFloat(valPart); else updates[col] = valPart; } spi++; });
  let affectedRows = 0;
  if (db[tableName]) { db[tableName] = db[tableName].map(row => { if (condition && !matchCondition(row, condition)) return row; affectedRows++; return { ...row, ...updates, updated_at: nowStr }; }); }
  return { affectedRows };
}

function executeDelete(sql, params) {
  const tm = sql.match(/DELETE\s+FROM\s+(\w+)/i); if (!tm) return { affectedRows: 0 };
  const tableName = tm[1]; let condition = null; const wm = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
  if (wm) { let pi = 0; const ws = 'WHERE ' + wm[1]; const rw = ws.replace(/\?/g, () => { const val = params[pi++]; if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`; if (val === null || val === undefined) return 'NULL'; return String(val); }); const tk = tokenize(rw); if (tk[0]?.type === 'keyword' && tk[0].value === 'WHERE') { const wr = parseWhere(tk, 1); condition = wr.condition; } }
  let affectedRows = 0;
  if (db[tableName]) { const ol = db[tableName].length; db[tableName] = db[tableName].filter(row => !condition || !matchCondition(row, condition)); affectedRows = ol - db[tableName].length; }
  return { affectedRows };
}

async function query(sql, params = []) {
  const trimmed = sql.trim(); const upper = trimmed.toUpperCase();
  if (upper.startsWith('SELECT')) return [executeSelect(trimmed, params)];
  if (upper.startsWith('INSERT')) return [executeInsert(trimmed, params)];
  if (upper.startsWith('UPDATE')) return [executeUpdate(trimmed, params)];
  if (upper.startsWith('DELETE')) return [executeDelete(trimmed, params)];
  return [{ affectedRows: 0 }];
}

async function getConnection() { return { query: async (sql, params) => query(sql, params), release: () => {} }; }
function _reset() { seed(); }

const fakePool = { query, getConnection, _reset };
module.exports = { fakePool, db, FAMILY_ID, USER_ID };
