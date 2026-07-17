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
            <div class="card-title"><i class="fas fa-pills"></i> 今日用药安排</div>
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
                            <div class="name" style="cursor:pointer;color:#2b7a78;" onclick="App.viewDrugInfo('${m.name.replace(/'/g, "\\'")}','','')">${m.name}</div>
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
        </div>`;
    },

    async loadContent(memberId) {
        try {
            const res = await Api.records.getAll(memberId);
            const records = res.records || [];
            const medicalRecords = records.filter(r => r.type !== '检查报告');
            const reports = records.filter(r => r.type === '检查报告');

            const recordsEl = document.getElementById('recordsList');
            const reportsEl = document.getElementById('reportsList');
            if (!recordsEl || !reportsEl) return;

            if (medicalRecords.length === 0) {
                recordsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无病历记录</p>';
            } else {
                recordsEl.innerHTML = medicalRecords.map(r => `
                    <div class="record-item" onclick="App.viewRecord('${r.id}')">
                        <span class="date">${r.visitDate || ''}</span>
                        <div class="title">${r.type || '病历'} · ${r.diagnosis || '未填写'}</div>
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
        } catch (err) {
            const recordsEl = document.getElementById('recordsList');
            const reportsEl = document.getElementById('reportsList');
            if (recordsEl) recordsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
            if (reportsEl) reportsEl.innerHTML = '';
        }
    }
};

