// ========== 页面渲染器 ==========

// ---------- 登录页 ----------
const PageLogin = {
    render() {
        return `
        <div class="login-page">
            <div class="login-logo"><i class="fas fa-heartbeat"></i></div>
            <div class="login-title">家庭健康中心</div>
            <div class="login-subtitle">守护家人健康，从记录开始</div>
            <div class="login-form" id="loginForm">
                <div class="form-group"><input id="loginPhone" type="tel" placeholder="手机号" maxlength="11"></div>
                <div class="form-group"><input id="loginPassword" type="password" placeholder="密码"></div>
                <button class="login-btn" onclick="App.doLogin()">登录</button>
                <div class="login-switch">还没有账号？<a onclick="App.showRegister()">立即注册</a></div>
            </div>
            <div class="login-form" id="registerForm" style="display:none;">
                <div class="form-group"><input id="regName" type="text" placeholder="姓名"></div>
                <div class="form-group"><input id="regPhone" type="tel" placeholder="手机号" maxlength="11"></div>
                <div class="form-group"><input id="regPassword" type="password" placeholder="密码（至少6位）"></div>
                <button class="login-btn" onclick="App.doRegister()">注册</button>
                <div class="login-switch">已有账号？<a onclick="App.showLogin()">去登录</a></div>
            </div>
        </div>`;
    }
};

// ---------- 首页 ----------
const PageHome = {
    render() {
        const memberId = App.state.currentMemberId;
        const member = App.getCurrentMember();
        if (!member) {
            return `<div class="empty-state"><i class="fas fa-users"></i><h3>暂无成员</h3><p>请通过家庭组管理邀请家人加入</p></div>`;
        }
        this.loadContent(memberId);
        return `
        <div class="card">
            <div class="card-title" style="display:flex;align-items:center;">
                <span style="flex:1;"><i class="fas fa-pills"></i> 今日用药安排</span>
                <button class="btn-outline" style="width:auto;padding:3px 10px;font-size:12px;margin-left:8px;" onclick="App.switchPage('medEdit')"><i class="fas fa-edit"></i> 编辑</button>
                <button class="btn-outline" style="width:auto;padding:3px 10px;font-size:12px;margin-left:4px;" onclick="App.switchPage('medHistory')"><i class="fas fa-history"></i> 历史</button>
            </div>
            <div id="homeMeds"><p class="text-muted" style="text-align:center;padding:12px;">加载中...</p></div>
        </div>
        <div id="homeRefill"></div>
        <div class="card" style="cursor:pointer;" onclick="App.switchPage('records')">
            <div class="card-title"><i class="fas fa-notes-medical"></i> 最近病历 <i class="fas fa-chevron-right" style="margin-left:auto;color:#94a3b8;"></i></div>
            <p class="text-muted">点击查看病历记录和检查报告</p>
        </div>`;
    },

    async loadContent(memberId) {
        try {
            const medsRes = await Api.medications.getAll(memberId, true);
            const meds = medsRes.medications || [];
            const medsEl = document.getElementById('homeMeds');
            const refillEl = document.getElementById('homeRefill');

            if (meds.length === 0) {
                if (medsEl) medsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:12px;">暂无用药计划</p>';
                return;
            }

            if (medsEl) {
                medsEl.innerHTML = meds.map(m => {
                    const times = m.times || ['08:00'];
                    const timeStr = times[0] || '08:00';
                    const hour = parseInt(timeStr.split(':')[0]);
                    let tagClass = 'morning', tagText = '早';
                    if (hour >= 12 && hour < 18) { tagClass = 'noon'; tagText = '中'; }
                    else if (hour >= 18) { tagClass = 'night'; tagText = '晚'; }
                    return `<div class="med-schedule-item">
                        <span class="time-tag ${tagClass}">${tagText} ${timeStr}</span>
                        <div class="med-info">
                            <div class="name" style="cursor:pointer;color:#2b7a78;" onclick="App.viewDrugInfo('${m.name.replace(/'/g, "\\'")}','','','')">${m.name}</div>
                            <div class="dosage">${m.dose || ''} · ${m.frequency || ''}</div>
                        </div>
                        <button class="med-status" onclick="App.toggleMedTaken(this)">待服</button>
                    </div>`;
                }).join('');
            }

            const firstMed = meds[0];
            const remaining = Math.floor(Math.random() * 20) + 5;
            const daily = (firstMed.times || []).length || 1;
            const daysLeft = Math.ceil(remaining / daily);
            const progress = Math.min((remaining / (daily * 30)) * 100, 100);
            const suggestDate = new Date(Date.now() + daysLeft * 86400000).toISOString().slice(0, 10);

            if (refillEl) {
                refillEl.innerHTML = `<div class="card">
                    <div class="card-title"><i class="fas fa-calculator"></i> 开药倒计时</div>
                    <div><span style="font-weight:600;">${firstMed.name}</span> <span class="badge">剩余 ${daysLeft} 天</span></div>
                    <div class="refill-progress"><div class="bar-bg"><div class="bar-fill" style="width:${progress}%;"></div></div></div>
                    <div class="refill-date"><span>当前剩余约 ${remaining} 份</span><span>建议开药日: ${suggestDate}</span></div>
                </div>`;
            }
        } catch (err) {
            console.error('加载首页失败:', err);
        }
    }
};

// ---------- 病历页 ----------
const PageRecords = {
    render() {
        const member = App.getCurrentMember();
        const memberId = App.state.currentMemberId;
        this.loadContent(memberId);
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('home')"><i class="fas fa-arrow-left"></i></button>
            <h2>${member ? member.name + '的' : ''}病历</h2>
            <button class="btn-outline" style="width:auto;padding:8px 16px;font-size:13px;margin-left:auto;" onclick="App.switchPage('addRecord')"><i class="fas fa-plus"></i> 添加</button>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-notes-medical"></i> 病历记录</div>
            <div id="recordsList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-file-medical-alt"></i> 报告记录</div>
            <div id="reportsList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-prescription-bottle-medical"></i> 处方记录</div>
            <div id="prescriptionsList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    async loadContent(memberId) {
        try {
            const res = await Api.records.getAll(memberId);
            const records = res.records || [];
            const medicalRecords = records.filter(r => r.type === '病历');
            const reports = records.filter(r => r.type === '检查报告');
            const prescriptions = records.filter(r => r.type === '药方');

            const recordsEl = document.getElementById('recordsList');
            const reportsEl = document.getElementById('reportsList');
            const prescriptionsEl = document.getElementById('prescriptionsList');
            if (!recordsEl || !reportsEl || !prescriptionsEl) return;

            if (medicalRecords.length === 0) {
                recordsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无病历记录</p>';
            } else {
                recordsEl.innerHTML = medicalRecords.map(r => `
                    <div class="record-item" onclick="App.viewRecord('${r.id}')">
                        <span class="date">${r.visitDate || ''}</span>
                        <div class="title">病历 · ${r.diagnosis || '未填写'}</div>
                        <div class="sub">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}</div>
                    </div>`).join('');
            }

            if (reports.length === 0) {
                reportsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无报告记录</p>';
            } else {
                reportsEl.innerHTML = reports.map(r => `
                    <div class="record-item" onclick="App.viewRecord('${r.id}')">
                        <span class="date">${r.visitDate || ''}</span>
                        <div class="title">检查报告 · ${r.diagnosis || '未填写'}</div>
                        <div class="sub">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}</div>
                        ${r.conclusion ? `<div class="sub" style="color:#2b7a78;">结论：${r.conclusion.substring(0, 40)}${r.conclusion.length > 40 ? '...' : ''}</div>` : ''}
                    </div>`).join('');
            }

            if (prescriptions.length === 0) {
                prescriptionsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无处方记录</p>';
            } else {
                prescriptionsEl.innerHTML = prescriptions.map(r => `
                    <div class="record-item" onclick="App.viewRecord('${r.id}')">
                        <span class="date">${r.visitDate || ''}</span>
                        <div class="title">处方 · ${r.diagnosis || '未填写'}</div>
                        <div class="sub">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}${r.doctor ? ' · ' + r.doctor : ''}</div>
                    </div>`).join('');
            }
        } catch (err) {
            const recordsEl = document.getElementById('recordsList');
            const reportsEl = document.getElementById('reportsList');
            const prescriptionsEl = document.getElementById('prescriptionsList');
            if (recordsEl) recordsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
            if (reportsEl) reportsEl.innerHTML = '';
            if (prescriptionsEl) prescriptionsEl.innerHTML = '';
        }
    }
};

