/**
 * OCR 识别模拟模块
 * 由于纯前端环境，采用规则匹配 + 关键字提取模拟OCR效果
 * 在实际生产环境应接入：百度AI、腾讯云或阿里云医疗OCR API
 */
(function (global) {
  'use strict';

  // 关键字库 - 用于智能填充
  const DRUG_KEYWORDS = ['氨氯地平', '缬沙坦', '二甲双胍', '阿托伐他汀', '阿司匹林', '硝苯地平', '美托洛尔', '胰岛素', '钙尔奇', '碳酸钙', '维生素'];
  const DIAGNOSIS_KEYWORDS = ['高血压', '糖尿病', '冠心病', '脑梗', '高血脂', '关节炎', '支气管炎', '胃炎', '颈椎病', '骨质疏松', '心律失常'];
  const METRIC_KEYWORDS = ['血压', '血糖', '胆固醇', '甘油三酯', '白细胞', '红细胞', '血红蛋白', '肌酐', '尿素', '尿酸', '糖化'];
  const HOSPITAL_KEYWORDS = ['医院', '门诊', '诊所', '中心', '卫生院', '人民'];

  // 随机填充示例
  const SAMPLE_TEMPLATES = {
    record: [
      { diagnosis: '高血压3级', hospital: '市中心医院', department: '心内科', chiefComplaint: '头晕、头痛伴乏力1周',
        metrics: [
          { name: '收缩压', value: '155', unit: 'mmHg', ref: '90-140', abnormal: true },
          { name: '舒张压', value: '95', unit: 'mmHg', ref: '60-90', abnormal: true },
          { name: '空腹血糖', value: '7.8', unit: 'mmol/L', ref: '3.9-6.1', abnormal: true }
        ],
        orders: '低盐低脂饮食，规律服药，监测血压血糖，1周后复诊。'
      },
      { diagnosis: '2型糖尿病、高脂血症', hospital: '人民医院', department: '内分泌科', chiefComplaint: '多饮多尿伴体重下降2月',
        metrics: [
          { name: '空腹血糖', value: '9.1', unit: 'mmol/L', ref: '3.9-6.1', abnormal: true },
          { name: '糖化血红蛋白', value: '8.2', unit: '%', ref: '4.0-6.0', abnormal: true },
          { name: '总胆固醇', value: '5.8', unit: 'mmol/L', ref: '<5.2', abnormal: true }
        ],
        orders: '糖尿病饮食，规律降糖药物治疗，每周监测血糖2-3次，每月复诊。'
      },
      { diagnosis: '冠状动脉粥样硬化性心脏病', hospital: '省人民医院', department: '心内科', chiefComplaint: '活动后胸闷气短',
        metrics: [
          { name: '心率', value: '92', unit: 'bpm', ref: '60-100', abnormal: false },
          { name: '收缩压', value: '148', unit: 'mmHg', ref: '90-140', abnormal: true },
          { name: '总胆固醇', value: '6.3', unit: 'mmol/L', ref: '<5.2', abnormal: true }
        ],
        orders: '避免剧烈运动，规律服药，2周后复查心电图及血脂。'
      }
    ],
    medication: [
      { name: '苯磺酸氨氯地平片', dose: '5mg', frequency: '每日1次', times: ['08:00'], note: '晨起服用，注意监测血压' },
      { name: '二甲双胍缓释片', dose: '0.5g', frequency: '每日2次', times: ['08:00', '20:00'], note: '餐中或餐后服用' },
      { name: '阿托伐他汀钙片', dose: '20mg', frequency: '每晚1次', times: ['21:30'], note: '睡前服用，定期复查肝功能' },
      { name: '阿司匹林肠溶片', dose: '100mg', frequency: '每日1次', times: ['08:00'], note: '餐后服用，注意观察有无出血' },
      { name: '缬沙坦胶囊', dose: '80mg', frequency: '每日1次', times: ['08:30'], note: '每日晨起服用' }
    ],
    lab: [
      { diagnosis: '生化检验报告', hospital: '市中心医院检验科', department: '检验科', chiefComplaint: '',
        metrics: [
          { name: '白细胞计数', value: '6.5', unit: '×10⁹/L', ref: '4.0-10.0', abnormal: false },
          { name: '红细胞计数', value: '4.5', unit: '×10¹²/L', ref: '4.0-5.5', abnormal: false },
          { name: '血红蛋白', value: '135', unit: 'g/L', ref: '120-160', abnormal: false },
          { name: '肌酐', value: '82', unit: 'μmol/L', ref: '44-133', abnormal: false }
        ],
        orders: ''
      }
    ]
  };

  // 随机选择
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 从图像文件名中启发式判断类型
  function guessType(fileName, hint) {
    if (hint === 'medication') return 'medication';
    if (hint === 'lab') return 'lab';
    if (hint === 'record') return 'record';
    const name = (fileName || '').toLowerCase();
    if (name.includes('药') || name.includes('处方')) return 'medication';
    if (name.includes('检验') || name.includes('blood') || name.includes('lab')) return 'lab';
    return 'record';
  }

  // 将文件转为 base64 (用于存储/预览)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 模拟 OCR 识别过程
  async function recognize(files, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const type = options.type || 'record'; // record | medication | lab
    const elderId = options.elderId;

    // 处理图片
    const images = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const dataUrl = await fileToBase64(files[i]);
        images.push({ name: files[i].name, url: dataUrl });
      } catch (e) {
        console.warn('图片读取失败：', files[i].name);
      }
    }

    onProgress({ step: 1, total: 3, text: '上传中...', percent: 20 });
    await sleep(500);

    onProgress({ step: 2, total: 3, text: '图像预处理中...', percent: 45 });
    await sleep(600);

    onProgress({ step: 3, total: 3, text: 'OCR 识别中...', percent: 75 });
    await sleep(800);

    onProgress({ step: 4, total: 4, text: '智能分析中...', percent: 95 });
    await sleep(500);

    // 根据类型生成识别结果
    const results = {
      images: images.map(i => i.url),
      confidence: +(0.82 + Math.random() * 0.15).toFixed(2),
      recognizedText: ''
    };

    if (type === 'medication') {
      const drugs = [pick(SAMPLE_TEMPLATES.medication), pick(SAMPLE_TEMPLATES.medication)];
      const uniqueDrugs = [];
      const seen = new Set();
      for (const d of drugs) {
        if (!seen.has(d.name)) { seen.add(d.name); uniqueDrugs.push(d); }
      }
      results.medications = uniqueDrugs;
      results.recognizedText = uniqueDrugs.map(d => `${d.name} ${d.dose} ${d.frequency}`).join('\n');
    } else if (type === 'lab') {
      results.record = { ...pick(SAMPLE_TEMPLATES.lab), elderId };
      results.recognizedText = '血常规、生化指标检查报告';
    } else {
      results.record = { ...pick(SAMPLE_TEMPLATES.record), elderId };
      results.recognizedText = results.record.diagnosis;
    }

    onProgress({ step: 4, total: 4, text: '识别完成', percent: 100 });
    await sleep(200);

    return results;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  global.OCR = {
    recognize,
    fileToBase64,
    guessType,
    DRUG_KEYWORDS,
    DIAGNOSIS_KEYWORDS,
    METRIC_KEYWORDS
  };
})(window);