// ---------- 病历/报告详情 ----------
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
            const isReport = r.type === '检查报告';
            const el = document.getElementById('recordDetailContent');
            if (!el) return;

            if (isReport) {
                // 报告类型：显示检查所见、报告结论
                el.innerHTML = `
                <div class="card">
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">检查报告 · ${r.visitDate || ''}</div>
                    <div class="text-muted" style="margin-top:4px;">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}</div>
                </div>
                ${r.findings ? `<div class="card"><div class="card-title"><i class="fas fa-microscope"></i> 检查所见</div><p style="white-space:pre-wrap;line-height:1.8;">${r.findings}</p></div>` : ''}
                ${r.conclusion ? `<div class="card"><div class="card-title"><i class="fas fa-clipboard-check"></i> 报告结论</div><p style="white-space:pre-wrap;line-height:1.8;">${r.conclusion}</p></div>` : ''}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此报告</button>`;
            } else {
                // 病历类型：显示主诉、检查指标、医嘱
                const metricsHtml = (r.metrics || []).map(m => `
                    <div class="metric-row">
                        <span class="metric-name">${m.name}</span>
                        <span class="metric-value ${m.abnormal ? 'abnormal' : ''}">${m.value} ${m.unit || ''} ${m.abnormal ? '↑' : ''}</span>
                        <span class="text-muted" style="font-size:12px;">${m.ref || ''}</span>
                    </div>`).join('');
                el.innerHTML = `
                <div class="card">
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">${r.type || ''} · ${r.visitDate || ''}</div>
                    <div class="text-muted" style="margin-top:4px;">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}</div>
                    ${r.chiefComplaint ? `<div style="margin-top:12px;"><strong>主诉：</strong>${r.chiefComplaint}</div>` : ''}
                </div>
                ${metricsHtml ? `<div class="card"><div class="card-title"><i class="fas fa-chart-bar"></i> 检查指标</div>${metricsHtml}</div>` : ''}
                ${r.orders ? `<div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 医嘱</div><p>${r.orders}</p></div>` : ''}
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
                    return `<div class="drug-item">
                        <div class="drug-icon"><i class="fas ${icon}"></i></div>
                        <div class="drug-info">
                            <div class="dname" style="cursor:pointer;color:#2b7a78;" onclick="App.viewDrugInfo('${d.name.replace(/'/g, "\\'")}','${(d.specification || '').replace(/'/g, "\\'")}','${(d.manufacturer || '').replace(/'/g, "\\'")}')">${d.name}</div>
                            <div class="dexp">📅 过期: ${d.expiryDate || '未设置'} ${statusHtml}</div>
                            ${d.specification ? `<div class="qty">${d.quantity || 1}盒 · ${d.specification}${d.manufacturer ? ' · ' + d.manufacturer : ''}</div>` : `<div class="qty">数量: ${d.quantity || 1}${d.manufacturer ? ' · ' + d.manufacturer : ''}</div>`}
                        </div>
                        <button style="background:none;border:none;color:#b91c1c;cursor:pointer;padding:8px;" onclick="App.deleteDrug('${d.id}')"><i class="fas fa-trash"></i></button>
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
            <div class="form-group"><label>药品名称 *</label><input id="medName" placeholder="如：苯磺酸氨氯地平片"></div>
            <div class="form-group"><label>剂量</label><input id="medDose" placeholder="如：5mg"></div>
            <div class="form-group"><label>频次</label><select id="medFreq"><option>每日1次</option><option>每日2次</option><option>每日3次</option><option>每晚1次</option></select></div>
            <div class="form-group"><label>服用时间（逗号分隔）</label><input id="medTimes" placeholder="如：08:00, 20:00"></div>
            <div class="form-group"><label>开始日期</label><input id="medStart" type="date"></div>
            <div class="form-group"><label>备注</label><textarea id="medNote" placeholder="服用注意事项"></textarea></div>
            <button class="btn-primary" onclick="App.saveMed()">保存</button>
        </div>`;
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
            <div class="form-group"><label>关联成员 *</label><select id="recordElderId">${memberOptions}</select></div>
            <div class="form-group"><label>类型</label><select id="recordType" onchange="PageAddRecord.onTypeChange(this.value)"><option value="病历">病历</option><option value="检查报告">检查报告</option><option value="处方">处方</option></select></div>
            <div id="recordFieldsMedical">
                <div class="form-group"><label id="recordDateLabel">就诊日期</label><input id="recordDate" type="date"></div>
                <div class="form-group"><label>医院</label><input id="recordHospital" placeholder="医院名称"></div>
                <div class="form-group"><label>科室</label><input id="recordDept" placeholder="科室"></div>
                <div class="form-group"><label>主诉</label><textarea id="recordComplaint" placeholder="主要症状"></textarea></div>
                <div class="form-group"><label>诊断 *</label><input id="recordDiagnosis" placeholder="诊断结果"></div>
                <div class="form-group"><label>医嘱</label><textarea id="recordOrders" placeholder="医嘱内容"></textarea></div>
            </div>
            <div id="recordFieldsReport" style="display:none;">
                <div class="form-group"><label>检查日期</label><input id="recordDate2" type="date"></div>
                <div class="form-group"><label>医院</label><input id="recordHospital2" placeholder="医院名称"></div>
                <div class="form-group"><label>科室</label><input id="recordDept2" placeholder="科室"></div>
                <div class="form-group"><label>检查项目 *</label><input id="recordExamName" placeholder="如：胸部CT平扫"></div>
                <div class="form-group"><label>检查所见</label><textarea id="recordFindings" rows="4" placeholder="检查所见内容"></textarea></div>
                <div class="form-group"><label>报告结论</label><textarea id="recordConclusion" rows="3" placeholder="报告结论内容"></textarea></div>
            </div>
            <div id="recordFieldsPrescription" style="display:none;">
                <div class="form-group"><label>开始日期</label><input id="recordDate3" type="date"></div>
                <div style="background:#f8fafd;border-radius:12px;padding:12px;margin-bottom:8px;">
                    <div class="form-group"><label>药品名称 *</label><input id="recordMedName" placeholder="如：阿莫西林胶囊"></div>
                    <div class="form-group"><label>剂量</label><input id="recordMedDose" placeholder="如：5mg"></div>
                    <div class="form-group"><label>频次</label><input id="recordMedFreq" placeholder="如：每日1次"></div>
                    <div class="form-group"><label>备注</label><input id="recordMedNote" placeholder="如：餐后服用"></div>
                </div>
            </div>
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
        } else {
            medicalFields.style.display = 'block';
            reportFields.style.display = 'none';
            prescriptionFields.style.display = 'none';
        }
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
            <div class="form-group"><label>药品名称 *</label><input id="drugName" placeholder="如：阿莫西林胶囊"></div>
            <div class="form-group"><label>规格</label><input id="drugSpec" placeholder="如：20粒/盒"></div>
            <div class="form-group"><label>厂商</label><input id="drugManufacturer" placeholder="如：扬子江药业"></div>
            <div class="form-group"><label>数量</label><input id="drugQty" type="number" value="1" min="1"></div>
            <div class="form-group"><label>有效期</label><input id="drugExp" type="date"></div>
            <div class="form-group"><label>备注</label><textarea id="drugNote" placeholder="备注信息"></textarea></div>
            <button class="btn-primary" onclick="App.saveDrug()">保存</button>
        </div>`;
    }
};