// ---------- 病历/报告详情 ----------
// ---------- 通用图片展示辅助函数 ----------
function renderImageGallery(images) {
    if (!images || images.length === 0) return '';
    const token = localStorage.getItem('fh_token');
    const urls = images.map(img => {
        let url = img.url || '';
        if (token && url.startsWith('/api/')) {
            url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
        }
        return url;
    });
    const urlsJson = JSON.stringify(urls).replace(/"/g, '&quot;');
    return `<div class="card"><div class="card-title"><i class="fas fa-images"></i> 图片</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${
        urls.map((u, i) => `<img src="${u}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="ImageViewer.show(${urlsJson},${i})">`).join('')
    }</div></div>`;
}

const PageRecordDetail = {
    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('records')"><i class="fas fa-arrow-left"></i></button>
            <h2>详情</h2>
        </div>
        <div id="recordDetailContent"><p class="text-muted" style="text-align:center;padding:40px;">加载中...</p></div>`;
    },

    async loadContent() {
        const id = App.state.currentRecordId;
        try {
            const res = await Api.records.get(id);
            const r = res.record;
            const el = document.getElementById('recordDetailContent');
            if (!el) return;

            if (r.type === '检查报告') {
                // 报告类型：显示检查所见、报告结论
                el.innerHTML = `
                <div class="card">
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">检查报告 · ${r.visitDate || ''}</div>
                    <div class="text-muted" style="margin-top:4px;">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}</div>
                </div>
                ${r.findings ? `<div class="card"><div class="card-title"><i class="fas fa-microscope"></i> 检查所见</div><p style="white-space:pre-wrap;line-height:1.8;">${r.findings}</p></div>` : ''}
                ${r.conclusion ? `<div class="card"><div class="card-title"><i class="fas fa-clipboard-check"></i> 报告结论</div><p style="white-space:pre-wrap;line-height:1.8;">${r.conclusion}</p></div>` : ''}
                ${renderImageGallery(r.images)}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此报告</button>`;
            } else if (r.type === '药方') {
                // 处方类型：显示诊断、医院、医生、用药明细
                const meds = r.medications || [];
                const medsHtml = meds.length === 0
                    ? '<p class="text-muted" style="text-align:center;padding:10px;">暂无用药明细</p>'
                    : meds.map(m => `
                        <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-weight:600;color:#2b7a78;">${m.name || '未命名'}</span>
                                <span style="font-size:0.85em;color:#94a3b8;">${m.startDate || ''}</span>
                            </div>
                            ${m.specification ? `<div style="font-size:0.85em;color:#64748b;margin-top:2px;">规格: ${m.specification}</div>` : ''}
                            <div style="font-size:0.9em;color:#64748b;margin-top:4px;">
                                ${m.dose ? `剂量: ${m.dose}` : ''}${m.dose && m.frequency ? ' · ' : ''}${m.frequency ? `频次: ${m.frequency}次/日` : ''}
                                ${m.quantity ? ` · 数量: ${m.quantity}` : ''}
                            </div>
                            ${m.note ? `<div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">备注: ${m.note}</div>` : ''}
                        </div>`).join('');
                el.innerHTML = `
                <div class="card">
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">处方 · ${r.visitDate || ''}</div>
                    <div class="text-muted" style="margin-top:4px;">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}${r.doctor ? ' · ' + r.doctor : ''}</div>
                </div>
                <div class="card">
                    <div class="card-title"><i class="fas fa-prescription-bottle-medical"></i> 用药明细</div>
                    ${medsHtml}
                </div>
                ${renderImageGallery(r.images)}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此处方</button>`;
            } else {
                // 病历类型：显示主诉、医嘱，及关联的处方/报告
                const related = r.relatedRecords || [];
                const relatedHtml = related.length === 0 ? '' : `
                <div class="card">
                    <div class="card-title"><i class="fas fa-link"></i> 关联记录</div>
                    ${related.map(rr => `
                        <div class="record-item" onclick="App.viewRecord('${rr.id}')">
                            <span class="date">${rr.visitDate || ''}</span>
                            <div class="title">${rr.type === '药方' ? '处方' : '检查报告'} · ${rr.diagnosis || '未填写'}</div>
                            <div class="sub">${rr.hospital || ''} ${rr.department ? '· ' + rr.department : ''}</div>
                            ${rr.type === '药方' && rr.medications && rr.medications.length > 0
                                ? `<div class="sub" style="color:#2b7a78;">药品: ${rr.medications.map(m => m.name).filter(Boolean).join('、')}</div>` : ''}
                            ${rr.type === '检查报告' && rr.conclusion
                                ? `<div class="sub" style="color:#2b7a78;">结论：${rr.conclusion.substring(0, 40)}${rr.conclusion.length > 40 ? '...' : ''}</div>` : ''}
                        </div>`).join('')}
                </div>`;
                el.innerHTML = `
                <div class="card">
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">${r.visitDate || ''}</div>
                    <div class="text-muted" style="margin-top:4px;">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}${r.doctor ? ' · ' + r.doctor : ''}</div>
                    ${r.chiefComplaint ? `<div style="margin-top:12px;"><strong>主诉：</strong>${r.chiefComplaint}</div>` : ''}
                </div>
                ${r.orders ? `<div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 医嘱</div><p>${r.orders}</p></div>` : ''}
                ${relatedHtml}
                ${renderImageGallery(r.images)}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此病历</button>`;
            }
        } catch (err) {
            const el = document.getElementById('recordDetailContent');
            if (el) el.innerHTML = `<p>加载失败: ${err.message}</p>`;
        }
    }
};

// ---------- 药箱页 ----------
const PagePharmacy = {
    render() {
        this.loadContent();
        return `
        <div class="card">
            <div class="card-title"><i class="fas fa-kit-medical"></i> 家庭药箱 <button class="btn-outline" style="width:auto;padding:6px 14px;font-size:13px;margin-left:auto;" onclick="App.switchPage('addDrug')"><i class="fas fa-plus"></i> 添加</button></div>
            <div id="pharmacyList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    async loadContent() {
        try {
            const res = await Api.drugs.getAll();
            const drugs = res.drugs || [];
            const warnings = res.warnings || {};
            const el = document.getElementById('pharmacyList');
            if (!el) return;

            let html = '';
            if (drugs.length === 0) {
                html = '<p class="text-muted" style="text-align:center;padding:20px;">药箱为空</p>';
            } else {
                html = drugs.map(d => {
                    let statusHtml = '<span style="color:#16a34a;">✔ 有效</span>';
                    if (d.status === 'expired') statusHtml = '<span class="danger">⛔ 已过期!</span>';
                    else if (d.status === 'expiring_soon') statusHtml = '<span class="danger">⚠ 即将过期</span>';
                    const icon = d.name.includes('注射') ? 'fa-syringe' : d.name.includes('片') ? 'fa-tablets' : 'fa-capsules';
                    const specParts = [];
                    if (d.specDosage != null) specParts.push(`每${d.specDosageUnit || '片'}${d.specDosage}${d.specDosageUnit === 'g' ? 'g' : ''}`);
                    if (d.unitCapacity != null) specParts.push(`每${d.unitCapacityUnit || '盒'}${d.unitCapacity}${d.specDosageUnit || '片'}`);
                    const specLine = specParts.length > 0 ? specParts.join('，') : (d.specification || '');
                    return `<div class="drug-item" style="cursor:pointer;" onclick="App.viewDrugDetail('${d.id}')">
                        <div class="drug-icon"><i class="fas ${icon}"></i></div>
                        <div class="drug-info">
                            <div class="dname" style="color:#2b7a78;" onclick="event.stopPropagation();App.viewDrugInfo('${d.name.replace(/'/g, "\\'")}','${(d.specification || '').replace(/'/g, "\\'")}','${(d.manufacturer || '').replace(/'/g, "\\'")}','${(d.drugCode || '').replace(/'/g, "\\'")}')">${d.name}</div>
                            <div class="dexp">📅 过期: ${d.expiryDate || '未设置'} ${statusHtml}</div>
                            ${specLine || d.manufacturer ? `<div class="qty">${d.quantity || 1}${d.unitCapacityUnit || '盒'}${specLine ? ' · ' + specLine : ''}${d.manufacturer ? ' · ' + d.manufacturer : ''}</div>` : `<div class="qty">数量: ${d.quantity || 1}</div>`}
                        </div>
                        <button style="background:none;border:none;color:#b91c1c;cursor:pointer;padding:8px;" onclick="event.stopPropagation();App.deleteDrug('${d.id}')"><i class="fas fa-trash"></i></button>
                    </div>`;
                }).join('');
            }

            if (warnings.expired > 0 || warnings.expiringSoon > 0) {
                html += `<div style="margin-top:6px;background:#fee2e2;padding:10px 16px;border-radius:18px;color:#991b1b;font-size:14px;">
                    <i class="fas fa-exclamation-triangle"></i> 提醒: ${warnings.expired}种已过期，${warnings.expiringSoon}种即将过期，请及时处理。
                </div>`;
            }
            el.innerHTML = html;
        } catch (err) {
            const el = document.getElementById('pharmacyList');
            if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    }
};

// ---------- 我的页 ----------
const PageProfile = {
    render() {
        const user = App.state.user;
        const selfElder = App.state.members.find(m => m.relation === 'self');
        if (!user) return '';
        const relationMap = { self: '本人', parent: '父母', spouse_parent: '公婆/岳父母', spouse: '配偶', other: '其他' };
        const infoItems = [];
        if (selfElder) {
            if (selfElder.gender && selfElder.gender !== '未知') infoItems.push(`<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${selfElder.gender}</span>`);
            if (selfElder.age && selfElder.age > 0) infoItems.push(`<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${selfElder.age}岁</span>`);
            if (selfElder.blood_type) infoItems.push(`<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${selfElder.blood_type}</span>`);
        }
        return `
        <div class="card">
            <div class="flex" style="gap:16px;margin-bottom:12px;">
                <div style="font-size:48px;color:#2b7a78;"><i class="fas fa-user-circle"></i></div>
                <div>
                    <div style="font-weight:700;font-size:20px;">${user.name}</div>
                    <div class="text-muted">${user.role === 'admin' ? '管理员' : '成员'} · ${user.phone || '未绑定手机'}</div>
                    ${infoItems.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${infoItems.join('')}</div>` : ''}
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-cog"></i> 设置</div>
            <div style="cursor:pointer;display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f1f5f9;" onclick="App.switchPage('profileEdit')">
                <i class="fas fa-user-edit" style="width:24px;color:#2b7a78;"></i>
                <div style="flex:1;"><div style="font-weight:600;">个人信息</div><div class="text-muted">修改性别、年龄、血型等基本信息</div></div>
                <i class="fas fa-chevron-right" style="color:#94a3b8;"></i>
            </div>
            <div style="cursor:pointer;display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f1f5f9;" onclick="App.switchPage('family')">
                <i class="fas fa-users" style="width:24px;color:#2b7a78;"></i>
                <div style="flex:1;"><div style="font-weight:600;">家庭组管理</div><div class="text-muted">管理家庭组、邀请家人、授权管理</div></div>
                <i class="fas fa-chevron-right" style="color:#94a3b8;"></i>
            </div>
        </div>
        <button class="btn-danger" onclick="App.logout()">退出登录</button>`;
    }
};

// ---------- 个人信息编辑页 ----------
const PageProfileEdit = {
    render() {
        const selfElder = App.state.members.find(m => m.relation === 'self');
        const user = App.state.user;
        if (!selfElder && !user) return '<p class="text-muted" style="text-align:center;padding:40px;">未找到个人信息</p>';
        const e = selfElder || {};
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>个人信息</h2>
        </div>
        <div class="card">
            <div class="form-group"><label>姓名</label><input id="pe-name" value="${e.name || user?.name || ''}"></div>
            <div class="form-group"><label>性别</label><select id="pe-gender">
                <option value="未知" ${(!e.gender || e.gender === '未知') ? 'selected' : ''}>未知</option>
                <option value="男" ${e.gender === '男' ? 'selected' : ''}>男</option>
                <option value="女" ${e.gender === '女' ? 'selected' : ''}>女</option>
            </select></div>
            <div class="form-group"><label>年龄</label><input id="pe-age" type="number" min="0" max="150" value="${e.age || ''}"></div>
            <div class="form-group"><label>血型</label><select id="pe-blood">
                <option value="" ${!e.blood_type ? 'selected' : ''}>未知</option>
                <option value="A型" ${e.blood_type === 'A型' ? 'selected' : ''}>A型</option>
                <option value="B型" ${e.blood_type === 'B型' ? 'selected' : ''}>B型</option>
                <option value="AB型" ${e.blood_type === 'AB型' ? 'selected' : ''}>AB型</option>
                <option value="O型" ${e.blood_type === 'O型' ? 'selected' : ''}>O型</option>
            </select></div>
            <div class="form-group"><label>过敏史</label><textarea id="pe-allergies" placeholder="如：青霉素、花粉">${e.allergies || ''}</textarea></div>
            <div class="form-group"><label>基础疾病</label><textarea id="pe-conditions" placeholder="如：高血压、糖尿病">${e.conditions || ''}</textarea></div>
            <div class="form-group"><label>手机号</label><input id="pe-phone" type="tel" value="${e.phone || user?.phone || ''}"></div>
            <button class="btn-primary" onclick="App.saveProfile()">保存</button>
        </div>`;
    }
};

