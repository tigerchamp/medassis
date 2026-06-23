/**
 * 家庭健康助手 - 数据存储层
 * 支持本地模式（localStorage）和在线模式（API）
 * 根据是否配置了API地址自动切换
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'familyHealthApp_v1';
  const SESSION_KEY = 'familyHealthApp_session';
  const IS_ONLINE_MODE = !!window.API_BASE;

  // ============ 默认数据结构 ============
  const defaultData = () => ({
    family: {
      name: '我的家庭',
      createdAt: new Date().toISOString(),
      members: [
        { id: 'u_self', name: '我', role: 'admin', phone: '13800000000' }
      ]
    },
    elders: [],
    records: [],
    prescriptions: [],
    medications: [],
    medLogs: [],
    notes: [],
    settings: {
      fontSize: 'normal',
      reminderEnabled: true,
      theme: 'light'
    }
  });

  // ============ 工具方法 ============
  const uid = (prefix = 'id') => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => new Date().toISOString().slice(0, 10);
  const now = () => new Date().toISOString();

  // ============ 本地存储方法 ============
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const d = defaultData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        return d;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.error('加载数据失败：', e);
      return defaultData();
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('保存数据失败：', e);
      return false;
    }
  }

  function getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : { currentElderId: null, lastPage: 'home' };
  }
  function setSession(s) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  // ============ 种子示例数据 ============
  function seedDemoData() {
    const data = loadData();
    if (data.elders.length > 0) return data;

    const elderId = uid('elder');
    data.elders.push({
      id: elderId,
      name: '张爷爷',
      gender: '男',
      age: 72,
      bloodType: 'A型',
      allergies: '青霉素、海鲜',
      conditions: '高血压3级、2型糖尿病、冠心病',
      phone: '13900000001',
      avatar: '张',
      createdAt: now()
    });

    const elderId2 = uid('elder');
    data.elders.push({
      id: elderId2,
      name: '李奶奶',
      gender: '女',
      age: 68,
      bloodType: 'O型',
      allergies: '磺胺类药物',
      conditions: '高血压、骨质疏松',
      phone: '13900000002',
      avatar: '李',
      createdAt: now()
    });

    // 示例病历
    data.records.push({
      id: uid('rec'),
      elderId: elderId,
      type: '病历',
      visitDate: '2026-05-20',
      hospital: '市中心医院',
      department: '心内科',
      diagnosis: '高血压3级（极高危）、2型糖尿病、冠状动脉粥样硬化性心脏病',
      chiefComplaint: '反复头晕、心悸3月，加重1周',
      metrics: [
        { name: '收缩压', value: '168', unit: 'mmHg', ref: '90-140', abnormal: true },
        { name: '舒张压', value: '98', unit: 'mmHg', ref: '60-90', abnormal: true },
        { name: '空腹血糖', value: '8.2', unit: 'mmol/L', ref: '3.9-6.1', abnormal: true },
        { name: '总胆固醇', value: '6.1', unit: 'mmol/L', ref: '<5.2', abnormal: true }
      ],
      orders: '低盐低脂饮食，规律服药，监测血压血糖，每周复诊一次，避免情绪激动。',
      imageUrl: null,
      confidence: 0.92,
      notes: [],
      createdAt: now()
    });

    data.records.push({
      id: uid('rec'),
      elderId: elderId,
      type: '检查报告',
      visitDate: '2026-05-15',
      hospital: '市中心医院',
      department: '检验科',
      diagnosis: '血常规、生化指标检查',
      chiefComplaint: '',
      metrics: [
        { name: '白细胞计数', value: '6.8', unit: '×10⁹/L', ref: '4.0-10.0', abnormal: false },
        { name: '红细胞计数', value: '4.2', unit: '×10¹²/L', ref: '4.0-5.5', abnormal: false },
        { name: '血红蛋白', value: '128', unit: 'g/L', ref: '120-160', abnormal: false },
        { name: '糖化血红蛋白', value: '7.5', unit: '%', ref: '4.0-6.0', abnormal: true },
        { name: '肌酐', value: '88', unit: 'μmol/L', ref: '44-133', abnormal: false }
      ],
      orders: '',
      imageUrl: null,
      confidence: 0.95,
      notes: [],
      createdAt: now()
    });

    data.records.push({
      id: uid('rec'),
      elderId: elderId2,
      type: '病历',
      visitDate: '2026-05-10',
      hospital: '社区医院',
      department: '全科',
      diagnosis: '原发性高血压、骨量减少',
      chiefComplaint: '腰部酸痛，偶有头痛',
      metrics: [
        { name: '收缩压', value: '145', unit: 'mmHg', ref: '90-140', abnormal: true },
        { name: '舒张压', value: '85', unit: 'mmHg', ref: '60-90', abnormal: false },
        { name: '血钙', value: '2.1', unit: 'mmol/L', ref: '2.2-2.6', abnormal: true }
      ],
      orders: '继续降压药，增加钙片摄入，多晒太阳。',
      imageUrl: null,
      confidence: 0.90,
      notes: [],
      createdAt: now()
    });

    // 示例用药
    data.medications.push({
      id: uid('med'),
      elderId: elderId,
      name: '苯磺酸氨氯地平片',
      dose: '5mg',
      frequency: '每日1次',
      times: ['08:00'],
      startDate: '2026-05-20',
      endDate: '2026-11-20',
      note: '晨起服用，注意监测血压',
      sourcePrescriptionId: null,
      reminder: true,
      status: 'active',
      createdAt: now()
    });
    data.medications.push({
      id: uid('med'),
      elderId: elderId,
      name: '二甲双胍缓释片',
      dose: '0.5g',
      frequency: '每日2次',
      times: ['08:00', '20:00'],
      startDate: '2026-05-20',
      endDate: '2026-11-20',
      note: '餐中或餐后服用，减少胃肠道反应',
      sourcePrescriptionId: null,
      reminder: true,
      status: 'active',
      createdAt: now()
    });
    data.medications.push({
      id: uid('med'),
      elderId: elderId,
      name: '阿托伐他汀钙片',
      dose: '20mg',
      frequency: '每晚1次',
      times: ['21:30'],
      startDate: '2026-05-20',
      endDate: '2026-11-20',
      note: '睡前服用，定期复查肝功能',
      sourcePrescriptionId: null,
      reminder: true,
      status: 'active',
      createdAt: now()
    });
    data.medications.push({
      id: uid('med'),
      elderId: elderId2,
      name: '缬沙坦胶囊',
      dose: '80mg',
      frequency: '每日1次',
      times: ['08:30'],
      startDate: '2026-05-10',
      endDate: '2026-11-10',
      note: '每日晨起服用',
      sourcePrescriptionId: null,
      reminder: true,
      status: 'active',
      createdAt: now()
    });
    data.medications.push({
      id: uid('med'),
      elderId: elderId2,
      name: '碳酸钙D3片',
      dose: '600mg',
      frequency: '每日1-2次',
      times: ['12:00'],
      startDate: '2026-05-10',
      endDate: '2027-05-10',
      note: '随餐服用效果更佳',
      sourcePrescriptionId: null,
      reminder: true,
      status: 'active',
      createdAt: now()
    });

    // 示例服药记录
    data.medLogs.push({
      id: uid('log'),
      medId: data.medications[0].id,
      scheduledTime: today() + ' 08:00',
      actualTime: today() + ' 08:05',
      markedBy: 'u_self',
      missed: false
    });

    saveData(data);
    return data;
  }

  // ============ 在线模式API调用 ============
  async function syncFromServer() {
    if (!IS_ONLINE_MODE || !API.isLoggedIn()) return null;
    try {
      const [eldersData, recordsData, medsData, statsData] = await Promise.all([
        API.Elders.getAll(),
        API.Records.getAll(),
        API.Medications.getAll(),
        API.Search.getStats()
      ]);

      const data = loadData();
      data.elders = eldersData.elders || [];
      data.records = recordsData.records || [];
      data.medications = medsData.mications || [];
      saveData(data);
      return data;
    } catch (err) {
      console.error('同步失败:', err);
      return null;
    }
  }

  // ============ 数据操作 API (兼容层) ============
  const DB = {
    // 通用
    reload: loadData,
    save: saveData,
    clear: () => {
      localStorage.removeItem(STORAGE_KEY);
    },
    reset: () => {
      localStorage.removeItem(STORAGE_KEY);
      return seedDemoData();
    },
    getAll: loadData,

    // 在线模式同步
    async sync() {
      return syncFromServer();
    },

    isOnline: () => IS_ONLINE_MODE && API.isLoggedIn(),

    // 老人
    addElder(elder) {
      const data = loadData();
      elder.id = uid('elder');
      elder.createdAt = now();
      if (!elder.avatar) elder.avatar = elder.name.charAt(0);
      data.elders.push(elder);
      saveData(data);

      // 如果是在线模式，同步到服务器
      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Elders.add(elder).catch(console.error);
      }

      return elder;
    },
    updateElder(id, patch) {
      const data = loadData();
      const idx = data.elders.findIndex(e => e.id === id);
      if (idx >= 0) {
        data.elders[idx] = { ...data.elders[idx], ...patch, updatedAt: now() };
        saveData(data);

        if (IS_ONLINE_MODE && API.isLoggedIn()) {
          API.Elders.update(id, patch).catch(console.error);
        }

        return data.elders[idx];
      }
      return null;
    },
    deleteElder(id) {
      const data = loadData();
      data.elders = data.elders.filter(e => e.id !== id);
      data.records = data.records.filter(r => r.elderId !== id);
      data.medications = data.medications.filter(m => m.elderId !== id);
      data.medLogs = data.medLogs.filter(l => {
        const med = data.medications.find(m => m.id === l.medId);
        return !!med;
      });
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Elders.delete(id).catch(console.error);
      }
    },
    getElder(id) {
      return loadData().elders.find(e => e.id === id);
    },

    // 病历/记录
    addRecord(rec) {
      const data = loadData();
      rec.id = uid('rec');
      rec.createdAt = now();
      if (!rec.metrics) rec.metrics = [];
      if (!rec.notes) rec.notes = [];
      data.records.push(rec);
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Records.add(rec).catch(console.error);
      }

      return rec;
    },
    updateRecord(id, patch) {
      const data = loadData();
      const idx = data.records.findIndex(r => r.id === id);
      if (idx >= 0) {
        data.records[idx] = { ...data.records[idx], ...patch, updatedAt: now() };
        saveData(data);

        if (IS_ONLINE_MODE && API.isLoggedIn()) {
          API.Records.update(id, patch).catch(console.error);
        }

        return data.records[idx];
      }
      return null;
    },
    deleteRecord(id) {
      const data = loadData();
      data.records = data.records.filter(r => r.id !== id);
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Records.delete(id).catch(console.error);
      }
    },
    getRecord(id) {
      return loadData().records.find(r => r.id === id);
    },
    getRecordsByElder(elderId) {
      return loadData().records
        .filter(r => r.elderId === elderId)
        .sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
    },

    // 用药
    addMedication(med) {
      const data = loadData();
      med.id = uid('med');
      med.createdAt = now();
      if (med.status === undefined) med.status = 'active';
      if (med.reminder === undefined) med.reminder = true;
      data.medications.push(med);
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Medications.add(med).catch(console.error);
      }

      return med;
    },
    updateMedication(id, patch) {
      const data = loadData();
      const idx = data.medications.findIndex(m => m.id === id);
      if (idx >= 0) {
        data.medications[idx] = { ...data.medications[idx], ...patch, updatedAt: now() };
        saveData(data);

        if (IS_ONLINE_MODE && API.isLoggedIn()) {
          API.Medications.update(id, patch).catch(console.error);
        }

        return data.medications[idx];
      }
      return null;
    },
    deleteMedication(id) {
      const data = loadData();
      data.medications = data.medications.filter(m => m.id !== id);
      data.medLogs = data.medLogs.filter(l => l.medId !== id);
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Medications.delete(id).catch(console.error);
      }
    },
    getMedicationsByElder(elderId, onlyActive = false) {
      const data = loadData();
      let list = data.medications.filter(m => m.elderId === elderId);
      if (onlyActive) {
        const t = today();
        list = list.filter(m => !m.endDate || m.endDate >= t);
      }
      return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    // 服药日志
    logMedication(medId, scheduledTime, missed = false) {
      const data = loadData();
      const log = {
        id: uid('log'),
        medId,
        scheduledTime,
        actualTime: missed ? null : now(),
        markedBy: 'u_self',
        missed
      };
      data.medLogs.push(log);
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Medications.log(medId, scheduledTime, missed).catch(console.error);
      }

      return log;
    },
    getMedLogsByMed(medId) {
      return loadData().medLogs.filter(l => l.medId === medId);
    },

    // 备注
    addNote(recordId, noteText, author = '家人') {
      const data = loadData();
      const rec = data.records.find(r => r.id === recordId);
      if (!rec) return null;
      if (!rec.notes) rec.notes = [];
      const note = { id: uid('note'), text: noteText, author, createdAt: now() };
      rec.notes.push(note);
      saveData(data);

      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Records.addNote(recordId, noteText, author).catch(console.error);
      }

      return note;
    },

    // 搜索
    search(keyword) {
      const data = loadData();
      const kw = (keyword || '').trim().toLowerCase();
      if (!kw) return { elders: [], records: [], medications: [] };

      // 本地搜索
      const localResult = {
        elders: data.elders.filter(e => (e.name || '').includes(keyword)),
        records: data.records.filter(r =>
          (r.diagnosis || '').toLowerCase().includes(kw) ||
          (r.hospital || '').toLowerCase().includes(kw) ||
          (r.orders || '').toLowerCase().includes(kw) ||
          (r.chiefComplaint || '').toLowerCase().includes(kw) ||
          (r.metrics || []).some(m => (m.name || '').toLowerCase().includes(kw))
        ),
        medications: data.medications.filter(m =>
          (m.name || '').toLowerCase().includes(kw) ||
          (m.note || '').toLowerCase().includes(kw)
        )
      };

      // 如果是在线模式，也进行服务器搜索
      if (IS_ONLINE_MODE && API.isLoggedIn()) {
        API.Search.search(keyword).then(result => {
          // 合并结果（去重）
          if (result.elders?.length) localResult.elders = result.elders;
          if (result.records?.length) localResult.records = result.records;
          if (result.medications?.length) localResult.medications = result.medications;
        }).catch(() => {});
      }

      return localResult;
    },

    // 家庭成员
    getMembers() {
      return loadData().family.members;
    },
    addMember(member) {
      const data = loadData();
      member.id = uid('u');
      data.family.members.push(member);
      saveData(data);
      return member;
    },

    // 会话
    session: {
      get: getSession,
      set: setSession
    },

    uid, today, now
  };

  // 初始化示例数据（首次且非在线模式）
  if (!IS_ONLINE_MODE) {
    try {
      seedDemoData();
    } catch (e) { console.error(e); }
  }

  global.DB = DB;

})(window);