// ---------- 药品说明书 ----------
const DRUG_INFO_DB = {
    '苯磺酸氨氯地平片': { generic: '氨氯地平', category: '钙通道阻滞剂 (CCB)', indication: '高血压、心绞痛', contraindication: '对二氢吡啶类钙通道阻滞剂过敏者禁用。严重低血压、主动脉瓣狭窄、心力衰竭患者慎用。', dosage: '通常起始剂量5mg，每日1次，最大剂量10mg/日。老年或肝功能不全患者建议从2.5mg开始。', adverseReaction: '常见：头痛、水肿、头晕、面部潮红、心悸。少见：恶心、腹痛、嗜睡、牙龈增生。', interaction: '与CYP3A4强抑制剂(如克拉霉素、伊曲康唑)合用可升高血药浓度；与辛伐他汀合用需限制辛伐他汀剂量≤20mg/日。', precaution: '1.定期监测血压\n2.不可突然停药\n3.肝功能不全者减量\n4.孕妇及哺乳期妇女慎用', storage: '遮光，密封，25°C以下保存。' },
    '二甲双胍缓释片': { generic: '二甲双胍', category: '双胍类降糖药', indication: '2型糖尿病，尤其肥胖患者的一线用药', contraindication: '1.肾功能不全(eGFR<30)\n2.代谢性酸中毒\n3.严重感染或缺氧状态\n4.酒精中毒\n5.碘造影检查前后48小时停用', dosage: '起始500mg每日1次，晚餐时服用。可逐步增至最大2000mg/日。', adverseReaction: '常见：恶心、腹泻、腹痛、食欲不振。罕见但严重：乳酸酸中毒(呕吐、呼吸困难、肌肉痛)。', interaction: '与酒精合用增加乳酸酸中毒风险；与碘造影剂合用需提前48小时停药；西咪替丁可升高其血药浓度。', precaution: '1.餐中或餐后服用减少胃肠反应\n2.每年监测肾功能和维生素B12\n3.碘造影前停药48小时，后复查肾功能再决定是否恢复\n4.缓释片不可碾碎或咀嚼', storage: '遮光，密封，30°C以下保存。' },
    '阿托伐他汀钙片': { generic: '阿托伐他汀', category: 'HMG-CoA还原酶抑制剂 (他汀类)', indication: '高脂血症、混合性高脂血症、动脉粥样硬化性心血管病预防', contraindication: '1.活动性肝病或转氨酶持续升高\n2.孕妇及哺乳期妇女\n3.对本品过敏者', dosage: '常用10-20mg，每晚1次。可增至最大80mg/日。', adverseReaction: '常见：便秘、腹胀、腹痛、肌痛。少见：转氨酶升高。罕见但严重：横纹肌溶解(肌肉剧痛、酱油色尿)。', interaction: '与克拉霉素、伊曲康唑合用增加横纹肌溶解风险；与氨氯地平合用需注意剂量调整；避免与吉非贝齐合用。', precaution: '1.睡前服用效果最佳\n2.出现肌肉疼痛无力立即就医\n3.定期监测肝功能和肌酸激酶\n4.不可与西柚汁同服', storage: '遮光，密封，30°C以下保存。' },
    '阿莫西林胶囊': { generic: '阿莫西林', category: 'β-内酰胺类抗生素 (青霉素类)', indication: '敏感菌所致感染：上呼吸道感染、泌尿道感染、皮肤软组织感染、幽门螺杆菌根除治疗', contraindication: '1.青霉素过敏者禁用\n2.传染性单核细胞增多症患者禁用(易出皮疹)', dosage: '成人一般0.5g，每8小时1次。幽门螺杆菌根除：1g，每日2次，联合用药。', adverseReaction: '常见：恶心、呕吐、腹泻。少见：皮疹、药物热。罕见：过敏性休克。', interaction: '与丙磺舒合用可升高血药浓度；与别嘌醇合用增加皮疹风险；可降低口服避孕药效果。', precaution: '1.用前确认无青霉素过敏史\n2.完整疗程7-10天，不可症状好转即停药\n3.餐后服用减少胃肠反应\n4.服药期间多饮水', storage: '遮光，密封，阴凉干燥处保存。' },
    '硝苯地平缓释片': { generic: '硝苯地平', category: '钙通道阻滞剂 (CCB)', indication: '高血压、心绞痛', contraindication: '1.对二氢吡啶类过敏者\n2.心源性休克\n3.不稳定型心绞痛禁用速释剂型', dosage: '起始30mg每日1次，可增至60mg/日。缓释片整片吞服，不可掰开或碾碎。', adverseReaction: '常见：头痛、踝部水肿、面部潮红、心悸。少见：牙龈增生、反射性心动过速。', precaution: '1.缓释片必须整片吞服\n2.避免与西柚汁同服\n3.长期用药不可突然停药\n4.定期监测血压和心率', interaction: '与CYP3A4抑制剂合用可升高血药浓度；与β受体阻滞剂合用注意低血压和心衰；避免与利福平合用。', storage: '遮光，密封，30°C以下保存。' },
};