// ---------- 消息中心 ----------
const PageMessages = {
    render() {
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('home')"><i class="fas fa-arrow-left"></i></button>
            <h2>消息中心</h2>
        </div>
        <div class="card">
            <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #f1f5f9;align-items:flex-start;">
                <div style="font-size:22px;color:#2b7a78;width:36px;text-align:center;"><i class="fas fa-pills"></i></div>
                <div style="flex:1;"><div style="font-weight:600;">用药提醒</div><div class="text-muted">请按时服用药物</div><div style="font-size:12px;color:#94a3b8;">刚刚</div></div>
            </div>
            <div style="display:flex;gap:14px;padding:14px 0;align-items:flex-start;">
                <div style="font-size:22px;color:#2b7a78;width:36px;text-align:center;"><i class="fas fa-file-medical"></i></div>
                <div style="flex:1;"><div style="font-weight:600;">健康提示</div><div class="text-muted">定期检查，关注健康指标变化</div><div style="font-size:12px;color:#94a3b8;">今天</div></div>
            </div>
        </div>`;
    }
};

// ---------- 家庭组管理（家庭组列表+加入家庭）----------
const PageFamily = {
    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>家庭组管理</h2>
        </div>
        <button class="btn-outline" style="width:100%;margin-bottom:12px;padding:10px;" onclick="App.switchPage('joinFamily')"><i class="fas fa-sign-in-alt"></i> 加入家庭</button>
        <div class="card">
            <div class="card-title"><i class="fas fa-home"></i> 我的家庭组</div>
            <div id="familyList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-users"></i> 当前家庭成员</div>
            <div id="familyMembersList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    async loadContent() {
        // 独立加载家庭组列表，避免异常影响成员列表
        this.loadFamilies();
        // 独立加载家庭成员列表
        this.loadMembers();
    },

    async loadFamilies() {
        try {
            const famRes = await Api.auth.families();
            const families = famRes.families || [];
            const currentFamilyId = App.state.family ? App.state.family.id : null;

            const listEl = document.getElementById('familyList');
            if (listEl) {
                if (families.length === 0) {
                    listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无家庭组</p>';
                } else {
                    listEl.innerHTML = families.map(f => {
                        const isCurrent = f.id === currentFamilyId;
                        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9;${isCurrent ? 'background:#f0fdf4;border-radius:8px;padding:12px;' : ''}">
                            <div style="width:40px;height:40px;border-radius:50%;background:#d1e0e8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;"><i class="fas fa-home"></i></div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;">${f.name}${isCurrent ? ' <span style="font-size:11px;background:#16a34a;color:#fff;padding:1px 6px;border-radius:4px;">当前</span>' : ''}</div>
                                <div class="text-muted" style="font-size:12px;">创建者: ${f.creator_name || '未知'}</div>
                                <div style="font-size:12px;color:#6b7280;">邀请码: <span style="font-family:monospace;letter-spacing:1px;">${f.invite_code || ''}</span></div>
                            </div>
                            <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:12px;flex-shrink:0;" onclick="App.editFamilyName('${f.id}','${f.name.replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i></button>
                        </div>`;
                    }).join('');
                }
            }
        } catch (err) {
            console.error('加载家庭组列表失败:', err);
            const listEl = document.getElementById('familyList');
            if (listEl) listEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    },

    async loadMembers() {
        try {
            const res = await Api.auth.familyMembers();
            const members = res.members || [];
            const elders = App.state.members || [];

            const membersEl = document.getElementById('familyMembersList');
            if (membersEl) {
                if (members.length === 0) {
                    membersEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无家庭成员</p>';
                } else {
                    const relationMap = { self: '本人', parent: '父母', spouse_parent: '公婆/岳父母', spouse: '配偶', other: '其他' };
                    membersEl.innerHTML = members.map(m => {
                        const isCurrent = App.state.user && m.id === App.state.user.id;
                        const elder = elders.find(e => e.user_id === m.id);
                        const elderInfo = elder ? `
                            <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e2e8f0;">
                                <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:12px;">
                                    ${elder.gender ? `<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${elder.gender}</span>` : ''}
                                    ${elder.age ? `<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${elder.age}岁</span>` : ''}
                                    ${elder.blood_type ? `<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${elder.blood_type}</span>` : ''}
                                    ${elder.relation ? `<span style="background:#dbeafe;padding:2px 8px;border-radius:4px;">${relationMap[elder.relation] || '其他'}</span>` : ''}
                                </div>
                                ${elder.allergies ? `<div style="font-size:12px;color:#b91c1c;margin-top:4px;">过敏: ${elder.allergies}</div>` : ''}
                                ${elder.conditions ? `<div style="font-size:12px;color:#92400e;margin-top:2px;">基础病: ${elder.conditions}</div>` : ''}
                            </div>` : '';

                        return `<div style="display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid #f1f5f9;">
                            <div style="width:44px;height:44px;border-radius:50%;background:#d1e0e8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;">${m.avatar || m.name.charAt(0)}</div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;">${m.name}${isCurrent ? '（我）' : ''}</div>
                                <div class="text-muted">${m.role === 'admin' ? '管理员' : '成员'} · ${m.phone || ''}</div>
                                ${elderInfo}
                            </div>
                            <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
                                ${!isCurrent ? `<button class="btn-outline" style="width:auto;padding:4px 10px;font-size:11px;${m.authorized ? 'color:#16a34a;border-color:#16a34a;' : 'color:#dc2626;border-color:#dc2626;'}" onclick="App.toggleMemberAuth('${m.id}')">${m.authorized ? '已授权' : '未授权'}</button>` : ''}
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        } catch (err) {
            console.error('加载家庭成员失败:', err);
            const membersEl = document.getElementById('familyMembersList');
            if (membersEl) membersEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    }
};

// ---------- 加入家庭页（输入邀请码）----------
const PageJoinFamily = {
    render() {
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('family')"><i class="fas fa-arrow-left"></i></button>
            <h2>加入家庭</h2>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-sign-in-alt"></i> 通过邀请码加入</div>
            <div class="form-group"><label>邀请码</label><input id="joinCode" placeholder="输入邀请码" style="font-family:monospace;letter-spacing:2px;font-size:16px;"></div>
            <button class="btn-primary" onclick="App.joinFamily()">加入</button>
        </div>`;
    }
};

// ---------- 添加用药（右上角相机图标可切换拍照识别）----------
const PageAddMed = {
    render() {
        const members = App.state.members;
        const memberOptions = members.map(m => {
            const isSelf = m.relation === 'self';
            const label = isSelf ? m.name + '（我）' : m.name;
            return `<option value="${m.id}" ${m.id === App.state.currentMemberId ? 'selected' : ''}>${label}</option>`;
        }).join('');
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>添加用药</h2>
            <button style="background:none;border:none;cursor:pointer;font-size:20px;color:#2b7a78;margin-left:auto;padding:8px;" onclick="App.startScan('处方')" title="拍照识别"><i class="fas fa-camera"></i></button>
        </div>
        <div class="card">
            <div class="form-group"><label>关联成员 *</label><select id="medElderId">${memberOptions}</select></div>
            <div class="form-group"><label>药品名称 *</label><input id="medName" placeholder="输入名称或拼音首字母（如 SHP）" autocomplete="off" oninput="DrugSuggest.onInput(this,'medDrugCode')"><input type="hidden" id="medDrugCode"></div>
            <div class="form-group"><label>规格（每片/袋含量）</label><div style="display:flex;gap:8px"><input id="medSpecDosage" type="number" step="0.001" placeholder="如 0.25" style="flex:2"><select id="medSpecDosageUnit" style="flex:1"><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="μg">μg</option></select></div></div>
            <div class="form-group"><label>单位容量（每盒/瓶数量）</label><div style="display:flex;gap:8px"><input id="medUnitCap" type="number" placeholder="如 20" style="flex:2"><select id="medUnitCapUnit" style="flex:1"><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="瓶">瓶</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label>数量</label><input id="medQty" type="number" value="1" min="1"></div>
            <div class="form-group"><label>每次剂量</label><div style="display:flex;gap:8px"><input id="medDoseAmount" type="number" step="0.001" placeholder="如 5" style="flex:2"><select id="medDoseUnit" style="flex:1"><option value="mg">mg</option><option value="g">g</option><option value="ml">ml</option><option value="μg">μg</option><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label>每日次数</label><input id="medFreq" type="number" min="1" max="4" value="1" oninput="MedTimesUI.render('med')"></div>
            <div class="form-group"><label>服用时间段</label><div id="medTimeSlots"></div></div>
            <div class="form-group"><label>开始日期</label><input id="medStart" type="date" max="${new Date().toISOString().slice(0,10)}"></div>
            <div class="form-group"><label>有效期 *</label><input id="medExpiryDate" type="date"></div>
            <div class="form-group"><label>备注</label><textarea id="medNote" placeholder="服用注意事项"></textarea></div>
            <div class="form-group"><label>图片</label><div id="medImages"></div></div>
            <button class="btn-primary" onclick="App.saveMed()">保存</button>
        </div>`;
    },

    afterRender() {
        ImageUploader.init('medImages');
        MedTimesUI.render('med');
        const today = new Date().toISOString().slice(0,10);
        const el = document.getElementById('medStart');
        if (el && !el.value) el.value = today;
    }
};

// ---------- 添加病历（右上角相机图标可切换拍照识别）----------
const PageAddRecord = {
    render() {
        const members = App.state.members;
        const memberOptions = members.map(m => {
            const isSelf = m.relation === 'self';
            const label = isSelf ? m.name + '（我）' : m.name;
            return `<option value="${m.id}" ${m.id === App.state.currentMemberId ? 'selected' : ''}>${label}</option>`;
        }).join('');
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>添加病历</h2>
            <button style="background:none;border:none;cursor:pointer;font-size:20px;color:#2b7a78;margin-left:auto;padding:8px;" onclick="App.startScan('病历')" title="拍照识别"><i class="fas fa-camera"></i></button>
        </div>
        <div class="card">
            <div class="form-group"><label>关联成员 *</label><select id="recordElderId" onchange="PageAddRecord.onElderChange(this.value)">${memberOptions}</select></div>
            <div class="form-group"><label>类型</label><select id="recordType" onchange="PageAddRecord.onTypeChange(this.value)"><option value="病历">病历</option><option value="检查报告">检查报告</option><option value="处方">处方</option></select></div>
            <div id="recordFieldsMedical">
                <div class="form-group"><label id="recordDateLabel">就诊日期</label><input id="recordDate" type="date" max="${new Date().toISOString().slice(0,10)}"></div>
                <div class="form-group"><label>医院</label><input id="recordHospital" placeholder="输入医院名称或拼音首字母" autocomplete="off" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室</label><input id="recordDept" placeholder="输入科室名称或拼音首字母" autocomplete="off" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>主诉</label><textarea id="recordComplaint" placeholder="主要症状"></textarea></div>
                <div class="form-group"><label>诊断 *</label><input id="recordDiagnosis" placeholder="诊断结果"></div>
                <div class="form-group"><label>医嘱</label><textarea id="recordOrders" placeholder="医嘱内容"></textarea></div>
                <div class="form-group"><label>医生</label><input id="recordDoctor" placeholder="主治医生"></div>
            </div>
            <div id="recordFieldsReport" style="display:none;">
                <div class="form-group"><label>检查日期</label><input id="recordDate2" type="date" max="${new Date().toISOString().slice(0,10)}"></div>
                <div class="form-group"><label>医院</label><input id="recordHospital2" placeholder="输入医院名称或拼音首字母" autocomplete="off" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室</label><input id="recordDept2" placeholder="输入科室名称或拼音首字母" autocomplete="off" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>检查项目 *</label><input id="recordExamName" placeholder="如：胸部CT平扫"></div>
                <div class="form-group"><label>检查所见</label><textarea id="recordFindings" rows="4" placeholder="检查所见内容"></textarea></div>
                <div class="form-group"><label>报告结论</label><textarea id="recordConclusion" rows="3" placeholder="报告结论内容"></textarea></div>
                <div class="form-group"><label>关联病历</label><select id="recordRelatedRecord2"><option value="">不关联</option></select></div>
            </div>
            <div id="recordFieldsPrescription" style="display:none;">
                <div class="form-group"><label>开始日期</label><input id="recordDate3" type="date" max="${new Date().toISOString().slice(0,10)}"></div>
                <div class="form-group"><label>医院</label><input id="recordMedHospital" placeholder="输入医院名称或拼音首字母" autocomplete="off" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室</label><input id="recordMedDept" placeholder="输入科室名称或拼音首字母" autocomplete="off" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>诊断</label><input id="recordMedDiagnosis" placeholder="诊断结果"></div>
                <div class="form-group"><label>医生</label><input id="recordMedDoctor" placeholder="主治医生"></div>
                <div style="background:#f8fafd;border-radius:12px;padding:12px;margin-bottom:8px;">
                    <div class="form-group"><label>药品名称 *</label><input id="recordMedName" placeholder="输入名称或拼音首字母" autocomplete="off" oninput="DrugSuggest.onInput(this,'recordMedCode')"><input type="hidden" id="recordMedCode"></div>
                    <div class="form-group"><label>规格（每片/袋含量）</label><div style="display:flex;gap:8px"><input id="recordMedSpecDosage" type="number" step="0.001" placeholder="如 0.25" style="flex:2"><select id="recordMedSpecDosageUnit" style="flex:1"><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="μg">μg</option></select></div></div>
                    <div class="form-group"><label>单位容量（每盒/瓶数量）</label><div style="display:flex;gap:8px"><input id="recordMedUnitCap" type="number" placeholder="如 20" style="flex:2"><select id="recordMedUnitCapUnit" style="flex:1"><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="瓶">瓶</option><option value="贴">贴</option></select></div></div>
                    <div class="form-group"><label>数量</label><input id="recordMedQty" type="number" value="1" min="1"></div>
                    <div class="form-group"><label>有效期 *</label><input id="recordMedExpiryDate" type="date"></div>
                    <div class="form-group"><label>每次剂量</label><div style="display:flex;gap:8px"><input id="recordMedDoseAmount" type="number" step="0.001" placeholder="如 5" style="flex:2"><select id="recordMedDoseUnit" style="flex:1"><option value="mg">mg</option><option value="g">g</option><option value="ml">ml</option><option value="μg">μg</option><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="贴">贴</option></select></div></div>
                    <div class="form-group"><label>每日次数</label><input id="recordMedFreq" type="number" min="1" max="4" value="1" oninput="MedTimesUI.render('recordMed')"></div>
                    <div class="form-group"><label>服用时间段</label><div id="recordMedTimeSlots"></div></div>
                    <div class="form-group"><label>备注</label><input id="recordMedNote" placeholder="如：餐后服用"></div>
                </div>
                <div class="form-group"><label>关联病历</label><select id="recordMedRelated"><option value="">不关联</option></select></div>
            </div>
            <div class="form-group"><label>图片</label><div id="recordImages"></div></div>
            <button class="btn-primary" onclick="App.saveRecord()">保存</button>
        </div>`;
    },

    onTypeChange(type) {
        const medicalFields = document.getElementById('recordFieldsMedical');
        const reportFields = document.getElementById('recordFieldsReport');
        const prescriptionFields = document.getElementById('recordFieldsPrescription');
        if (type === '检查报告') {
            medicalFields.style.display = 'none';
            reportFields.style.display = 'block';
            prescriptionFields.style.display = 'none';
        } else if (type === '处方') {
            medicalFields.style.display = 'none';
            reportFields.style.display = 'none';
            prescriptionFields.style.display = 'block';
            MedTimesUI.render('recordMed');
        } else {
            medicalFields.style.display = 'block';
            reportFields.style.display = 'none';
            prescriptionFields.style.display = 'none';
        }
    },

    afterRender() {
        ImageUploader.init('recordImages');
        const today = new Date().toISOString().slice(0,10);
        // 设置就诊/检查/开始日期缺省为当天
        ['recordDate','recordDate2','recordDate3'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = today;
        });
        // 处方类型时初始化时间段
        if (document.getElementById('recordType').value === '处方') {
            MedTimesUI.render('recordMed');
        }
        // 加载关联病历下拉数据（处方/报告用）
        const elderId = document.getElementById('recordElderId')?.value;
        if (elderId) this.onElderChange(elderId);
    },

    // 成员切换时刷新关联病历下拉
    async onElderChange(elderId) {
        if (!elderId) return;
        await Promise.all([
            App._loadRelatedRecords(elderId, 'recordMedRelated'),
            App._loadRelatedRecords(elderId, 'recordRelatedRecord2')
        ]);
    }
};

// ---------- 添加药品（右上角相机图标可切换拍照识别）----------
const PageAddDrug = {
    render() {
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>添加药品</h2>
            <button style="background:none;border:none;cursor:pointer;font-size:20px;color:#2b7a78;margin-left:auto;padding:8px;" onclick="App.startScan('药品')" title="拍照识别"><i class="fas fa-camera"></i></button>
        </div>
        <div class="card">
            <div class="form-group"><label>药品名称 *</label><input id="drugName" placeholder="输入名称或拼音首字母（如 SHP）" autocomplete="off" oninput="DrugSuggest.onInput(this,'drugCodeHidden',{specDosage:'specDosage',specDosageUnit:'specDosageUnit',unitCapacity:'unitCap',unitCapacityUnit:'unitCapUnit',manufacturer:'drugManu'})"><input type="hidden" id="drugCodeHidden"></div>
            <div class="form-group"><label>规格（每片/袋含量）</label><div style="display:flex;gap:8px"><input id="specDosage" type="number" step="0.001" placeholder="如 0.25" style="flex:2"><select id="specDosageUnit" style="flex:1"><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="μg">μg</option></select></div></div>
            <div class="form-group"><label>单位容量（每盒/瓶数量）</label><div style="display:flex;gap:8px"><input id="unitCap" type="number" placeholder="如 20" style="flex:2"><select id="unitCapUnit" style="flex:1"><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="瓶">瓶</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label>生产厂商</label><input id="drugManu" placeholder="生产单位"></div>
            <div class="form-group"><label>数量</label><input id="drugQty" type="number" value="1" min="1"></div>
            <div class="form-group"><label>有效期 *</label><input id="drugExp" type="date"></div>
            <div class="form-group"><label>备注</label><textarea id="drugNote" placeholder="备注信息"></textarea></div>
            <div class="form-group"><label>图片</label><div id="drugImages"></div></div>
            <button class="btn-primary" onclick="App.saveDrug()">保存</button>
        </div>`;
    },

    afterRender() {
        ImageUploader.init('drugImages');
    }
};

// ---------- 药品详情页（药箱点击打开） ----------
const PageDrugDetail = {
    render() {
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>药品详情</h2>
            <button style="background:none;border:none;cursor:pointer;font-size:20px;color:#b91c1c;margin-left:auto;padding:8px;" onclick="App.deleteDrug(App.state.currentDrugId)" title="删除"><i class="fas fa-trash"></i></button>
        </div>
        <div id="drugDetailContent"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>`;
    },

    async afterRender() {
        const drugId = App.state.currentDrugId;
        if (!drugId) return;
        try {
            const res = await Api.drugs.getRecords(drugId);
            const drug = res.drug || {};
            const records = res.medicationRecords || [];
            const el = document.getElementById('drugDetailContent');
            if (!el) return;

            let statusHtml = '<span style="color:#16a34a;">✔ 有效</span>';
            if (drug.status === 'expired') statusHtml = '<span class="danger">⛔ 已过期</span>';
            else if (drug.status === 'expiring_soon') statusHtml = '<span class="danger">⚠ 即将过期</span>';

            const specParts = [];
            if (drug.specDosage != null) specParts.push(`每${drug.specDosageUnit || '片'}${drug.specDosage}${drug.specDosageUnit === 'g' ? 'g' : drug.specDosageUnit === 'mg' ? 'mg' : drug.specDosageUnit === 'ml' ? 'ml' : ''}`);
            if (drug.unitCapacity != null) specParts.push(`每${drug.unitCapacityUnit || '盒'}${drug.unitCapacity}${drug.specDosageUnit || '片'}`);
            const specLine = specParts.length > 0 ? specParts.join('，') : (drug.specification || '');

            let imagesHtml = '';
            if (drug.images && drug.images.length > 0) {
                const urls = drug.images.map(img => ImageUploader._authUrl ? ImageUploader._authUrl(img.url) : img.url);
                const urlsJson = JSON.stringify(urls).replace(/"/g, '&quot;');
                imagesHtml = drug.images.map((img, idx) => `
                    <img src="${ImageUploader._authUrl ? ImageUploader._authUrl(img.url) : img.url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="ImageViewer.show(${urlsJson},${idx})">
                `).join('');
            }

            // 找出关联的家人名称
            const elderName = drug.elderId ? (App.state.members.find(m => m.id === drug.elderId) || {}).name || '' : '';

            el.innerHTML = `
            <div class="card">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <span style="font-size:1.4em;font-weight:700;color:#2b7a78;cursor:pointer;" onclick="App.viewDrugInfo('${(drug.name || '').replace(/'/g, "\\'")}','${(drug.specification || '').replace(/'/g, "\\'")}','${(drug.manufacturer || '').replace(/'/g, "\\'")}','${(drug.drugCode || '').replace(/'/g, "\\'")}')">${drug.name}</span>
                </div>
                ${specLine ? `<div class="text-muted" style="font-size:0.9em;margin-bottom:4px;">${specLine}</div>` : ''}
                ${drug.manufacturer ? `<div class="text-muted" style="font-size:0.9em;margin-bottom:4px;">厂商: ${drug.manufacturer}</div>` : ''}
                <div style="display:flex;gap:16px;align-items:center;margin-top:8px;">
                    <span style="font-size:1.2em;font-weight:600;">库存: ${drug.quantity || 0}</span>
                    ${drug.unitCapacityUnit || '盒'}
                    ${statusHtml}
                </div>
                ${elderName ? `<div class="text-muted" style="font-size:0.9em;margin-top:4px;">所属: ${elderName}</div>` : ''}
                ${drug.expiryDate ? `<div class="text-muted" style="font-size:0.9em;">有效期至: ${drug.expiryDate}</div>` : ''}
                ${drug.note ? `<div class="text-muted" style="font-size:0.9em;margin-top:4px;">备注: ${drug.note}</div>` : ''}
                ${imagesHtml ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">${imagesHtml}</div>` : ''}
            </div>
            <div class="card">
                <div class="card-title"><i class="fas fa-history"></i> 添加记录</div>
                ${records.length === 0 ? '<p class="text-muted" style="text-align:center;padding:10px;">暂无处方记录</p>' :
                records.map(r => `
                    <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-weight:500;">${r.elderName || '未知'}</span>
                            <span style="font-size:0.85em;color:#94a3b8;">${r.startDate || ''}</span>
                        </div>
                        <div style="font-size:0.9em;color:#64748b;margin-top:4px;">
                            ${r.dose ? `剂量: ${r.dose}` : ''}${r.dose && r.frequency ? ' · ' : ''}${r.frequency ? `频次: ${r.frequency}` : ''}
                            ${r.quantity ? ` · 数量: ${r.quantity}` : ''}
                        </div>
                        ${r.note ? `<div style="font-size:0.85em;color:#94a3b8;margin-top:2px;">${r.note}</div>` : ''}
                        <div style="font-size:0.8em;color:#94a3b8;margin-top:2px;">${r.status === 'active' ? '用药中' : '已结束'}</div>
                    </div>
                `).join('')}
            </div>`;
        } catch (err) {
            const el = document.getElementById('drugDetailContent');
            if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    }
};

// ---------- 药品说明书 ----------
const PageDrugInfo = {
    render() {
        const drugName = App.state.currentDrugName || '';
        const drugSpec = App.state.currentDrugSpec || '';
        const drugManufacturer = App.state.currentDrugManufacturer || '';
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>药品说明书</h2>
            <div style="margin-left:auto;display:flex;gap:4px;">
                <button class="btn-outline" style="width:auto;padding:4px 10px;font-size:12px;" onclick="PageDrugInfo.setFont('small')" id="fontSmall">小</button>
                <button class="btn-outline" style="width:auto;padding:4px 10px;font-size:12px;background:#2b7a78;color:#fff;border-color:#2b7a78;" onclick="PageDrugInfo.setFont('medium')" id="fontMedium">中</button>
                <button class="btn-outline" style="width:auto;padding:4px 10px;font-size:12px;" onclick="PageDrugInfo.setFont('large')" id="fontLarge">大</button>
            </div>
        </div>
        <div id="drugInfoContent" style="font-size:15px;line-height:1.8;">
            <div class="card">
                <div style="font-size:1.4em;font-weight:700;margin-bottom:4px;">${drugName}</div>
                ${drugSpec || drugManufacturer ? `<div class="text-muted" style="font-size:0.9em;">${drugSpec ? '规格: ' + drugSpec : ''}${drugSpec && drugManufacturer ? ' | ' : ''}${drugManufacturer ? '厂商: ' + drugManufacturer : ''}</div>` : ''}
                <div id="drugInfoExtra" class="text-muted" style="font-size:0.9em;"></div>
            </div>
            <div id="drugInfoBody"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    async afterRender() {
        const drugCode = App.state.currentDrugCode || '';
        const drugName = App.state.currentDrugName || '';
        if (drugCode) {
            try {
                const res = await Api.drugLibrary.get(drugCode);
                const d = res.drug || {};
                this._showInfo(d);
            } catch (err) {
                this._showEmpty(drugName);
            }
        } else {
            // 无 drugCode 时尝试按名称搜索
            try {
                const res = await Api.drugLibrary.search(drugName, 1);
                const drugs = res.drugs || [];
                if (drugs.length > 0) {
                    const d = drugs[0];
                    this._showInfo(d);
                } else {
                    this._showEmpty(drugName);
                }
            } catch (err) {
                this._showEmpty(drugName);
            }
        }
    },

    _showInfo(d) {
        const extraEl = document.getElementById('drugInfoExtra');
        const bodyEl = document.getElementById('drugInfoBody');
        if (extraEl) {
            const parts = [];
            if (d.genericName) parts.push('通用名: ' + d.genericName);
            if (d.category) parts.push('类别: ' + d.category);
            extraEl.textContent = parts.join(' | ');
        }
        if (!bodyEl) return;
        const sections = [];
        if (d.indication) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 适应症</div><p style="white-space:pre-wrap;">${d.indication}</p></div>`);
        if (d.contraindication) sections.push(`<div class="card"><div class="card-title" style="color:#dc2626;"><i class="fas fa-ban"></i> 禁忌</div><p style="white-space:pre-wrap;color:#dc2626;">${d.contraindication}</p></div>`);
        if (d.dosageInstruction) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-prescription-bottle-alt"></i> 用法用量</div><p style="white-space:pre-wrap;">${d.dosageInstruction}</p></div>`);
        if (d.adverseReaction) sections.push(`<div class="card"><div class="card-title" style="color:#d97706;"><i class="fas fa-exclamation-triangle"></i> 不良反应</div><p style="white-space:pre-wrap;">${d.adverseReaction}</p></div>`);
        if (d.drugInteraction) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-exchange-alt"></i> 药物相互作用</div><p style="white-space:pre-wrap;">${d.drugInteraction}</p></div>`);
        if (d.precaution) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-info-circle"></i> 注意事项</div><p style="white-space:pre-wrap;">${d.precaution}</p></div>`);
        if (d.storage) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-temperature-low"></i> 贮藏</div><p style="white-space:pre-wrap;">${d.storage}</p></div>`);
        if (sections.length === 0) {
            sections.push(`<div class="card"><p class="text-muted" style="text-align:center;padding:20px;">暂无「${d.name || ''}」的说明书数据<br><span style="font-size:0.85em;">持续补充中</span></p></div>`);
        }
        bodyEl.innerHTML = sections.join('');
    },

    _showEmpty(drugName) {
        const bodyEl = document.getElementById('drugInfoBody');
        if (bodyEl) {
            bodyEl.innerHTML = `<div class="card"><p class="text-muted" style="text-align:center;padding:20px;">暂无「${drugName}」的说明书数据<br><span style="font-size:0.85em;">持续补充中</span></p></div>`;
        }
    },

    setFont(size) {
        const el = document.getElementById('drugInfoContent');
        if (!el) return;
        const sizes = { small: '13px', medium: '15px', large: '20px' };
        el.style.fontSize = sizes[size] || '15px';
        ['Small', 'Medium', 'Large'].forEach(s => {
            const btn = document.getElementById('font' + s);
            if (btn) {
                const active = s.toLowerCase() === size;
                btn.style.background = active ? '#2b7a78' : '';
                btn.style.color = active ? '#fff' : '';
                btn.style.borderColor = active ? '#2b7a78' : '';
            }
        });
    }
};

// ---------- 成员详情 ----------
const PageElderDetail = {
    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>成员档案</h2>
        </div>
        <div id="elderDetailContent"><p class="text-muted" style="text-align:center;padding:40px;">加载中...</p></div>`;
    },

    async loadContent() {
        const id = App.state.currentMemberId;
        try {
            const res = await Api.elders.get(id);
            const e = res.elder;
            const relationMap = { self: '本人', parent: '父母', spouse_parent: '公婆/岳父母', spouse: '配偶', other: '其他' };
            const el = document.getElementById('elderDetailContent');
            if (!el) return;
            el.innerHTML = `
            <div class="card">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
                    <div style="width:64px;height:64px;border-radius:50%;background:#d1e0e8;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;">${e.avatar || e.name.charAt(0)}</div>
                    <div>
                        <div style="font-weight:700;font-size:20px;">${e.name}</div>
                        <div class="text-muted">${e.gender || '未知'} · ${e.age || '-'}岁 · ${relationMap[e.relation] || '其他'}</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-title"><i class="fas fa-info-circle"></i> 基本信息</div>
                ${e.bloodType ? `<div class="metric-row"><span class="metric-name">血型</span><span class="metric-value">${e.bloodType}</span></div>` : ''}
                ${e.phone ? `<div class="metric-row"><span class="metric-name">电话</span><span class="metric-value">${e.phone}</span></div>` : ''}
                ${e.allergies ? `<div class="metric-row"><span class="metric-name">过敏史</span><span class="metric-value">${e.allergies}</span></div>` : ''}
                ${e.conditions ? `<div class="metric-row"><span class="metric-name">基础疾病</span><span class="metric-value">${e.conditions}</span></div>` : ''}
            </div>
            ${e.relation !== 'self' ? `<button class="btn-danger" onclick="App.deleteElder('${e.id}')">删除档案</button>` : ''}`;
        } catch (err) {
            const el = document.getElementById('elderDetailContent');
            if (el) el.innerHTML = `<p>加载失败: ${err.message}</p>`;
        }
    }
};

// ---------- 用药编辑 ----------
const PageMedEdit = {
    render() {
        PageMedEdit.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>编辑用药安排</h2>
        </div>
        <div id="medEditContent"><p class="text-muted" style="text-align:center;padding:40px;">加载中...</p></div>`;
    },

    async loadContent() {
        const memberId = App.state.currentMemberId;

        try {
            if (!memberId) {
                const el = document.getElementById('medEditContent');
                if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">请先选择一位家庭成员</p>';
                return;
            }
            const medsRes = await Api.medications.getAll(memberId, true);
            const meds = medsRes.medications || [];

            const el = document.getElementById('medEditContent');
            if (!el) return;

            if (meds.length === 0) {
                el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无活跃用药计划</p>';
                return;
            }

            el.innerHTML = meds.map(m => {
                const times = (m.times || []).join(', ');
                return `<div class="card" style="margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:16px;">${m.name}</div>
                        <div class="text-muted" style="font-size:13px;">${m.dose || ''} · ${m.frequency || ''}</div>
                        <div class="text-muted" style="font-size:13px;">时间: ${times || '未设置'}${m.note ? ' · ' + m.note : ''}</div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn-outline" style="width:auto;padding:4px 10px;font-size:12px;" onclick="PageMedEdit.showEditForm('${m.id}')"><i class="fas fa-edit"></i> 修改</button>
                    <button class="btn-outline" style="width:auto;padding:4px 10px;font-size:12px;color:#d97706;border-color:#d97706;" onclick="PageMedEdit.endMed('${m.id}','${m.name.replace(/'/g, "\\'")}')"><i class="fas fa-stop-circle"></i> 结束用药</button>
                    <button class="btn-outline" style="width:auto;padding:4px 10px;font-size:12px;color:#dc2626;border-color:#dc2626;" onclick="PageMedEdit.deleteMed('${m.id}','${m.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i> 删除</button>
                </div>
                <div id="editForm-${m.id}" style="display:none;margin-top:10px;"></div>
            </div>`;
            }).join('');
        } catch (err) {
            console.error('用药编辑加载失败:', err);
            el.innerHTML = `<p style="color:#dc2626;">加载失败: ${err.message || err}</p>`;
        }
    },

    showEditForm(medId) {
        const container = document.getElementById('editForm-' + medId);
        if (!container) return;
        if (container.style.display !== 'none') { container.style.display = 'none'; return; }

        // 先获取当前用药详情
        Api.medications.get(medId).then(res => {
            const m = res.medication;
            const timesStr = (m.times || []).join(', ');
            container.style.display = 'block';
            container.innerHTML = `
            <div style="border-top:1px solid #eee;padding-top:10px;">
                <div style="font-weight:600;margin-bottom:8px;">修改用药</div>
                <div class="form-group"><label class="form-label">药品名称</label><input class="form-input" id="ef-name-${medId}" value="${m.name || ''}"></div>
                <div class="form-group"><label class="form-label">每次剂量</label><input class="form-input" id="ef-dose-${medId}" value="${m.dose || ''}"></div>
                <div class="form-group"><label class="form-label">频次</label><input class="form-input" id="ef-freq-${medId}" value="${m.frequency || ''}" placeholder="如: 每日2次"></div>
                <div class="form-group"><label class="form-label">服药时间</label><input class="form-input" id="ef-times-${medId}" value="${timesStr}" placeholder="如: 08:00, 20:00"></div>
                <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="ef-note-${medId}" value="${m.note || ''}"></div>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button class="btn-primary" style="flex:1;" onclick="PageMedEdit.saveEdit('${medId}')">保存</button>
                    <button class="btn-outline" style="flex:1;" onclick="document.getElementById('editForm-${medId}').style.display='none'">取消</button>
                </div>
            </div>`;
        }).catch(err => { container.innerHTML = `<p class="text-muted">获取详情失败</p>`; });
    },

    async saveEdit(medId) {
        const name = document.getElementById('ef-name-' + medId)?.value;
        const dose = document.getElementById('ef-dose-' + medId)?.value;
        const frequency = document.getElementById('ef-freq-' + medId)?.value;
        const timesStr = document.getElementById('ef-times-' + medId)?.value;
        const note = document.getElementById('ef-note-' + medId)?.value;

        const times = timesStr ? timesStr.split(/[,，\s]+/).filter(t => t) : undefined;

        try {
            // 保存历史：先获取旧用药，记录到历史
            const oldRes = await Api.medications.get(medId);
            const oldMed = oldRes.medication;

            await Api.medications.update(medId, { name, dose, frequency, times, note });

            // 保存历史记录（用 addMedication 添加一条 status=ended 的记录作为快照）
            await Api.medications.add({
                elderId: oldMed.elderId,
                name: oldMed.name,
                dose: oldMed.dose,
                frequency: oldMed.frequency,
                times: oldMed.times,
                startDate: oldMed.startDate,
                endDate: oldMed.endDate || new Date().toISOString().slice(0, 10),
                note: '[历史] ' + (oldMed.note || ''),
                reminder: false,
                status: 'ended'
            });

            App.toast('已保存，历史记录已归档');
            PageMedEdit.loadContent();
        } catch (err) {
            App.toast('保存失败: ' + err.message);
        }
    },

    async endMed(medId, medName) {
        if (!confirm(`确定结束「${medName}」的用药？\n当前用药安排将被归档到历史记录。`)) return;
        try {
            const oldRes = await Api.medications.get(medId);
            const oldMed = oldRes.medication;
            const today = new Date().toISOString().slice(0, 10);

            // 将当前用药标记为 ended
            await Api.medications.update(medId, { status: 'ended', endDate: today });

            App.toast('用药已结束，已归档到历史记录');
            PageMedEdit.loadContent();
        } catch (err) {
            App.toast('操作失败: ' + err.message);
        }
    },

    async deleteMed(medId, medName) {
        if (!confirm(`确定删除「${medName}」？\n删除后不可恢复！`)) return;
        try {
            await Api.medications.delete(medId);
            App.toast('已删除');
            PageMedEdit.loadContent();
        } catch (err) {
            App.toast('删除失败: ' + err.message);
        }
    }
};

// ---------- 用药历史 ----------
const PageMedHistory = {
    selectedYear: null,
    selectedMonth: null,

    render() {
        const now = new Date();
        if (!this.selectedYear) this.selectedYear = now.getFullYear();
        if (!this.selectedMonth) this.selectedMonth = now.getMonth() + 1;
        PageMedHistory.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>用药历史</h2>
        </div>
        <div id="medHistoryContent"><p class="text-muted" style="text-align:center;padding:40px;">加载中...</p></div>`;
    },

    // 判断某用药在指定年月是否活跃
    isActiveInMonth(med, year, month) {
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0); // 月末
        const start = med.startDate ? new Date(med.startDate) : null;
        const end = med.endDate ? new Date(med.endDate) : null;
        // 用药开始日期 <= 月末 且 (结束日期为空 或 结束日期 >= 月初)
        if (start && start > monthEnd) return false;
        if (end && end < monthStart) return false;
        return true;
    },

    async loadContent() {
        const memberId = App.state.currentMemberId;

        try {
            if (!memberId) {
                const el0 = document.getElementById('medHistoryContent');
                if (el0) el0.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">请先选择一位家庭成员</p>';
                return;
            }

            const allRes = await Api.medications.getAll(memberId);
            const allMeds = allRes.medications || [];

            const el = document.getElementById('medHistoryContent');
            if (!el) return;

            const year = this.selectedYear;
            const month = this.selectedMonth;

            // 计算可选年份范围
            const now = new Date();
            const curYear = now.getFullYear();
            let minYear = curYear;
            allMeds.forEach(m => { if (m.startDate) { const y = new Date(m.startDate).getFullYear(); if (y < minYear) minYear = y; } });
            const years = [];
            for (let y = curYear; y >= minYear; y--) years.push(y);

            // 筛选当月用药
            const monthMeds = allMeds.filter(m => this.isActiveInMonth(m, year, month));

            // 月份选择器
            let html = `
            <div class="card" style="display:flex;align-items:center;gap:8px;padding:10px 14px;margin-bottom:8px;">
                <i class="fas fa-calendar-alt" style="color:#2b7a78;"></i>
                <select id="histYear" style="border:1px solid #ddd;border-radius:6px;padding:4px 8px;font-size:14px;" onchange="PageMedHistory.onMonthChange()">`;
            years.forEach(y => { html += `<option value="${y}" ${y === year ? 'selected' : ''}>${y}年</option>`; });
            html += `</select>
                <select id="histMonth" style="border:1px solid #ddd;border-radius:6px;padding:4px 8px;font-size:14px;" onchange="PageMedHistory.onMonthChange()">`;
            for (let m = 1; m <= 12; m++) { html += `<option value="${m}" ${m === month ? 'selected' : ''}>${m}月</option>`; }
            html += `</select>
                <button class="btn-outline" style="width:auto;padding:3px 8px;font-size:12px;margin-left:auto;" onclick="PageMedHistory.goToday()">本月</button>
            </div>`;

            // 标题
            const isActive = (year === curYear && month === now.getMonth() + 1);
            html += `<div class="card-title" style="margin:4px 0;font-size:15px;">
                <i class="fas fa-pills" style="color:${isActive ? '#2b7a78' : '#94a3b8'};"></i>
                ${year}年${month}月用药 (${monthMeds.length})
            </div>`;

            if (monthMeds.length === 0) {
                html += '<p class="text-muted" style="text-align:center;padding:20px;">该月份暂无用药记录</p>';
            } else {
                // 按状态排序：active 在前，ended 在后
                monthMeds.sort((a, b) => {
                    if (a.status === 'active' && b.status !== 'active') return -1;
                    if (a.status !== 'active' && b.status === 'active') return 1;
                    return 0;
                });
                monthMeds.forEach(m => {
                    const times = (m.times || []).join(', ');
                    const ended = m.status === 'ended';
                    const noteDisplay = m.note && m.note.startsWith('[历史]') ? m.note.replace('[历史] ', '') : m.note;
                    html += `<div class="card" style="margin-bottom:6px;padding:10px 14px;${ended ? 'background:#f8fafc;' : ''}">
                        <div style="font-weight:600;${ended ? 'color:#64748b;' : ''}">${m.name}
                            ${ended ? '<span class="badge" style="background:#e2e8f0;color:#64748b;">已结束</span>' : '<span class="badge" style="background:#d1fae5;color:#059669;">服用中</span>'}
                        </div>
                        <div class="text-muted" style="font-size:12px;">${m.dose || ''} · ${m.frequency || ''} · ${times || '未设置'}</div>
                        <div class="text-muted" style="font-size:12px;">${m.startDate ? '开始: ' + m.startDate : ''}${m.endDate ? ' → 结束: ' + m.endDate : ''}</div>
                        ${noteDisplay ? `<div class="text-muted" style="font-size:12px;">备注: ${noteDisplay}</div>` : ''}
                    </div>`;
                });
            }

            el.innerHTML = html;
        } catch (err) {
            console.error('用药历史加载失败:', err);
            const errEl = document.getElementById('medHistoryContent');
            if (errEl) errEl.innerHTML = `<p style="color:#dc2626;">加载失败: ${err.message || err}</p>`;
        }
    },

    onMonthChange() {
        const yEl = document.getElementById('histYear');
        const mEl = document.getElementById('histMonth');
        if (yEl) this.selectedYear = parseInt(yEl.value);
        if (mEl) this.selectedMonth = parseInt(mEl.value);
        this.loadContent();
    },

    goToday() {
        const now = new Date();
        this.selectedYear = now.getFullYear();
        this.selectedMonth = now.getMonth() + 1;
        this.loadContent();
    }
};
