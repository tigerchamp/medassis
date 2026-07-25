/**
 * 将药品说明书种子数据写入 drugs 表
 * 用法: node seed_drug_info.js
 */
require('dotenv').config();
const { initDatabase, getPool } = require('./src/config/database');

const SEED_DATA = [
  {
    nameLike: '苯磺酸氨氯地平片',
    genericName: '氨氯地平',
    category: '钙通道阻滞剂 (CCB)',
    indication: '高血压、心绞痛',
    contraindication: '对二氢吡啶类钙通道阻滞剂过敏者禁用。严重低血压、主动脉瓣狭窄、心力衰竭患者慎用。',
    dosageInstruction: '通常起始剂量5mg，每日1次，最大剂量10mg/日。老年或肝功能不全患者建议从2.5mg开始。',
    adverseReaction: '常见：头痛、水肿、头晕、面部潮红、心悸。少见：恶心、腹痛、嗜睡、牙龈增生。',
    drugInteraction: '与CYP3A4强抑制剂(如克拉霉素、伊曲康唑)合用可升高血药浓度；与辛伐他汀合用需限制辛伐他汀剂量≤20mg/日。',
    precaution: '1.定期监测血压\n2.不可突然停药\n3.肝功能不全者减量\n4.孕妇及哺乳期妇女慎用',
    storage: '遮光，密封，25°C以下保存。'
  },
  {
    nameLike: '二甲双胍缓释片',
    genericName: '二甲双胍',
    category: '双胍类降糖药',
    indication: '2型糖尿病，尤其肥胖患者的一线用药',
    contraindication: '1.肾功能不全(eGFR<30)\n2.代谢性酸中毒\n3.严重感染或缺氧状态\n4.酒精中毒\n5.碘造影检查前后48小时停用',
    dosageInstruction: '起始500mg每日1次，晚餐时服用。可逐步增至最大2000mg/日。',
    adverseReaction: '常见：恶心、腹泻、腹痛、食欲不振。罕见但严重：乳酸酸中毒(呕吐、呼吸困难、肌肉痛)。',
    drugInteraction: '与酒精合用增加乳酸酸中毒风险；与碘造影剂合用需提前48小时停药；西咪替丁可升高其血药浓度。',
    precaution: '1.餐中或餐后服用减少胃肠反应\n2.每年监测肾功能和维生素B12\n3.碘造影前停药48小时，后复查肾功能再决定是否恢复\n4.缓释片不可碾碎或咀嚼',
    storage: '遮光，密封，30°C以下保存。'
  },
  {
    nameLike: '阿托伐他汀钙片',
    genericName: '阿托伐他汀',
    category: 'HMG-CoA还原酶抑制剂 (他汀类)',
    indication: '高脂血症、混合性高脂血症、动脉粥样硬化性心血管病预防',
    contraindication: '1.活动性肝病或转氨酶持续升高\n2.孕妇及哺乳期妇女\n3.对本品过敏者',
    dosageInstruction: '常用10-20mg，每晚1次。可增至最大80mg/日。',
    adverseReaction: '常见：便秘、腹胀、腹痛、肌痛。少见：转氨酶升高。罕见但严重：横纹肌溶解(肌肉剧痛、酱油色尿)。',
    drugInteraction: '与克拉霉素、伊曲康唑合用增加横纹肌溶解风险；与氨氯地平合用需注意剂量调整；避免与吉非贝齐合用。',
    precaution: '1.睡前服用效果最佳\n2.出现肌肉疼痛无力立即就医\n3.定期监测肝功能和肌酸激酶\n4.不可与西柚汁同服',
    storage: '遮光，密封，30°C以下保存。'
  },
  {
    nameLike: '阿莫西林胶囊',
    genericName: '阿莫西林',
    category: 'β-内酰胺类抗生素 (青霉素类)',
    indication: '敏感菌所致感染：上呼吸道感染、泌尿道感染、皮肤软组织感染、幽门螺杆菌根除治疗',
    contraindication: '1.青霉素过敏者禁用\n2.传染性单核细胞增多症患者禁用(易出皮疹)',
    dosageInstruction: '成人一般0.5g，每8小时1次。幽门螺杆菌根除：1g，每日2次，联合用药。',
    adverseReaction: '常见：恶心、呕吐、腹泻。少见：皮疹、药物热。罕见：过敏性休克。',
    drugInteraction: '与丙磺舒合用可升高血药浓度；与别嘌醇合用增加皮疹风险；可降低口服避孕药效果。',
    precaution: '1.用前确认无青霉素过敏史\n2.完整疗程7-10天，不可症状好转即停药\n3.餐后服用减少胃肠反应\n4.服药期间多饮水',
    storage: '遮光，密封，阴凉干燥处保存。'
  },
  {
    nameLike: '硝苯地平缓释片',
    genericName: '硝苯地平',
    category: '钙通道阻滞剂 (CCB)',
    indication: '高血压、心绞痛',
    contraindication: '1.对二氢吡啶类过敏者\n2.心源性休克\n3.不稳定型心绞痛禁用速释剂型',
    dosageInstruction: '起始30mg每日1次，可增至60mg/日。缓释片整片吞服，不可掰开或碾碎。',
    adverseReaction: '常见：头痛、踝部水肿、面部潮红、心悸。少见：牙龈增生、反射性心动过速。',
    drugInteraction: '与CYP3A4抑制剂合用可升高血药浓度；与β受体阻滞剂合用注意低血压和心衰；避免与利福平合用。',
    precaution: '1.缓释片必须整片吞服\n2.避免与西柚汁同服\n3.长期用药不可突然停药\n4.定期监测血压和心率',
    storage: '遮光，密封，30°C以下保存。'
  }
];

async function seed() {
  await initDatabase();
  const pool = getPool();
  let updated = 0;
  for (const item of SEED_DATA) {
    const [rows] = await pool.query(
      'SELECT code FROM drugs WHERE name = ? AND indication IS NULL LIMIT 5',
      [item.nameLike]
    );
    for (const row of rows) {
      await pool.query(
        `UPDATE drugs SET generic_name=?, category=?, indication=?, contraindication=?, dosage_instruction=?, adverse_reaction=?, drug_interaction=?, precaution=?, storage=? WHERE code=?`,
        [item.genericName, item.category, item.indication, item.contraindication, item.dosageInstruction, item.adverseReaction, item.drugInteraction, item.precaution, item.storage, row.code]
      );
      updated++;
      console.log(`已更新 ${item.nameLike} (${row.code})`);
    }
    if (rows.length === 0) {
      console.log(`跳过 ${item.nameLike}（未找到记录或已有数据）`);
    }
  }
  console.log(`\n完成，共更新 ${updated} 条记录`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