const PageDrugInfo = {
    render() {
        const drugName = App.state.currentDrugName || '';
        const drugSpec = App.state.currentDrugSpec || '';
        const drugManufacturer = App.state.currentDrugManufacturer || '';
        const info = DRUG_INFO_DB[drugName];
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
                ${info ? `<div class="text-muted" style="font-size:0.9em;">通用名: ${info.generic} | 类别: ${info.category}</div>` : ''}
            </div>
            ${info ? `
            <div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 适应症</div><p style="white-space:pre-wrap;">${info.indication}</p></div>
            <div class="card"><div class="card-title" style="color:#dc2626;"><i class="fas fa-ban"></i> 禁忌</div><p style="white-space:pre-wrap;color:#dc2626;">${info.contraindication}</p></div>
            <div class="card"><div class="card-title"><i class="fas fa-prescription-bottle-alt"></i> 用法用量</div><p style="white-space:pre-wrap;">${info.dosage}</p></div>
            <div class="card"><div class="card-title" style="color:#d97706;"><i class="fas fa-exclamation-triangle"></i> 不良反应</div><p style="white-space:pre-wrap;">${info.adverseReaction}</p></div>
            <div class="card"><div class="card-title"><i class="fas fa-exchange-alt"></i> 药物相互作用</div><p style="white-space:pre-wrap;">${info.interaction}</p></div>
            <div class="card"><div class="card-title"><i class="fas fa-info-circle"></i> 注意事项</div><p style="white-space:pre-wrap;">${info.precaution}</p></div>
            <div class="card"><div class="card-title"><i class="fas fa-temperature-low"></i> 贮藏</div><p style="white-space:pre-wrap;">${info.storage}</p></div>
            ` : `
            <div class="card"><p class="text-muted" style="text-align:center;padding:20px;">暂无「${drugName}」的说明书数据<br><span style="font-size:0.85em;">当前收录常见药品说明书，持续补充中</span></p></div>
            `}
        </div>`;
    },

    setFont(size) {
        const el = document.getElementById('drugInfoContent');
        if (!el) return;
        const sizes = { small: '13px', medium: '15px', large: '20px' };
        el.style.fontSize = sizes[size] || '15px';
        // 更新按钮样式
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
