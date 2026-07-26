/**
 * 导入医院科室数据
 * 用法: node src/scripts/import_departments.js
 */
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { pinyin } = require('pinyin-pro');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'family_health',
};

function getPinyinAbbr(name) {
  if (!name || typeof name !== 'string') return '';
  return pinyin(name, { pattern: 'first', toneType: 'none' })
    .replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

// 国内医院常见科室数据
// 分类：内科、外科、妇产儿科、五官科、中医、其他临床、医技
const DEPARTMENTS = [
  // ---- 内科 ----
  { name: '心血管内科', category: '内科' },
  { name: '心内科', category: '内科' },
  { name: '呼吸内科', category: '内科' },
  { name: '消化内科', category: '内科' },
  { name: '神经内科', category: '内科' },
  { name: '肾内科', category: '内科' },
  { name: '内分泌科', category: '内科' },
  { name: '血液内科', category: '内科' },
  { name: '血液科', category: '内科' },
  { name: '风湿免疫科', category: '内科' },
  { name: '老年医学科', category: '内科' },
  { name: '全科医疗科', category: '内科' },
  { name: '内科', category: '内科' },
  { name: '变态反应科', category: '内科' },
  { name: '免疫科', category: '内科' },
  { name: '感染内科', category: '内科' },
  { name: '高血压科', category: '内科' },
  { name: '糖尿病科', category: '内科' },

  // ---- 外科 ----
  { name: '普通外科', category: '外科' },
  { name: '普外科', category: '外科' },
  { name: '骨科', category: '外科' },
  { name: '脊柱外科', category: '外科' },
  { name: '关节外科', category: '外科' },
  { name: '创伤外科', category: '外科' },
  { name: '神经外科', category: '外科' },
  { name: '心胸外科', category: '外科' },
  { name: '胸外科', category: '外科' },
  { name: '心脏外科', category: '外科' },
  { name: '泌尿外科', category: '外科' },
  { name: '血管外科', category: '外科' },
  { name: '烧伤科', category: '外科' },
  { name: '烧伤整形科', category: '外科' },
  { name: '整形外科', category: '外科' },
  { name: '整形美容科', category: '外科' },
  { name: '微创外科', category: '外科' },
  { name: '肝胆外科', category: '外科' },
  { name: '胃肠外科', category: '外科' },
  { name: '甲状腺外科', category: '外科' },
  { name: '乳腺外科', category: '外科' },
  { name: '肛肠科', category: '外科' },
  { name: '外科', category: '外科' },

  // ---- 妇产儿科 ----
  { name: '妇科', category: '妇产儿科' },
  { name: '产科', category: '妇产儿科' },
  { name: '妇产科', category: '妇产儿科' },
  { name: '生殖医学科', category: '妇产儿科' },
  { name: '产科特需', category: '妇产儿科' },
  { name: '儿科', category: '妇产儿科' },
  { name: '新生儿科', category: '妇产儿科' },
  { name: '儿童保健科', category: '妇产儿科' },
  { name: '小儿内科', category: '妇产儿科' },
  { name: '小儿外科', category: '妇产儿科' },
  { name: '小儿骨科', category: '妇产儿科' },
  { name: '小儿神经内科', category: '妇产儿科' },
  { name: '小儿心内科', category: '妇产儿科' },
  { name: '小儿呼吸科', category: '妇产儿科' },
  { name: '小儿消化科', category: '妇产儿科' },
  { name: '小儿耳鼻喉科', category: '妇产儿科' },
  { name: '小儿口腔科', category: '妇产儿科' },
  { name: '小儿眼科', category: '妇产儿科' },
  { name: '小儿皮肤科', category: '妇产儿科' },
  { name: '小儿泌尿外科', category: '妇产儿科' },

  // ---- 五官科 ----
  { name: '眼科', category: '五官科' },
  { name: '耳鼻喉科', category: '五官科' },
  { name: '耳鼻咽喉头颈外科', category: '五官科' },
  { name: '口腔科', category: '五官科' },
  { name: '口腔颌面外科', category: '五官科' },
  { name: '口腔正畸科', category: '五官科' },
  { name: '口腔修复科', category: '五官科' },
  { name: '口腔种植科', category: '五官科' },
  { name: '牙周科', category: '五官科' },
  { name: '牙体牙髓科', category: '五官科' },

  // ---- 中医 ----
  { name: '中医科', category: '中医' },
  { name: '中医内科', category: '中医' },
  { name: '中医外科', category: '中医' },
  { name: '中医骨伤科', category: '中医' },
  { name: '中医妇科', category: '中医' },
  { name: '中医儿科', category: '中医' },
  { name: '中医眼科', category: '中医' },
  { name: '中医耳鼻喉科', category: '中医' },
  { name: '针灸科', category: '中医' },
  { name: '推拿科', category: '中医' },
  { name: '按摩科', category: '中医' },
  { name: '中医康复科', category: '中医' },
  { name: '中医肿瘤科', category: '中医' },
  { name: '民族医学科', category: '中医' },

  // ---- 其他临床 ----
  { name: '皮肤科', category: '其他临床' },
  { name: '性病科', category: '其他临床' },
  { name: '肿瘤科', category: '其他临床' },
  { name: '肿瘤内科', category: '其他临床' },
  { name: '肿瘤外科', category: '其他临床' },
  { name: '放疗科', category: '其他临床' },
  { name: '精神科', category: '其他临床' },
  { name: '心理科', category: '其他临床' },
  { name: '医学心理科', category: '其他临床' },
  { name: '心理咨询科', category: '其他临床' },
  { name: '传染科', category: '其他临床' },
  { name: '感染科', category: '其他临床' },
  { name: '肝病科', category: '其他临床' },
  { name: '结核病科', category: '其他临床' },
  { name: '康复医学科', category: '其他临床' },
  { name: '理疗科', category: '其他临床' },
  { name: '疼痛科', category: '其他临床' },
  { name: '急诊科', category: '其他临床' },
  { name: '急诊医学科', category: '其他临床' },
  { name: '重症医学科', category: '其他临床' },
  { name: 'ICU', category: '其他临床' },
  { name: '麻醉科', category: '其他临床' },
  { name: '营养科', category: '其他临床' },
  { name: '预防保健科', category: '其他临床' },
  { name: '健康医学科', category: '其他临床' },
  { name: '体检中心', category: '其他临床' },
  { name: '干部保健科', category: '其他临床' },
  { name: '特需门诊', category: '其他临床' },
  { name: '国际医疗部', category: '其他临床' },
  { name: '全科', category: '其他临床' },
  { name: '介入科', category: '其他临床' },
  { name: '介入血管科', category: '其他临床' },

  // ---- 医技科室 ----
  { name: '超声科', category: '医技' },
  { name: '超声诊断科', category: '医技' },
  { name: '放射科', category: '医技' },
  { name: '放射诊断科', category: '医技' },
  { name: '核医学科', category: '医技' },
  { name: '检验科', category: '医技' },
  { name: '病理科', category: '医技' },
  { name: '药剂科', category: '医技' },
  { name: '输血科', category: '医技' },
  { name: '影像科', category: '医技' },
  { name: 'CT室', category: '医技' },
  { name: 'MRI室', category: '医技' },
];

async function main() {
  const pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 5 });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        pinyin_abbr VARCHAR(50) DEFAULT NULL,
        category VARCHAR(20) DEFAULT NULL,
        UNIQUE INDEX idx_name (name),
        INDEX idx_pinyin (pinyin_abbr),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('表 departments 已就绪');

    let inserted = 0;
    let skipped = 0;

    for (const dept of DEPARTMENTS) {
      const id = uuidv4();
      const pinyinAbbr = getPinyinAbbr(dept.name);
      try {
        await pool.query(
          'INSERT IGNORE INTO departments (id, name, pinyin_abbr, category) VALUES (?, ?, ?, ?)',
          [id, dept.name, pinyinAbbr, dept.category]
        );
        inserted++;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    console.log(`导入完成: 成功 ${inserted} 条, 跳过(重名) ${skipped} 条`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
