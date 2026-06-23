/**
 * 家庭健康助手 - 主应用逻辑
 * 路由 + 页面渲染 + 交互
 */
(function () {
  'use strict';

  // 全局错误捕获（让用户能看到 JS 错误）
  window.addEventListener('error', function(e) {
    console.error('JS错误:', e.message, '行:', e.lineno, '列:', e.colno);
    var statusEl = document.getElementById('appStatus');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'appStatus';
      document.body.insertBefore(statusEl, document.body.firstChild);
    }
    statusEl.textContent = '⚠️ JS错误: ' + e.message + ' (行' + e.lineno + ')';
    statusEl.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#d32f2f;color:#fff;padding:8px 16px;font-size:13px;z-index:99999;text-align:center;font-family:sans-serif;';
  });

  // ============ DOM 引用 ============
  const $main = document.getElementById('mainContent');
  const $title = document.getElementById('pageTitle');
  const $tabbar = document.getElementById('tabbar');
  const $btnBack = document.getElementById('btnBack');
  const $btnSettings = document.getElementById('btnSettings');
  const $fabQuick = document.getElementById('fabQuick');
  const $modalMask = document.getElementById('modalMask');
  const $modalBody = document.getElementById('modalBody');
  const $toast = document.getElementById('toast');

  // 当前状态
  let currentPage = 'home';
  let currentElderId = null;
  let pageHistory = [];

  // ============ 工具函数 ============
  function setTitle(title) { $title.textContent = title; }
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function toast(msg, duration = 2000) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => $toast.classList.remove('show'), duration);
  }
  function showModal(html, opts = {}) {
    $modalBody.innerHTML = html;
    $modalMask.style.display = 'flex';
    if (opts.onMount) opts.onMount();
  }
  function closeModal() {
    $modalMask.style.display = 'none';
    $modalBody.innerHTML = '';
  }
  $modalMask.addEventListener('click', e => {
    if (e.target === $modalMask) closeModal();
  });

  function goTo(page, opts = {}) {
    if (opts.replaceRoot) pageHistory = [];
    else pageHistory.push({ page: currentPage, elderId: currentElderId });
    currentPage = page;
    if (opts.elderId) currentElderId = opts.elderId;
    renderPage();
  }
  function goBack() {
    if (pageHistory.length === 0) { goTo('home', { replaceRoot: true }); return; }
    const prev = pageHistory.pop();
    currentPage = prev.page;
    currentElderId = prev.elderId;
    renderPage();
  }
  $btnBack.addEventListener('click', goBack);

  // ============ 顶部栏控制 ============
  function updateTopbar() {
    // 返回按钮：二级页面显示，顶级页面隐藏
    const topLevelPages = ['home', 'elders', 'upload', 'meds', 'reminders'];
    const isTop = topLevelPages.includes(currentPage);
    $btnBack.style.display = isTop ? 'none' : 'flex';
    // 设置按钮：首页隐藏（首页有快捷入口），其他页面显示
    $btnSettings.style.display = currentPage === 'home' ? 'none' : 'flex';
  }

  // 二级页面内容区顶部返回导航条
  function subPageNav(title) {
    return `
      <div class="sub-nav" style="position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #E0E0E0;padding:0 8px;display:flex;align-items:center;height:44px;">
        <button onclick="App.goBack()" style="background:none;border:none;font-size:22px;color:#666;cursor:pointer;padding:6px 8px;line-height:1;">&#8592;</button>
        <span style="flex:1;text-align:center;font-size:15px;font-weight:500;color:#333;">${escapeHtml(title)}</span>
        <div style="width:36px;"></div>
      </div>`;
  }

  // 二级页面返回导航条（注入到 $main.innerHTML 前面）
  function makeSubNav(title, page) {
    return `<div class="sub-nav" style="position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #E0E0E0;padding:0 8px;display:flex;align-items:center;height:44px;gap:4px;">
      <button onclick="App.goBack()" style="background:none;border:none;font-size:22px;color:#666;cursor:pointer;padding:8px 4px;line-height:1;">&#8592;</button>
      <span style="flex:1;text-align:center;font-size:15px;font-weight:500;color:#333;">${escapeHtml(title)}</span>
      <div style="width:36px;"></div>
    </div>`;
  }

  // ============ 页面路由 ============
  function renderPage() {
    updateTopbar();
    const subPages = ['elder-detail', 'records', 'record-detail', 'search', 'settings', 'family'];
    window._isSubPage = subPages.includes(currentPage);
    window._subPageTitle = $title.textContent;

    switch (currentPage) {
      case 'home': renderHome(); break;
      case 'elders': renderElders(); break;
      case 'elder-detail': renderElderDetail(); break;
      case 'upload': renderUpload(); break;
      case 'meds': renderMeds(); break;
      case 'reminders': renderReminders(); break;
      case 'records': renderRecords(); break;
      case 'record-detail': renderRecordDetail(); break;
      case 'search': renderSearch(); break;
      case 'settings': renderSettings(); break;
      case 'family': renderFamily(); break;
      default: renderHome();
    }
    $main.scrollTop = 0;
  }
  function renderHome() {
    setTitle('家庭健康助手');
    const data = DB.getAll();
    const totalElders = data.elders.length;
    const totalRecords = data.records.length;
    const today = DB.today();
    const activeMeds = data.medications.filter(m => !m.endDate || m.endDate >= today).length;
    const upcomingMeds = data.medications.filter(m => (!m.endDate || m.endDate >= today) && m.status === 'active').slice(0, 3);
    const recentRecords = data.records.slice().sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || '')).slice(0, 3);

    const eldersHtml = data.elders.length === 0 ?
      `<div class="empty-state"><h3>暂无老人档案</h3><p>点击下方"老人档案"添加</p></div>` :
      data.elders.slice(0, 3).map(e => `
        <div class="elder-card" onclick="App.goTo('elder-detail',{elderId:'${e.id}'})">
          <div class="elder-avatar">${escapeHtml(e.avatar || e.name.charAt(0))}</div>
          <div class="elder-info">
            <h4 class="elder-name">${escapeHtml(e.name)}</h4>
            <div class="elder-meta"><span>${e.age}岁</span><span>${escapeHtml(e.gender || '')}</span><span>${escapeHtml(e.bloodType || '')}</span></div>
            <div class="elder-meta" style="margin-top:4px;color:#4CAF50;font-size:11px;">${escapeHtml((e.conditions || '').slice(0, 20))}${(e.conditions || '').length > 20 ? '...' : ''}</div>
          </div>
        </div>
      `).join('');

    const upcomingHtml = upcomingMeds.length === 0 ?
      `<p style="color:#999;text-align:center;padding:12px;font-size:13px;">暂无用药计划</p>` :
      upcomingMeds.map(m => {
        const elder = data.elders.find(e => e.id === m.elderId);
        return `
          <div class="med-card" onclick="App.goTo('meds')">
            <div class="med-head"><h4 class="med-name">${escapeHtml(m.name)}</h4><span class="med-status active">进行中</span></div>
            <div class="med-detail">${escapeHtml(elder ? elder.name : '')} · ${escapeHtml(m.dose)} · ${escapeHtml(m.frequency)}</div>
            <div class="med-times">${(m.times || []).map(t => `<span class="med-time">⏰ ${escapeHtml(t)}</span>`).join('')}</div>
          </div>`;
      }).join('');

    const recentHtml = recentRecords.length === 0 ?
      `<p style="color:#999;text-align:center;padding:12px;font-size:13px;">暂无病历记录</p>` :
      recentRecords.map(r => {
        const elder = data.elders.find(e => e.id === r.elderId);
        return `
          <div class="med-card" onclick="App.viewRecordDirect('${r.id}')">
            <div class="med-head"><h4 class="med-name">${escapeHtml(r.diagnosis || r.type || '病历')}</h4><span class="med-time" style="font-size:11px;color:#666;">${escapeHtml(r.visitDate || '')}</span></div>
            <div class="med-detail" style="color:#666;">${escapeHtml(elder ? elder.name : '')} · ${escapeHtml(r.hospital || '未填写')}</div>
          </div>`;
      }).join('');

    $main.innerHTML = `
      <div class="home-hero">
        <h2>您好，${escapeHtml(data.family.members[0]?.name || '家人')} 👋</h2>
        <p>今天是 ${today}，共管理 ${totalElders} 位家人的健康</p>
      </div>
      <div class="home-stats">
        <div class="stat-item"><span class="stat-num">${totalElders}</span><div class="stat-label">老人档案</div></div>
        <div class="stat-item"><span class="stat-num">${totalRecords}</span><div class="stat-label">病历记录</div></div>
        <div class="stat-item"><span class="stat-num">${activeMeds}</span><div class="stat-label">在用药物</div></div>
      </div>
      <div class="card">
        <h3 class="card-title">快捷操作 <small>一键完成</small></h3>
        <div class="quick-grid">
          <div class="quick-item" onclick="App.goTo('upload')"><div class="quick-icon">📷</div><span>拍照识别</span></div>
          <div class="quick-item" onclick="App.openSearchModal()"><div class="quick-icon">🔍</div><span>搜索记录</span></div>
          <div class="quick-item" onclick="App.goTo('meds')"><div class="quick-icon">💊</div><span>用药清单</span></div>
          <div class="quick-item" onclick="App.goTo('reminders')"><div class="quick-icon">🔔</div><span>服药提醒</span></div>
          <div class="quick-item" onclick="App.goTo('elders')"><div class="quick-icon">👴</div><span>老人档案</span></div>
          <div class="quick-item" onclick="App.goTo('family')"><div class="quick-icon">👨‍👩‍👧</div><span>家庭成员</span></div>
          <div class="quick-item" onclick="App.openExportModal()"><div class="quick-icon">📄</div><span>导出报告</span></div>
          <div class="quick-item" onclick="App.goTo('settings')"><div class="quick-icon">⚙️</div><span>设置</span></div>
        </div>
      </div>
      <div class="card"><h3 class="card-title">今日用药 <small style="color:#4CAF50;cursor:pointer;" onclick="App.goTo('meds')">查看全部 →</small></h3>${upcomingHtml}</div>
      <div class="card"><h3 class="card-title">最近病历 <small style="color:#4CAF50;cursor:pointer;" onclick="App.goTo('records')">查看全部 →</small></h3>${recentHtml}</div>
      <div class="card"><h3 class="card-title">家人档案</h3>${eldersHtml}</div>
      <div style="height:24px;"></div>
    `;
  }

  // ============ 老人档案列表 ============
  function renderElders() {
    setTitle('老人档案');
    const data = DB.getAll();
    $fabQuick.style.display = 'flex';
    $fabQuick.onclick = () => openElderForm();
    if (data.elders.length === 0) {
      $main.innerHTML = `<div class="empty-state"><h3>还没有老人档案</h3><p>点击右下角 + 按钮添加</p><button class="btn" onclick="App.openElderForm()">立即添加</button></div>`;
      return;
    }
    $main.innerHTML = data.elders.map(e => {
      const recCount = data.records.filter(r => r.elderId === e.id).length;
      const medCount = data.medications.filter(m => m.elderId === e.id).length;
      return `
        <div class="elder-card" onclick="App.goTo('elder-detail',{elderId:'${e.id}'})">
          <div class="elder-avatar">${escapeHtml(e.avatar || e.name.charAt(0))}</div>
          <div class="elder-info">
            <h4 class="elder-name">${escapeHtml(e.name)}</h4>
            <div class="elder-meta"><span>${e.age}岁</span><span>${escapeHtml(e.gender || '')}</span><span>${escapeHtml(e.bloodType || '')}</span></div>
            <div class="elder-meta" style="margin-top:4px;"><span class="tag info">${recCount} 条病历</span><span class="tag">${medCount} 种用药</span></div>
          </div>
          <div style="color:#ccc;font-size:20px;">›</div>
        </div>
      `;
    }).join('');
  }

  // ============ 老人详情 ============
  function renderElderDetail() {
    const elder = DB.getElder(currentElderId);
    if (!elder) { goTo('elders'); return; }
    setTitle(elder.name);
    const records = DB.getRecordsByElder(elder.id);
    const meds = DB.getMedicationsByElder(elder.id, true);
    const trendMetrics = extractTrendMetrics(records);

    $main.innerHTML = makeSubNav(elder.name, 'elder-detail') + `
      <div style="padding:20px 16px;background:linear-gradient(135deg,#66BB6A,#43A047);color:#fff;">
        <div class="row" style="gap:14px;">
          <div class="elder-avatar" style="background:rgba(255,255,255,0.25);border:2px solid rgba(255,255,255,0.4);">${escapeHtml(elder.avatar || elder.name.charAt(0))}</div>
          <div>
            <h2 style="margin:0 0 4px;">${escapeHtml(elder.name)}</h2>
            <p style="margin:0;opacity:0.9;font-size:13px;">${elder.age}岁 · ${escapeHtml(elder.gender || '')} · ${escapeHtml(elder.bloodType || '')}</p>
          </div>
        </div>
        ${elder.allergies ? `<div style="margin-top:12px;"><span style="background:rgba(255,255,255,0.25);padding:3px 10px;border-radius:10px;font-size:12px;">⚠️ 过敏：${escapeHtml(elder.allergies)}</span></div>` : ''}
        ${elder.conditions ? `<div style="margin-top:8px;font-size:13px;opacity:0.95;">基础疾病：${escapeHtml(elder.conditions)}</div>` : ''}
        ${elder.phone ? `<div style="margin-top:4px;font-size:12px;opacity:0.9;">📞 ${escapeHtml(elder.phone)}</div>` : ''}
      </div>
      <div class="row-between" style="padding:12px 16px;gap:8px;">
        <button class="btn btn-outline" style="flex:1;padding:8px 12px;font-size:13px;" onclick="App.openElderForm('${elder.id}')">✏️ 编辑</button>
        <button class="btn btn-outline" style="flex:1;padding:8px 12px;font-size:13px;" onclick="App.goTo('records',{elderId:'${elder.id}'})">📋 病历</button>
        <button class="btn btn-outline" style="flex:1;padding:8px 12px;font-size:13px;" onclick="App.openAddRecord('${elder.id}')">➕ 添加</button>
      </div>
      ${trendMetrics.bp.length >= 1 ? `<div class="card"><h3 class="card-title">血压趋势</h3><canvas id="bpChart" style="width:100%;height:180px;"></canvas></div>` : ''}
      ${trendMetrics.bg.length >= 1 ? `<div class="card"><h3 class="card-title">血糖趋势</h3><canvas id="bgChart" style="width:100%;height:180px;"></canvas></div>` : ''}
      <div class="card">
        <h3 class="card-title">当前用药 (${meds.length})</h3>
        ${meds.length === 0 ? '<p style="color:#999;text-align:center;padding:20px;font-size:13px;">暂无用药记录</p>' :
          meds.map(m => `
            <div class="med-card" style="margin:8px 0;box-shadow:none;background:#F9F9F9;">
              <div class="med-head"><h4 class="med-name">${escapeHtml(m.name)}</h4><span class="med-status active">进行中</span></div>
              <div class="med-detail">剂量：${escapeHtml(m.dose)} · ${escapeHtml(m.frequency)}</div>
              <div class="med-detail">疗程：${escapeHtml(m.startDate || '-')} 至 ${escapeHtml(m.endDate || '长期')}</div>
              ${m.note ? `<div class="med-detail">💡 ${escapeHtml(m.note)}</div>` : ''}
              <div class="med-times">${(m.times || []).map(t => `<span class="med-time">⏰ ${escapeHtml(t)}</span>`).join('')}</div>
            </div>
          `).join('')}
      </div>
      <div class="card">
        <h3 class="card-title">病历时间轴 (${records.length})</h3>
        ${records.length === 0 ? '<p style="color:#999;text-align:center;padding:20px;font-size:13px;">暂无病历</p>' :
          '<div class="timeline" style="padding:8px 4px;">' + records.map(r => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-date">${escapeHtml(r.visitDate || '')} · ${escapeHtml(r.hospital || '-')}</div>
              <div class="timeline-card" onclick="App.viewRecordDirect('${r.id}')">
                <h4>${escapeHtml(r.diagnosis || r.type || '病历')}</h4>
                ${(r.metrics || []).filter(m => m.abnormal).slice(0, 2).map(m => `<span class="tag danger">${escapeHtml(m.name)}: ${escapeHtml(m.value)}${escapeHtml(m.unit)}</span>`).join(' ')}
                ${r.orders ? `<p style="margin:6px 0 0;font-size:12px;color:#666;">医嘱：${escapeHtml(r.orders.slice(0, 50))}${r.orders.length > 50 ? '...' : ''}</p>` : ''}
              </div>
            </div>
          `).join('') + '</div>'}
      </div>
      <div style="padding:16px;text-align:center;"><button class="btn btn-danger outline" style="padding:8px 16px;font-size:13px;" onclick="App.confirmDeleteElder('${elder.id}')">删除此档案</button></div>
      <div style="height:24px;"></div>
    `;
    setTimeout(() => {
      if (trendMetrics.bp.length >= 1) drawLineChart('bpChart', trendMetrics.bp, 'mmHg', '#F44336');
      if (trendMetrics.bg.length >= 1) drawLineChart('bgChart', trendMetrics.bg, 'mmol/L', '#FF9800');
    }, 50);
  }

  function extractTrendMetrics(records) {
    const bp = [], bg = [];
    records.slice().sort((a, b) => (a.visitDate || '').localeCompare(b.visitDate || '')).forEach(r => {
      const date = r.visitDate || '';
      (r.metrics || []).forEach(m => {
        const n = (m.name || '').toLowerCase();
        if (n.includes('收缩') || n === 'sbp') {
          const v = parseFloat(m.value); if (!isNaN(v)) bp.push({ date, label: '收缩', value: v });
        } else if (n.includes('舒张') || n === 'dbp') {
          const v = parseFloat(m.value); if (!isNaN(v)) bp.push({ date, label: '舒张', value: v });
        } else if (n.includes('血糖') || n === 'glucose') {
          const v = parseFloat(m.value); if (!isNaN(v)) bg.push({ date, label: '血糖', value: v });
        }
      });
    });
    return { bp: bp.slice(-10), bg: bg.slice(-10) };
  }

  function drawLineChart(canvasId, points, unit, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth * 2;
    const h = canvas.height = 360;
    ctx.scale(2, 2);
    const pw = w / 2, ph = h / 2;
    ctx.clearRect(0, 0, pw, ph);
    if (points.length === 0) return;
    const pad = { top: 20, right: 12, bottom: 30, left: 36 };
    const chartW = pw - pad.left - pad.right;
    const chartH = ph - pad.top - pad.bottom;
    const values = points.map(p => p.value);
    let minV = Math.min(...values) - 5, maxV = Math.max(...values) + 5;
    if (minV === maxV) { minV -= 5; maxV += 5; }
    ctx.strokeStyle = '#EEEEEE'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH * i / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
    }
    ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
    for (let i = 0; i <= 4; i++) {
      const v = maxV - (maxV - minV) * i / 4;
      const y = pad.top + (chartH * i / 4);
      ctx.fillText(v.toFixed(0), 4, y + 3);
    }
    const stepX = points.length > 1 ? chartW / (points.length - 1) : chartW;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad.left + stepX * i;
      const y = pad.top + chartH - ((p.value - minV) / (maxV - minV)) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    points.forEach((p, i) => {
      const x = pad.left + stepX * i;
      const y = pad.top + chartH - ((p.value - minV) / (maxV - minV)) * chartH;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      if (i % Math.ceil(points.length / 5) === 0 || i === points.length - 1) {
        ctx.fillStyle = '#999'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText((p.date || '').slice(5), x, ph - 10); ctx.textAlign = 'left';
      }
    });
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif';
    ctx.fillText('单位: ' + unit, pad.left, 14);
  }

  // ============ 病历列表 ============
  function renderRecords() {
    const data = DB.getAll();
    const elder = currentElderId ? DB.getElder(currentElderId) : null;
    setTitle((elder ? elder.name + ' - ' : '') + '病历');
    let records = currentElderId ? DB.getRecordsByElder(currentElderId) : data.records.slice().sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
    if (records.length === 0) {
      $main.innerHTML = `<div class="empty-state"><h3>暂无病历记录</h3><p>通过拍照识别或手动添加</p><button class="btn" onclick="App.goTo('upload')">📷 立即上传</button></div>`;
      return;
    }
    const recTitle = (elder ? elder.name + ' - 病历' : '全部病历');
    $main.innerHTML = makeSubNav(recTitle, 'records') + `
      <div class="search-bar" style="padding:12px 16px;"><div class="row" style="gap:8px;">
        <select id="elderFilter" onchange="App.filterRecords(this.value)" class="form-select" style="padding:8px;">
          <option value="">全部老人</option>
          ${data.elders.map(e => `<option value="${e.id}" ${e.id === currentElderId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
        </select>
      </div></div>
      ${records.map(r => {
        const el = data.elders.find(e => e.id === r.elderId);
        const abnormalCount = (r.metrics || []).filter(m => m.abnormal).length;
        return `
          <div class="med-card" onclick="App.viewRecordDirect('${r.id}')">
            <div class="med-head"><h4 class="med-name">${escapeHtml(r.diagnosis || r.type || '病历')}</h4><span class="med-time" style="font-size:11px;color:#666;">${escapeHtml(r.visitDate || '')}</span></div>
            <div class="med-detail" style="color:#666;">${escapeHtml(el ? el.name : '')} · ${escapeHtml(r.hospital || '-')} · ${escapeHtml(r.department || '-')}</div>
            ${abnormalCount > 0 ? `<div class="med-detail" style="color:#F44336;font-size:12px;margin-top:4px;">⚠️ ${abnormalCount} 项指标异常</div>` : ''}
            ${(r.metrics || []).slice(0, 2).map(m => `<span class="tag ${m.abnormal ? 'danger' : 'info'}">${escapeHtml(m.name)}: ${escapeHtml(m.value)}${escapeHtml(m.unit)}</span>`).join(' ')}
          </div>
        `;
      }).join('')}
      <div style="height:30px;"></div>
    `;
  }

  function filterRecords(id) {
    currentElderId = id || null;
    renderRecords();
  }

  // ============ 病历详情 ============
  function viewRecordDirect(recordId) {
    sessionStorage.setItem('lastRecordId', recordId);
    pageHistory.push({ page: currentPage, elderId: currentElderId });
    currentPage = 'record-detail';
    renderPage();
  }

  function renderRecordDetail() {
    const rec = DB.getRecord(sessionStorage.getItem('lastRecordId'));
    if (!rec) { $main.innerHTML = `<div class="empty-state"><h3>记录不存在</h3></div>`; return; }
    const elder = DB.getElder(rec.elderId);
    setTitle('病历详情');
    currentElderId = rec.elderId;

    const metricsHtml = (rec.metrics || []).length > 0 ? `
      <table class="metric-table">
        <thead><tr><th>项目</th><th>结果</th><th>参考范围</th></tr></thead>
        <tbody>${(rec.metrics || []).map(m => `<tr><td>${escapeHtml(m.name)}</td><td class="${m.abnormal ? 'abnormal' : ''}">${escapeHtml(m.value)}${escapeHtml(m.unit || '')} ${m.abnormal ? '↑' : ''}</td><td>${escapeHtml(m.ref || '-')}</td></tr>`).join('')}</tbody>
      </table>` : '<p style="color:#999;font-size:13px;">无检查指标</p>';

    const notesHtml = (rec.notes || []).length > 0 ?
      (rec.notes || []).map(n => `<div class="note-item"><strong>${escapeHtml(n.author)} · ${escapeHtml((n.createdAt || '').slice(0, 16))}</strong>${escapeHtml(n.text)}</div>`).join('')
      : '<p style="color:#999;font-size:13px;">暂无备注</p>';

    $main.innerHTML = makeSubNav('病历详情', 'record-detail') + `
      <div class="card">
        <h3 class="card-title">${escapeHtml(rec.diagnosis || rec.type || '病历')}</h3>
        <p style="color:#666;font-size:13px;margin:4px 0;">👤 ${escapeHtml(elder ? elder.name : '')}</p>
        <p style="color:#666;font-size:13px;margin:4px 0;">📅 ${escapeHtml(rec.visitDate || '-')}</p>
        <p style="color:#666;font-size:13px;margin:4px 0;">🏥 ${escapeHtml(rec.hospital || '-')} · ${escapeHtml(rec.department || '-')}</p>
        ${rec.chiefComplaint ? `<p style="margin:8px 0 0;"><strong style="color:#333;">主诉：</strong>${escapeHtml(rec.chiefComplaint)}</p>` : ''}
        ${rec.orders ? `<p style="margin:8px 0 0;"><strong style="color:#333;">医嘱：</strong>${escapeHtml(rec.orders)}</p>` : ''}
        <p style="margin:8px 0 0;font-size:11px;color:#aaa;">识别置信度: ${rec.confidence ? (rec.confidence * 100).toFixed(0) + '%' : '-'}</p>
      </div>
      <div class="card"><h3 class="card-title">检查指标</h3>${metricsHtml}</div>
      <div class="card">
        <h3 class="card-title">家庭成员备注</h3>${notesHtml}
        <div style="display:flex;gap:8px;margin-top:12px;">
          <input type="text" class="form-input" id="noteInput" placeholder="添加备注..." style="flex:1;">
          <button class="btn" style="padding:8px 16px;" onclick="App.addNoteToRecord('${rec.id}')">添加</button>
        </div>
      </div>
      ${rec.imageUrl ? `<div class="card"><h3 class="card-title">原始图片</h3><img src="${rec.imageUrl}" style="width:100%;border-radius:8px;"></div>` : ''}
      <div style="padding:16px;display:flex;gap:8px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.openRecordForm('${rec.id}')">✏️ 编辑</button>
        <button class="btn btn-danger outline" style="flex:1;" onclick="App.confirmDeleteRecord('${rec.id}')">删除</button>
      </div>
      <div style="height:30px;"></div>
    `;
  }

  function addNoteToRecord(recordId) {
    const input = document.getElementById('noteInput');
    if (!input.value.trim()) return;
    DB.addNote(recordId, input.value.trim());
    toast('备注已添加');
    renderPage();
  }

  // ============ 上传页面 ============
  function renderUpload() {
    setTitle('拍照 / 上传');
    const data = DB.getAll();
    if (data.elders.length === 0) {
      $main.innerHTML = `<div class="empty-state"><h3>请先添加老人档案</h3><p>上传的记录需要关联到老人档案</p><button class="btn" onclick="App.goTo('elders')">去添加</button></div>`;
      return;
    }
    $main.innerHTML = `
      <div class="upload-section">
        <div class="card" style="margin:0 0 14px;">
          <h3 class="card-title">选择上传类型</h3>
          <div class="row" style="gap:8px;flex-wrap:wrap;">
            <label class="type-card" style="flex:1;min-width:90px;padding:10px;border:2px solid #4CAF50;background:#E8F5E9;border-radius:8px;text-align:center;cursor:pointer;">
              <input type="radio" name="ocrType" value="record" checked style="display:none;">
              <div style="font-size:24px;">📋</div><div style="font-size:13px;margin-top:4px;">病历</div>
            </label>
            <label class="type-card" style="flex:1;min-width:90px;padding:10px;border:2px solid #E0E0E0;border-radius:8px;text-align:center;cursor:pointer;">
              <input type="radio" name="ocrType" value="medication" style="display:none;">
              <div style="font-size:24px;">💊</div><div style="font-size:13px;margin-top:4px;">药方</div>
            </label>
            <label class="type-card" style="flex:1;min-width:90px;padding:10px;border:2px solid #E0E0E0;border-radius:8px;text-align:center;cursor:pointer;">
              <input type="radio" name="ocrType" value="lab" style="display:none;">
              <div style="font-size:24px;">🧪</div><div style="font-size:13px;margin-top:4px;">检查</div>
            </label>
          </div>
        </div>
        <div class="card" style="margin:0 0 14px;">
          <h3 class="card-title">关联老人</h3>
          <select id="uploadElder" class="form-select">${data.elders.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (${e.age}岁)</option>`).join('')}</select>
        </div>
        <div class="upload-drop">
          <h3>📷 点击上传图片</h3>
          <p>支持病历、药方、检查报告单</p>
          <p>最多 9 张，单张不超过 20MB</p>
          <div class="upload-actions">
            <input type="file" id="fileInput" accept="image/*" multiple capture="environment" style="display:none;">
            <button class="btn btn-block" onclick="document.getElementById('fileInput').click()">📷 选择图片 / 拍照</button>
          </div>
          <div id="uploadPreview" class="upload-preview" style="margin-top:16px;"></div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-outline" style="flex:1;" onclick="App.openManualRecord()">✏️ 手动添加病历</button>
          <button class="btn btn-outline" style="flex:1;" onclick="App.openMedicationForm()">💊 手动添加用药</button>
        </div>
      </div>
      <div style="height:30px;"></div>
    `;
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.querySelectorAll('input[name="ocrType"]').forEach(r => {
      r.addEventListener('change', () => {
        document.querySelectorAll('.type-card').forEach(c => {
          const checked = c.querySelector('input').checked;
          c.style.borderColor = checked ? '#4CAF50' : '#E0E0E0';
          c.style.background = checked ? '#E8F5E9' : '#fff';
        });
      });
    });
  }

  let _pendingFiles = [];

  function handleFileUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    _pendingFiles = files.slice(0, 9);
    const preview = document.getElementById('uploadPreview');
    Promise.all(_pendingFiles.map(f => OCR.fileToBase64(f))).then(urls => {
      preview.innerHTML = urls.map(u => `<img src="${u}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;">`).join('');
      const btn = document.createElement('button');
      btn.className = 'btn btn-block';
      btn.id = 'startOcrBtn';
      btn.style.marginTop = '12px';
      btn.textContent = `开始识别 (${_pendingFiles.length}张)`;
      btn.addEventListener('click', startOcrProcess);
      preview.parentNode.insertBefore(btn, preview.nextSibling);
    });
  }

  function startOcrProcess() {
    const type = document.querySelector('input[name="ocrType"]:checked').value;
    const elderId = document.getElementById('uploadElder').value;
    showModal(`
      <div class="modal-head"><h3>OCR 智能识别</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="ocr-progress">
        <div class="spinner" id="ocrSpinner"></div>
        <p id="ocrText" style="font-size:14px;color:#666;margin:10px 0;">准备中...</p>
        <div class="progress-bar"><div id="ocrProgressBar" style="width:0%;height:100%;background:#4CAF50;transition:width 0.3s;"></div></div>
        <p id="ocrPercent" style="font-size:12px;color:#999;margin-top:8px;">0%</p>
      </div>
    `);
    OCR.recognize(_pendingFiles, {
      type, elderId,
      onProgress: p => {
        document.getElementById('ocrText').textContent = p.text;
        document.getElementById('ocrProgressBar').style.width = p.percent + '%';
        document.getElementById('ocrPercent').textContent = p.percent + '%';
      }
    }).then(result => {
      setTimeout(() => {
        if (type === 'medication') showMedicationConfirm(result);
        else showRecordConfirm(result, type);
      }, 300);
    }).catch(() => { closeModal(); toast('识别失败，请重试'); });
  }

  function showRecordConfirm(result, type) {
    const rec = result.record || {};
    const elderId = document.getElementById('uploadElder').value;
    showModal(`
      <div class="modal-head"><h3>识别结果 - 请确认</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">就诊日期</label><input type="date" class="form-input" id="f_visitDate" value="${rec.visitDate || DB.today()}"></div>
      <div class="form-group"><label class="form-label">医院/机构</label><input type="text" class="form-input" id="f_hospital" value="${escapeHtml(rec.hospital || '')}" placeholder="例如：市中心医院"></div>
      <div class="form-group"><label class="form-label">科室</label><input type="text" class="form-input" id="f_department" value="${escapeHtml(rec.department || '')}"></div>
      <div class="form-group"><label class="form-label">诊断</label><input type="text" class="form-input" id="f_diagnosis" value="${escapeHtml(rec.diagnosis || '')}"></div>
      <div class="form-group"><label class="form-label">主诉</label><textarea class="form-textarea" id="f_chief" rows="2">${escapeHtml(rec.chiefComplaint || '')}</textarea></div>
      <div class="form-group">
        <label class="form-label">检查指标</label>
        <div id="metricsContainer">${(rec.metrics || []).map((m, i) => metricRow(m, i)).join('')}</div>
        <button class="btn btn-outline" style="margin-top:8px;padding:6px 12px;font-size:12px;" onclick="App.addMetricRow()">+ 添加指标</button>
      </div>
      <div class="form-group"><label class="form-label">医嘱</label><textarea class="form-textarea" id="f_orders" rows="2">${escapeHtml(rec.orders || '')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveRecordFromOcr(${JSON.stringify(JSON.stringify({images:result.images,confidence:result.confidence,type:type,elderId:elderId}))})">保存记录</button>
      </div>
    `);
  }

  function metricRow(m) {
    m = m || { name: '', value: '', unit: '', ref: '', abnormal: false };
    return `
      <div class="metric-row" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 40px;gap:4px;margin-bottom:6px;">
        <input type="text" class="form-input" placeholder="项目" data-name="name" value="${escapeHtml(m.name)}" style="padding:6px;font-size:12px;">
        <input type="text" class="form-input" placeholder="数值" data-name="value" value="${escapeHtml(m.value)}" style="padding:6px;font-size:12px;">
        <input type="text" class="form-input" placeholder="单位" data-name="unit" value="${escapeHtml(m.unit)}" style="padding:6px;font-size:12px;">
        <input type="text" class="form-input" placeholder="参考" data-name="ref" value="${escapeHtml(m.ref)}" style="padding:6px;font-size:12px;">
        <label style="display:flex;align-items:center;justify-content:center;cursor:pointer;"><input type="checkbox" data-name="abnormal" ${m.abnormal ? 'checked' : ''}></label>
      </div>`;
  }

  function addMetricRow() {
    const c = document.getElementById('metricsContainer');
    if (c) c.insertAdjacentHTML('beforeend', metricRow({}));
  }

  function saveRecordFromOcr(jsonStr) {
    let context;
    try { context = JSON.parse(jsonStr); } catch { closeModal(); toast('参数错误'); return; }
    const metrics = [];
    document.querySelectorAll('#metricsContainer .metric-row').forEach(row => {
      const name = row.querySelector('[data-name="name"]').value.trim();
      const value = row.querySelector('[data-name="value"]').value.trim();
      if (!name && !value) return;
      metrics.push({ name, value, unit: row.querySelector('[data-name="unit"]').value, ref: row.querySelector('[data-name="ref"]').value, abnormal: row.querySelector('[data-name="abnormal"]').checked });
    });
    const saved = DB.addRecord({
      elderId: context.elderId, type: context.type,
      visitDate: document.getElementById('f_visitDate').value,
      hospital: document.getElementById('f_hospital').value,
      department: document.getElementById('f_department').value,
      diagnosis: document.getElementById('f_diagnosis').value,
      chiefComplaint: document.getElementById('f_chief').value,
      orders: document.getElementById('f_orders').value,
      metrics, imageUrl: (context.images && context.images[0]) || null,
      confidence: context.confidence, notes: []
    });
    closeModal();
    toast('病历保存成功 ✓');
    _pendingFiles = [];
    sessionStorage.setItem('lastRecordId', saved.id);
    currentElderId = saved.elderId;
    pageHistory.push({ page: 'home', elderId: null });
    currentPage = 'record-detail';
    renderPage();
  }

  function showMedicationConfirm(result) {
    const meds = result.medications || [];
    const elderId = document.getElementById('uploadElder').value;
    showModal(`
      <div class="modal-head"><h3>识别到 ${meds.length} 种用药</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <p style="font-size:13px;color:#666;margin:0 0 12px;">请核对后保存，可点击每行进行编辑</p>
      <div id="medsConfirmList">
        ${meds.map(m => `
          <div class="med-card" style="margin:8px 0;box-shadow:none;background:#F9F9F9;">
            <input type="text" class="form-input" data-m-name value="${escapeHtml(m.name)}" style="margin-bottom:6px;font-weight:600;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
              <input type="text" class="form-input" data-m-dose placeholder="剂量" value="${escapeHtml(m.dose)}" style="padding:6px;font-size:12px;">
              <input type="text" class="form-input" data-m-freq placeholder="频次" value="${escapeHtml(m.frequency)}" style="padding:6px;font-size:12px;">
            </div>
            <input type="text" class="form-input" data-m-times placeholder="时间(如: 08:00,20:00)" value="${escapeHtml((m.times || []).join(','))}" style="padding:6px;font-size:12px;">
            <textarea class="form-textarea" data-m-note placeholder="备注" rows="1" style="margin-top:6px;padding:6px;font-size:12px;">${escapeHtml(m.note || '')}</textarea>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
              <input type="date" class="form-input" data-m-start value="${DB.today()}" style="padding:6px;font-size:12px;">
              <input type="date" class="form-input" data-m-end value="${addMonths(DB.today(), 1)}" style="padding:6px;font-size:12px;">
            </div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveMedicationsFromOcr('${elderId}')">全部保存</button>
      </div>
    `);
  }

  function saveMedicationsFromOcr(elderId) {
    const rows = document.querySelectorAll('#medsConfirmList .med-card');
    let saved = 0;
    rows.forEach(row => {
      const name = row.querySelector('[data-m-name]').value.trim();
      if (!name) return;
      const timesStr = row.querySelector('[data-m-times]').value.trim();
      DB.addMedication({
        elderId, name,
        dose: row.querySelector('[data-m-dose]').value,
        frequency: row.querySelector('[data-m-freq]').value,
        times: timesStr ? timesStr.split(/[,,、]/).map(s => s.trim()).filter(Boolean) : ['08:00'],
        startDate: row.querySelector('[data-m-start]').value,
        endDate: row.querySelector('[data-m-end]').value,
        note: row.querySelector('[data-m-note]').value,
        reminder: true, status: 'active'
      });
      saved++;
    });
    closeModal();
    toast(`已保存 ${saved} 种用药 ✓`);
    goTo('meds', { replaceRoot: true });
  }

  function addMonths(dateStr, n) {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  // ============ 用药列表 ============
  function renderMeds() {
    setTitle('用药清单');
    const data = DB.getAll();
    $fabQuick.style.display = 'flex';
    $fabQuick.onclick = () => openMedicationForm();
    if (data.medications.length === 0) {
      $main.innerHTML = `<div class="empty-state"><h3>暂无用药记录</h3><p>点击右下角 + 按钮添加</p></div>`;
      return;
    }
    const today = DB.today();
    const conflicts = detectConflicts(data.medications);
    $main.innerHTML = `
      ${conflicts.length > 0 ? `
        <div class="card" style="background:#FFF3E0;border-left:4px solid #FF9800;">
          <h3 class="card-title" style="color:#E65100;">⚠️ 潜在用药提醒</h3>
          ${conflicts.map(c => `<p style="font-size:13px;margin:4px 0;color:#E65100;">${escapeHtml(c)}</p>`).join('')}
          <p style="font-size:11px;color:#999;margin-top:8px;">提示：请与医生确认，本提示不替代专业医疗建议</p>
        </div>` : ''}
      ${data.medications.map(m => {
        const elder = data.elders.find(e => e.id === m.elderId);
        const ended = m.endDate && m.endDate < today;
        return `
          <div class="med-card">
            <div class="med-head"><h4 class="med-name">${escapeHtml(m.name)}</h4><span class="med-status ${ended ? 'ended' : 'active'}">${ended ? '已结束' : '进行中'}</span></div>
            <div class="med-detail">👤 ${escapeHtml(elder ? elder.name : '未知')}</div>
            <div class="med-detail">💊 ${escapeHtml(m.dose || '-')} · ${escapeHtml(m.frequency || '-')}</div>
            <div class="med-detail">📅 ${escapeHtml(m.startDate || '-')} 至 ${escapeHtml(m.endDate || '长期')}</div>
            ${m.note ? `<div class="med-detail">💡 ${escapeHtml(m.note)}</div>` : ''}
            <div class="med-times">${(m.times || []).map(t => `<span class="med-time">⏰ ${escapeHtml(t)}</span>`).join('')}</div>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="btn btn-outline" style="flex:1;padding:6px 12px;font-size:12px;" onclick="App.openMedicationForm('${m.id}')">编辑</button>
              <button class="btn btn-danger outline" style="flex:1;padding:6px 12px;font-size:12px;" onclick="App.confirmDeleteMed('${m.id}')">删除</button>
            </div>
          </div>`;
      }).join('')}
      <div style="height:30px;"></div>
    `;
  }

  function detectConflicts(meds) {
    const issues = [];
    const byElder = {};
    meds.forEach(m => { if (!byElder[m.elderId]) byElder[m.elderId] = []; byElder[m.elderId].push(m); });
    const data = DB.getAll();
    Object.keys(byElder).forEach(eid => {
      const elder = data.elders.find(e => e.id === eid);
      const list = byElder[eid];
      const seen = {};
      list.forEach(m => { seen[m.name] = (seen[m.name] || 0) + 1; });
      Object.keys(seen).forEach(n => { if (seen[n] > 1) issues.push(`${elder ? elder.name : ''} 有 ${seen[n]} 条 "${n}"，可能重复开具`); });
      if (elder && elder.allergies) {
        const allergies = elder.allergies.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
        list.forEach(m => {
          allergies.forEach(a => {
            if (a.length >= 2 && m.name.includes(a)) issues.push(`⚠️ ${elder.name} 对 ${a} 过敏，但药方包含 "${m.name}"，请特别注意`);
          });
        });
      }
    });
    return issues;
  }

  // ============ 提醒页 ============
  function renderReminders() {
    setTitle('服药提醒');
    const data = DB.getAll();
    const today = DB.today();
    const activeMeds = data.medications.filter(m => (!m.endDate || m.endDate >= today) && m.status === 'active');
    const todayReminders = [];
    activeMeds.forEach(m => {
      (m.times || []).forEach(t => {
        const elder = data.elders.find(e => e.id === m.elderId);
        todayReminders.push({ med: m, time: t, elder, key: m.id + '_' + t });
      });
    });
    todayReminders.sort((a, b) => a.time.localeCompare(b.time));
    const loggedKeys = (sessionStorage.getItem('loggedMeds') || '').split('|').filter(Boolean);

    $main.innerHTML = `
      <div class="card" style="background:linear-gradient(135deg,#4CAF50,#66BB6A);color:#fff;">
        <h3 class="card-title" style="color:#fff;">今日 ${today}</h3>
        <p style="margin:0;font-size:13px;opacity:0.95;">共 ${todayReminders.length} 次服药提醒</p>
        <p style="margin:6px 0 0;font-size:11px;opacity:0.85;">提示：开启通知可在服药时间推送提醒</p>
      </div>
      ${todayReminders.length === 0 ? `<div class="empty-state"><h3>暂无提醒</h3><p>请先添加用药计划</p></div>` : todayReminders.map(r => {
        const logged = loggedKeys.includes(r.key + '_' + today);
        return `
          <div class="reminder-item" style="${logged ? 'opacity:0.6;' : ''}">
            <div class="reminder-icon">${logged ? '✅' : '⏰'}</div>
            <div class="reminder-content">
              <h4 class="reminder-title">${escapeHtml(r.med.name)} <small style="font-size:12px;color:#999;font-weight:normal;">(${escapeHtml(r.elder ? r.elder.name : '')})</small></h4>
              <p class="reminder-time">时间: ${escapeHtml(r.time)} · 剂量: ${escapeHtml(r.med.dose || '-')}</p>
            </div>
            <button class="btn ${logged ? 'btn-secondary' : ''}" style="padding:6px 12px;font-size:12px;" onclick="App.markMedTaken('${r.key}', '${r.time}', ${logged})">${logged ? '已服用' : '标记已服'}</button>
          </div>`;
      }).join('')}
      <div class="card">
        <h3 class="card-title">通知设置</h3>
        <div class="row-between" style="margin:10px 0;">
          <div><strong>启用每日提醒</strong><p style="margin:4px 0 0;font-size:12px;color:#999;">在每个用药时间推送通知</p></div>
          <label class="switch"><input type="checkbox" ${data.settings.reminderEnabled !== false ? 'checked' : ''} onchange="App.toggleReminder(this.checked)"><span class="slider"></span></label>
        </div>
        <button class="btn btn-outline btn-block" style="margin-top:8px;" onclick="App.requestNotification()">请求浏览器通知权限</button>
      </div>
      <div style="height:30px;"></div>
    `;
  }

  function markMedTaken(key, time, wasLogged) {
    const today = DB.today();
    let keys = (sessionStorage.getItem('loggedMeds') || '').split('|').filter(Boolean);
    if (wasLogged) {
      keys = keys.filter(k => k !== key + '_' + today);
      toast('已取消标记');
    } else {
      keys.push(key + '_' + today);
      toast('已标记为已服用 ✓');
    }
    sessionStorage.setItem('loggedMeds', keys.join('|'));
    renderPage();
  }

  function toggleReminder(on) {
    const data = DB.getAll();
    data.settings.reminderEnabled = on;
    DB.save(data);
    toast(on ? '提醒已开启' : '提醒已关闭');
  }

  function requestNotification() {
    if (!('Notification' in window)) { toast('此浏览器不支持通知'); return; }
    Notification.requestPermission().then(p => {
      if (p === 'granted') { toast('通知权限已开启 ✓'); new Notification('家庭健康助手', { body: '已开启服药提醒通知' }); }
      else toast('未授权通知');
    });
  }

  // ============ 搜索 ============
  function renderSearch() {
    setTitle('搜索');
    const keyword = (sessionStorage.getItem('searchKw') || '').trim();
    const result = keyword ? DB.search(keyword) : { elders: [], records: [], medications: [] };

    $main.innerHTML = `
      <div class="search-bar" style="position:sticky;top:0;z-index:2;background:#fff;padding:12px 16px;">
        <input type="search" class="search-input" id="searchInput" value="${escapeHtml(keyword)}" placeholder="搜索 药名/诊断/时间...">
      </div>
      ${!keyword ? `<div class="empty-state"><h3>输入关键词开始搜索</h3><p>支持搜索药品名、诊断、检查项目等</p></div>` : `
        ${result.medications.length > 0 ? `
          <div class="card"><h3 class="card-title">用药匹配 (${result.medications.length})</h3>
            ${result.medications.map(m => `
              <div class="med-card" style="box-shadow:none;background:#F9F9F9;margin:8px 0;" onclick="App.goTo('meds')">
                <h4 class="med-name" style="margin:0 0 4px;">${escapeHtml(m.name)}</h4>
                <div class="med-detail">${escapeHtml(m.dose)} · ${escapeHtml(m.frequency)}</div>
              </div>`).join('')}
          </div>` : ''}
        ${result.records.length > 0 ? `
          <div class="card"><h3 class="card-title">病历匹配 (${result.records.length})</h3>
            ${result.records.map(r => `
              <div class="med-card" style="box-shadow:none;background:#F9F9F9;margin:8px 0;" onclick="App.viewRecordDirect('${r.id}')">
                <h4 class="med-name" style="margin:0 0 4px;">${escapeHtml(r.diagnosis || r.type)}</h4>
                <div class="med-detail">${escapeHtml(r.visitDate || '')} · ${escapeHtml(r.hospital || '-')}</div>
              </div>`).join('')}
          </div>` : ''}
        ${result.elders.length > 0 ? `
          <div class="card"><h3 class="card-title">老人匹配 (${result.elders.length})</h3>
            ${result.elders.map(e => `
              <div class="med-card" style="box-shadow:none;background:#F9F9F9;margin:8px 0;" onclick="App.goTo('elder-detail',{elderId:'${e.id}'})">
                <h4 class="med-name" style="margin:0 0 4px;">${escapeHtml(e.name)}</h4>
                <div class="med-detail">${e.age}岁 · ${escapeHtml(e.conditions || '-')}</div>
              </div>`).join('')}
          </div>` : ''}
        ${(result.elders.length + result.records.length + result.medications.length) === 0 ? `
          <div class="empty-state"><h3>未找到相关结果</h3><p>尝试更换关键词</p></div>` : ''}
      `}
      <div style="height:30px;"></div>
    `;

    const input = document.getElementById('searchInput');
    if (input) {
      input.focus();
      let t;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          sessionStorage.setItem('searchKw', input.value);
          renderPage();
        }, 300);
      });
    }
  }

  function openSearchModal() {
    sessionStorage.removeItem('searchKw');
    goTo('search', { replaceRoot: false });
  }

  // ============ 设置 ============
  function renderSettings() {
    setTitle('设置');
    const data = DB.getAll();
    const me = data.family.members.find(m => m.role === 'admin') || data.family.members[0] || {};
    const totalRecords = data.records.length;
    const totalMeds = data.medications.length;
    const today = DB.today();
    const activeMeds = data.medications.filter(m => !m.endDate || m.endDate >= today).length;
    $main.innerHTML = makeSubNav('设置', 'settings') + `
      <!-- 个人中心 -->
      <div class="card" style="border-left:3px solid #4CAF50;">
        <h3 class="card-title">👤 个人中心</h3>
        <div style="display:flex;align-items:center;gap:14px;padding:8px 0;border-bottom:1px solid #F0F0F0;">
          <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#4CAF50,#81C784);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;font-weight:bold;">${escapeHtml((me.name || '我').charAt(0))}</div>
          <div style="flex:1;">
            <div style="font-size:16px;font-weight:600;color:#333;">${escapeHtml(me.name || '我')}</div>
            <div style="font-size:12px;color:#888;margin-top:2px;">📞 ${escapeHtml(me.phone || '未填写')}</div>
            <span class="tag ${me.role === 'admin' ? 'danger' : 'info'}" style="margin-top:4px;display:inline-block;">${me.role === 'admin' ? '主管理员' : (me.role === 'member' ? '家庭成员' : '只读')}</span>
          </div>
          <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="App.openProfileForm()">✏️ 编辑</button>
        </div>
      </div>

      <!-- 账号信息 -->
      <div class="card">
        <h3 class="card-title">📊 账号数据概览</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;">
          <div style="background:#F5F5F5;padding:10px 6px;border-radius:8px;">
            <div style="font-size:20px;font-weight:bold;color:#4CAF50;">${data.elders.length}</div>
            <div style="font-size:11px;color:#888;">老人档案</div>
          </div>
          <div style="background:#F5F5F5;padding:10px 6px;border-radius:8px;">
            <div style="font-size:20px;font-weight:bold;color:#2196F3;">${totalRecords}</div>
            <div style="font-size:11px;color:#888;">病历记录</div>
          </div>
          <div style="background:#F5F5F5;padding:10px 6px;border-radius:8px;">
            <div style="font-size:20px;font-weight:bold;color:#FF9800;">${activeMeds}</div>
            <div style="font-size:11px;color:#888;">在用药物</div>
          </div>
        </div>
        <div style="margin-top:10px;padding:8px 10px;background:#FFF8E1;border-radius:6px;font-size:12px;color:#888;">
          📦 本地存储已用约 ${Math.round(JSON.stringify(data).length / 1024)} KB · 共 ${totalMeds} 条用药记录
        </div>
      </div>

      <!-- 显示 -->
      <div class="card">
        <h3 class="card-title">🖥️ 显示</h3>
        <div class="row-between" style="margin:10px 0;">
          <div><strong>适老化大字体</strong><p style="margin:4px 0 0;font-size:12px;color:#999;">增大主界面文字</p></div>
          <label class="switch"><input type="checkbox" ${data.settings.fontSize === 'large' ? 'checked' : ''} onchange="App.toggleFontSize(this.checked)"><span class="slider"></span></label>
        </div>
      </div>
      <!-- 通知 -->
      <div class="card">
        <h3 class="card-title">🔔 通知</h3>
        <div class="row-between" style="margin:10px 0;">
          <div><strong>服药提醒</strong><p style="margin:4px 0 0;font-size:12px;color:#999;">每日提醒用药</p></div>
          <label class="switch"><input type="checkbox" ${data.settings.reminderEnabled !== false ? 'checked' : ''} onchange="App.toggleReminder(this.checked)"><span class="slider"></span></label>
        </div>
      </div>
      <!-- 数据管理 -->
      <div class="card">
        <h3 class="card-title">💾 数据管理</h3>
        <button class="btn btn-outline btn-block" style="margin:8px 0;" onclick="App.openExportModal()">📄 导出健康报告</button>
        <button class="btn btn-outline btn-block" style="margin:8px 0;" onclick="App.exportAllJson()">💾 导出全部数据 (JSON)</button>
        <button class="btn btn-danger outline btn-block" style="margin:8px 0;" onclick="App.confirmReset()">⚠️ 清空全部数据</button>
      </div>
      <!-- 关于 -->
      <div class="card">
        <h3 class="card-title">ℹ️ 关于</h3>
        <p style="font-size:13px;color:#666;line-height:1.6;">家庭健康助手 V1.0<br>帮助您集中管理老人病历与用药记录，支持拍照识别，自动整理分析。<br><br>隐私声明：所有数据保存在您的本地浏览器中，不会上传到任何服务器。</p>
      </div>
      <div style="height:30px;"></div>
    `;
  }

  function openProfileForm() {
    const data = DB.getAll();
    const me = data.family.members.find(m => m.role === 'admin') || data.family.members[0] || {};
    showModal(`
      <div class="modal-head"><h3>👤 编辑个人资料</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">姓名 *</label><input type="text" class="form-input" id="pf_name" value="${escapeHtml(me.name || '')}" placeholder="您的姓名"></div>
      <div class="form-group"><label class="form-label">手机号</label><input type="tel" class="form-input" id="pf_phone" value="${escapeHtml(me.phone || '')}" placeholder="可选，方便家人联系"></div>
      <div class="form-group"><label class="form-label">身份角色</label>
        <select class="form-select" id="pf_role"><option value="admin" ${me.role === 'admin' ? 'selected' : ''}>主管理员（可邀请成员）</option><option value="member" ${me.role === 'member' ? 'selected' : ''}>家庭成员</option><option value="readonly" ${me.role === 'readonly' ? 'selected' : ''}>只读成员</option></select>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveProfile()">保存</button>
      </div>
    `);
  }

  function saveProfile() {
    const name = document.getElementById('pf_name').value.trim();
    if (!name) { toast('请填写姓名'); return; }
    const phone = document.getElementById('pf_phone').value.trim();
    const role = document.getElementById('pf_role').value;
    const data = DB.getAll();
    const me = data.family.members.find(m => m.role === 'admin') || data.family.members[0];
    if (me) {
      me.name = name;
      me.phone = phone;
      me.role = role;
    }
    DB.save(data);
    closeModal(); toast('个人资料已保存'); renderPage();
  }

  function toggleFontSize(on) {
    const data = DB.getAll();
    data.settings.fontSize = on ? 'large' : 'normal';
    DB.save(data);
    document.documentElement.style.fontSize = on ? '18px' : '16px';
    toast('字体大小已调整');
  }

  function confirmReset() {
    if (!confirm('确定要清空所有数据吗？此操作不可撤销')) return;
    DB.reset();
    toast('已重置，将重新加载示例数据');
    goTo('home', { replaceRoot: true });
  }

  // ============ 家庭管理 ============
  function renderFamily() {
    setTitle('家庭成员');
    const data = DB.getAll();
    $fabQuick.style.display = 'flex';
    $fabQuick.onclick = () => openMemberForm();
    $main.innerHTML = makeSubNav('家庭成员', 'family') + `
      <div class="card" style="background:linear-gradient(135deg,#2196F3,#42A5F5);color:#fff;">
        <h3 class="card-title" style="color:#fff;">🏠 ${escapeHtml(data.family.name)}</h3>
        <p style="font-size:13px;opacity:0.9;margin:4px 0;">共 ${data.family.members.length} 位成员 · ${data.elders.length} 位老人档案</p>
        <p style="font-size:12px;opacity:0.85;margin-top:8px;">主管理员可邀请家人共同查看病历与用药提醒</p>
      </div>
      ${data.family.members.map(m => `
        <div class="med-card">
          <div class="med-head"><h4 class="med-name">${escapeHtml(m.name)}</h4><span class="tag ${m.role === 'admin' ? 'danger' : 'info'}">${m.role === 'admin' ? '主管理员' : (m.role === 'member' ? '家庭成员' : '只读')}</span></div>
          ${m.phone ? `<div class="med-detail">📞 ${escapeHtml(m.phone)}</div>` : ''}
        </div>
      `).join('')}
      <div style="height:30px;"></div>
    `;
  }

  function openMemberForm() {
    showModal(`
      <div class="modal-head"><h3>添加家庭成员</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">姓名</label><input type="text" class="form-input" id="m_name" placeholder="例如：张阿姨"></div>
      <div class="form-group"><label class="form-label">手机号</label><input type="tel" class="form-input" id="m_phone" placeholder="可选"></div>
      <div class="form-group"><label class="form-label">角色</label>
        <select class="form-select" id="m_role"><option value="member">家庭成员（可编辑）</option><option value="readonly">只读成员</option></select>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveMember()">添加</button>
      </div>
    `);
  }

  function saveMember() {
    const name = document.getElementById('m_name').value.trim();
    if (!name) { toast('请填写姓名'); return; }
    DB.addMember({ name, phone: document.getElementById('m_phone').value, role: document.getElementById('m_role').value });
    closeModal(); toast('添加成功'); renderPage();
  }

  // ============ 老人表单 ============
  function openElderForm(elderId) {
    const elder = elderId ? DB.getElder(elderId) : null;
    showModal(`
      <div class="modal-head"><h3>${elder ? '编辑' : '添加'}老人档案</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">姓名 *</label><input type="text" class="form-input" id="e_name" value="${escapeHtml(elder?.name || '')}" placeholder="例如：张爷爷"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">年龄</label><input type="number" class="form-input" id="e_age" value="${elder?.age || ''}" placeholder="70"></div>
        <div class="form-group"><label class="form-label">性别</label><select class="form-select" id="e_gender"><option value="男" ${elder?.gender === '男' ? 'selected' : ''}>男</option><option value="女" ${elder?.gender === '女' ? 'selected' : ''}>女</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">血型</label><input type="text" class="form-input" id="e_blood" value="${escapeHtml(elder?.bloodType || '')}" placeholder="例如：A型"></div>
      <div class="form-group"><label class="form-label">过敏史</label><input type="text" class="form-input" id="e_allergy" value="${escapeHtml(elder?.allergies || '')}" placeholder="例如：青霉素、海鲜"></div>
      <div class="form-group"><label class="form-label">基础疾病</label><input type="text" class="form-input" id="e_conditions" value="${escapeHtml(elder?.conditions || '')}" placeholder="例如：高血压、糖尿病"></div>
      <div class="form-group"><label class="form-label">联系电话</label><input type="tel" class="form-input" id="e_phone" value="${escapeHtml(elder?.phone || '')}"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveElder('${elderId || ''}')">保存</button>
      </div>
    `);
  }

  function saveElder(id) {
    const name = document.getElementById('e_name').value.trim();
    if (!name) { toast('请填写姓名'); return; }
    const payload = {
      name, age: parseInt(document.getElementById('e_age').value) || 0,
      gender: document.getElementById('e_gender').value,
      bloodType: document.getElementById('e_blood').value.trim(),
      allergies: document.getElementById('e_allergy').value.trim(),
      conditions: document.getElementById('e_conditions').value.trim(),
      phone: document.getElementById('e_phone').value.trim(),
      avatar: name.charAt(0)
    };
    if (id) DB.updateElder(id, payload);
    else DB.addElder(payload);
    closeModal(); toast('保存成功');
    if (id && currentPage === 'elder-detail') renderPage();
    else renderPage();
  }

  function confirmDeleteElder(id) {
    if (!confirm('删除此老人档案将同时删除其病历和用药记录，确定删除？')) return;
    DB.deleteElder(id);
    toast('已删除');
    goTo('elders', { replaceRoot: true });
  }

  // ============ 病历表单 ============
  function openManualRecord() {
    const data = DB.getAll();
    if (data.elders.length === 0) { toast('请先添加老人档案'); goTo('elders'); return; }
    openRecordForm(null);
  }
  function openAddRecord(elderId) { openRecordForm(null, elderId); }

  function openRecordForm(recordId, preElderId) {
    const rec = recordId ? DB.getRecord(recordId) : null;
    const elderId = rec ? rec.elderId : (preElderId || currentElderId || DB.getAll().elders[0]?.id);
    const data = DB.getAll();
    const metrics = (rec?.metrics || []).map((m, i) => metricRow(m, i)).join('');
    showModal(`
      <div class="modal-head"><h3>${rec ? '编辑' : '添加'}病历记录</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">老人</label>
        <select class="form-select" id="r_elder">
          ${data.elders.map(e => `<option value="${e.id}" ${e.id === elderId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">就诊日期</label><input type="date" class="form-input" id="r_visitDate" value="${rec?.visitDate || DB.today()}"></div>
      <div class="form-group"><label class="form-label">医院</label><input type="text" class="form-input" id="r_hospital" value="${escapeHtml(rec?.hospital || '')}"></div>
      <div class="form-group"><label class="form-label">科室</label><input type="text" class="form-input" id="r_department" value="${escapeHtml(rec?.department || '')}"></div>
      <div class="form-group"><label class="form-label">诊断</label><input type="text" class="form-input" id="r_diagnosis" value="${escapeHtml(rec?.diagnosis || '')}" placeholder="例如：高血压3级"></div>
      <div class="form-group"><label class="form-label">主诉</label><textarea class="form-textarea" id="r_chief" rows="2">${escapeHtml(rec?.chiefComplaint || '')}</textarea></div>
      <div class="form-group">
        <label class="form-label">检查指标</label>
        <div id="r_metricsContainer">${metrics || metricRow({})}</div>
        <button class="btn btn-outline" style="margin-top:8px;padding:6px 12px;font-size:12px;" onclick="App.addMetricRow()">+ 添加指标</button>
      </div>
      <div class="form-group"><label class="form-label">医嘱</label><textarea class="form-textarea" id="r_orders" rows="2">${escapeHtml(rec?.orders || '')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveRecord('${recordId || ''}')">保存</button>
      </div>
    `);
  }

  function saveRecord(id) {
    const diagnosis = document.getElementById('r_diagnosis').value.trim();
    if (!diagnosis) { toast('请填写诊断'); return; }
    const metrics = [];
    document.querySelectorAll('#r_metricsContainer .metric-row').forEach(row => {
      const name = row.querySelector('[data-name="name"]').value.trim();
      const value = row.querySelector('[data-name="value"]').value.trim();
      if (!name && !value) return;
      metrics.push({ name, value, unit: row.querySelector('[data-name="unit"]').value, ref: row.querySelector('[data-name="ref"]').value, abnormal: row.querySelector('[data-name="abnormal"]').checked });
    });
    const payload = {
      elderId: document.getElementById('r_elder').value, type: '病历',
      visitDate: document.getElementById('r_visitDate').value,
      hospital: document.getElementById('r_hospital').value,
      department: document.getElementById('r_department').value,
      diagnosis, chiefComplaint: document.getElementById('r_chief').value,
      orders: document.getElementById('r_orders').value, metrics
    };
    if (id) DB.updateRecord(id, payload);
    else DB.addRecord(payload);
    closeModal(); toast('保存成功'); renderPage();
  }

  function confirmDeleteRecord(id) {
    if (!confirm('确定删除此病历？')) return;
    DB.deleteRecord(id);
    toast('已删除');
    goTo('records', { replaceRoot: true });
  }

  // ============ 用药表单 ============
  function openMedicationForm(medId) {
    const med = medId ? DB.getAll().medications.find(m => m.id === medId) : null;
    const data = DB.getAll();
    if (data.elders.length === 0) { toast('请先添加老人档案'); goTo('elders'); return; }
    showModal(`
      <div class="modal-head"><h3>${med ? '编辑' : '添加'}用药</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <div class="form-group"><label class="form-label">老人</label>
        <select class="form-select" id="med_elder">${data.elders.map(e => `<option value="${e.id}" ${med && e.id === med.elderId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">药品名称 *</label><input type="text" class="form-input" id="med_name" value="${escapeHtml(med?.name || '')}" placeholder="例如：苯磺酸氨氯地平片"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">每次剂量</label><input type="text" class="form-input" id="med_dose" value="${escapeHtml(med?.dose || '')}" placeholder="例如：5mg"></div>
        <div class="form-group"><label class="form-label">频次</label><input type="text" class="form-input" id="med_freq" value="${escapeHtml(med?.frequency || '')}" placeholder="例如：每日1次"></div>
      </div>
      <div class="form-group"><label class="form-label">服用时间（逗号分隔）</label><input type="text" class="form-input" id="med_times" value="${escapeHtml((med?.times || []).join(','))}" placeholder="例如：08:00,20:00"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">开始日期</label><input type="date" class="form-input" id="med_start" value="${med?.startDate || DB.today()}"></div>
        <div class="form-group"><label class="form-label">结束日期</label><input type="date" class="form-input" id="med_end" value="${med?.endDate || ''}"></div>
      </div>
      <div class="form-group"><label class="form-label">备注</label><textarea class="form-textarea" id="med_note" rows="2">${escapeHtml(med?.note || '')}</textarea></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.saveMedication('${medId || ''}')">保存</button>
      </div>
    `);
  }

  function saveMedication(id) {
    const name = document.getElementById('med_name').value.trim();
    if (!name) { toast('请填写药品名称'); return; }
    const timesStr = document.getElementById('med_times').value.trim();
    const payload = {
      elderId: document.getElementById('med_elder').value,
      name, dose: document.getElementById('med_dose').value,
      frequency: document.getElementById('med_freq').value,
      times: timesStr ? timesStr.split(/[,,、]/).map(s => s.trim()).filter(Boolean) : ['08:00'],
      startDate: document.getElementById('med_start').value,
      endDate: document.getElementById('med_end').value,
      note: document.getElementById('med_note').value,
      reminder: true, status: 'active'
    };
    if (id) DB.updateMedication(id, payload);
    else DB.addMedication(payload);
    closeModal(); toast('保存成功'); renderPage();
  }

  function confirmDeleteMed(id) {
    if (!confirm('确定删除此用药记录？')) return;
    DB.deleteMedication(id);
    toast('已删除'); renderPage();
  }

  // ============ 导出报告 ============
  function openExportModal() {
    const data = DB.getAll();
    if (data.elders.length === 0) { toast('暂无老人数据可导出'); return; }
    showModal(`
      <div class="modal-head"><h3>导出健康报告</h3><button class="modal-close" onclick="App.closeModal()">×</button></div>
      <p style="font-size:13px;color:#666;margin:0 0 12px;">选择老人，生成近期健康小结（文本报告），可就诊时供医生参考</p>
      <div class="form-group"><label class="form-label">选择老人</label>
        <select class="form-select" id="ex_elder">${data.elders.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}</select>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;" onclick="App.closeModal()">取消</button>
        <button class="btn" style="flex:1;" onclick="App.exportReport()">生成报告</button>
      </div>
    `);
  }

  function exportReport() {
    const elderId = document.getElementById('ex_elder').value;
    const elder = DB.getElder(elderId);
    if (!elder) { toast('未找到老人'); return; }
    const records = DB.getRecordsByElder(elderId);
    const meds = DB.getMedicationsByElder(elderId);
    const today = DB.today();
    let content = `========================================\n  家庭健康助手 - ${elder.name} 健康小结\n  生成日期：${today}\n========================================\n\n`;
    content += `【个人信息】\n  姓名：${elder.name}\n  性别/年龄：${elder.gender || ''} ${elder.age}岁\n  血型：${elder.bloodType || '-'}\n  过敏史：${elder.allergies || '无'}\n  基础疾病：${elder.conditions || '无'}\n  联系电话：${elder.phone || '-'}\n\n`;
    content += `【就诊记录】\n`;
    if (records.length === 0) content += `  暂无病历记录\n`;
    else records.forEach((r, i) => {
      content += `\n  ${i + 1}. [${r.visitDate || '-'}] ${r.diagnosis || r.type || '病历'}\n     医院：${r.hospital || '-'}${r.department ? ' / ' + r.department : ''}\n`;
      if (r.chiefComplaint) content += `     主诉：${r.chiefComplaint}\n`;
      if (r.metrics && r.metrics.length) {
        content += `     检查指标：\n`;
        r.metrics.forEach(m => { content += `       · ${m.name}: ${m.value}${m.unit || ''} (参考: ${m.ref || '-'})${m.abnormal ? ' ⚠️异常' : ''}\n`; });
      }
      if (r.orders) content += `     医嘱：${r.orders}\n`;
    });
    content += `\n【当前用药清单】\n`;
    if (meds.length === 0) content += `  暂无用药记录\n`;
    else meds.forEach((m, i) => {
      if (m.endDate && m.endDate < today) return;
      content += `\n  ${i + 1}. ${m.name}\n     剂量/频次：${m.dose || '-'} ${m.frequency || '-'}\n     服用时间：${(m.times || []).join('、')}\n     疗程：${m.startDate || '-'} 至 ${m.endDate || '长期'}\n`;
      if (m.note) content += `     备注：${m.note}\n`;
    });
    content += `\n========================================\n本报告由家庭健康助手生成，仅供参考，具体诊断请遵医嘱。\n`;

    closeModal();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${elder.name}_健康小结_${today}.txt`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    toast('报告已生成');
  }

  function exportAllJson() {
    if (!confirm('将导出全部数据为 JSON 文件，继续？')) return;
    const data = DB.getAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `家庭健康助手_全部数据_${DB.today()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    toast('导出成功');
  }

  // ============ 底部 Tab 绑定 ============
  function initTabs() {
    // Tab 导航
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const p = tab.dataset.page;
        if (!p) return;
        goTo(p, { replaceRoot: true });
      });
    });
    // 设置按钮
    $btnSettings.addEventListener('click', () => {
      goTo('settings');
    });
    // 字体大小
    if (DB.getAll().settings.fontSize === 'large') document.documentElement.style.fontSize = '18px';
  }

  // ============ 定时提醒检查（简单版） ============
  function scheduleReminderCheck() {
    setInterval(() => {
      const data = DB.getAll();
      if (!data.settings.reminderEnabled) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const now = new Date();
      const hm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
      const today = DB.today();
      const lastNotified = JSON.parse(sessionStorage.getItem('notified') || '[]');
      data.medications.forEach(m => {
        if (m.status !== 'active' && m.endDate && m.endDate < today) return;
        (m.times || []).forEach(t => {
          if (t === hm) {
            const key = m.id + '_' + t + '_' + today;
            if (!lastNotified.includes(key)) {
              const elder = data.elders.find(e => e.id === m.elderId);
              new Notification(`⏰ 服药提醒 - ${elder ? elder.name : ''}`, {
                body: `请服用：${m.name} ${m.dose || ''}`,
                icon: ''
              });
              lastNotified.push(key);
              sessionStorage.setItem('notified', JSON.stringify(lastNotified));
            }
          }
        });
      });
    }, 30000);
  }

  // ============ 公开 API ============
  window.App = {
    goTo, openElderForm, saveElder, confirmDeleteElder,
    openMedicationForm, saveMedication, confirmDeleteMed,
    openManualRecord, openAddRecord, openRecordForm, saveRecord, confirmDeleteRecord,
    addNoteToRecord, viewRecordDirect, filterRecords,
    markMedTaken, toggleReminder, requestNotification,
    openSearchModal, addMetricRow, saveRecordFromOcr, saveMedicationsFromOcr,
    openMemberForm, saveMember,
    openProfileForm, saveProfile,
    openExportModal, exportReport, exportAllJson, confirmReset, toggleFontSize,
    closeModal
  };

  // ============ 启动 ============
  function safeInit() {
    try { initTabs(); } catch(e) { console.error('initTabs错误:', e); }
    try { renderPage(); } catch(e) { console.error('renderPage错误:', e); }
    try { scheduleReminderCheck(); } catch(e) { console.error('提醒检查错误:', e); }
  }

  document.addEventListener('DOMContentLoaded', safeInit);

  // 兼容立即执行
  if (document.readyState !== 'loading') {
    safeInit();
  }
})();
