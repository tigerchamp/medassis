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
                            <div class="name">${m.name}</div>
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
        </div>`;
    },

    async loadContent(memberId) {
        try {
            const res = await Api.records.getAll(memberId);
            const records = res.records || [];
            const el = document.getElementById('recordsList');
            if (!el) return;
            if (records.length === 0) {
                el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无病历记录</p>';
                return;
            }
            el.innerHTML = records.map(r => `
                <div class="record-item" onclick="App.viewRecord('${r.id}')">
                    <span class="date">${r.visitDate || ''}</span>
                    <div class="title">${r.type || '病历'} · ${r.diagnosis || '未填写'}</div>
                    <div class="sub">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}</div>
                </div>`).join('');
        } catch (err) {
            const el = document.getElementById('recordsList');
            if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    }
};

// ---------- 病历详情 ----------
const PageRecordDetail = {
    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('records')"><i class="fas fa-arrow-left"></i></button>
            <h2>病历详情</h2>
        </div>
        <div id="recordDetailContent"><p class="text-muted" style="text-align:center;padding:40px;">加载中...</p></div>`;
    },

    async loadContent() {
        const id = App.state.currentRecordId;
        try {
            const res = await Api.records.get(id);
            const r = res.record;
            const metricsHtml = (r.metrics || []).map(m => `
                <div class="metric-row">
                    <span class="metric-name">${m.name}</span>
                    <span class="metric-value ${m.abnormal ? 'abnormal' : ''}">${m.value} ${m.unit || ''} ${m.abnormal ? '↑' : ''}</span>
                    <span class="text-muted" style="font-size:12px;">${m.ref || ''}</span>
                </div>`).join('');
            const el = document.getElementById('recordDetailContent');
            if (!el) return;
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
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-camera-retro"></i> 拍照录入药品</div>
            <div class="scan-area" onclick="App.openScanSelector()">
                <i class="fas fa-barcode"></i>
                <p>扫描药盒 / 拍照识别</p>
            </div>
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
                            <div class="dname">${d.name}</div>
                            <div class="dexp">📅 过期: ${d.expiryDate || '未设置'} ${statusHtml}</div>
                            ${d.specification ? `<div class="qty">${d.quantity || 1}盒 · ${d.specification}</div>` : `<div class="qty">数量: ${d.quantity || 1}</div>`}
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
        if (!user) return '';
        return `
        <div class="card">
            <div class="flex" style="gap:16px;margin-bottom:12px;">
                <div style="font-size:48px;color:#2b7a78;"><i class="fas fa-user-circle"></i></div>
                <div>
                    <div style="font-weight:700;font-size:20px;">${user.name}</div>
                    <div class="text-muted">${user.role === 'admin' ? '管理员' : '成员'} · ${user.phone || '未绑定手机'}</div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-cog"></i> 设置</div>
            <div style="cursor:pointer;display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f1f5f9;" onclick="App.switchPage('family')">
                <i class="fas fa-users" style="width:24px;color:#2b7a78;"></i>
                <div style="flex:1;"><div style="font-weight:600;">家庭组管理</div><div class="text-muted">管理家庭组、邀请家人、授权管理</div></div>
                <i class="fas fa-chevron-right" style="color:#94a3b8;"></i>
            </div>
        </div>
        <button class="btn-danger" onclick="App.logout()">退出登录</button>`;
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

// ---------- 家庭组管理（合并成员档案到家庭成员区块）----------
const PageFamily = {
    render() {
        const family = App.state.family;
        const familyName = family ? family.name : '我的家庭';
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>家庭组管理</h2>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-home"></i> 家庭组信息</div>
            <div class="form-group"><label>家庭组名称</label><div style="display:flex;gap:8px;"><input id="familyNameInput" value="${familyName}" style="flex:1;"><button class="btn-outline" style="width:auto;padding:8px 16px;font-size:13px;white-space:nowrap;" onclick="App.updateFamilyName()">保存</button></div></div>
            ${family && family.invite_code ? `<div class="form-group"><label>邀请码</label><div style="display:flex;align-items:center;gap:8px;"><span style="font-family:monospace;font-size:16px;letter-spacing:2px;background:#eef2f6;padding:8px 16px;border-radius:8px;flex:1;" id="familyInviteCode">${family.invite_code}</span><button class="btn-outline" style="width:auto;padding:8px 16px;font-size:13px;" onclick="App.copyInviteCode()">复制</button></div></div>` : ''}
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-users"></i> 家庭成员</div>
            <div id="familyMembersList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>
        <button class="btn-primary" style="margin-top:8px;" onclick="App.switchPage('invite')"><i class="fas fa-user-plus"></i> 邀请家人加入</button>`;
    },

    async loadContent() {
        try {
            // 加载家庭成员（users表）
            const res = await Api.auth.familyMembers();
            const members = res.members || [];
            // 加载成员档案（elders表）
            const elders = App.state.members || [];

            const membersEl = document.getElementById('familyMembersList');
            if (membersEl) {
                if (members.length === 0 && elders.length === 0) {
                    membersEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无家庭成员</p>';
                } else {
                    // 合并：遍历所有成员，匹配其elders档案信息
                    const relationMap = { self: '本人', parent: '父母', spouse_parent: '公婆/岳父母', spouse: '配偶', other: '其他' };
                    membersEl.innerHTML = members.map(m => {
                        const isCurrent = App.state.user && m.id === App.state.user.id;
                        // 查找该用户对应的elder档案
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
            const membersEl = document.getElementById('familyMembersList');
            if (membersEl) membersEl.innerHTML = '<p class="text-muted" style="text-align:center;">加载失败</p>';
        }
    }
};

// ---------- 邀请页 ----------
const PageInvite = {
    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('family')"><i class="fas fa-arrow-left"></i></button>
            <h2>邀请家人</h2>
        </div>
        <div class="invite-card">
            <div style="width:140px;height:140px;background:#e9edf2;margin:16px auto;display:flex;align-items:center;justify-content:center;border-radius:20px;">
                <i class="fas fa-qrcode" style="font-size:80px;color:#2b7a78;"></i>
            </div>
            <p style="font-weight:600;font-size:18px;">扫描二维码加入家庭</p>
            <div style="background:#eef2f6;border-radius:40px;padding:12px;margin:12px 0;">
                <span class="invite-code-text" style="font-family:monospace;font-size:14px;letter-spacing:2px;" id="inviteCodeDisplay">加载中...</span>
                <br><button class="btn-outline" style="width:auto;padding:6px 20px;margin-top:8px;font-size:13px;" onclick="App.copyInviteCode()">复制邀请码</button>
            </div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-sign-in-alt"></i> 通过邀请码加入</div>
            <div class="form-group"><input id="joinCode" placeholder="输入邀请码"></div>
            <button class="btn-primary" onclick="App.joinFamily()">加入家庭</button>
        </div>`;
    },

    async loadContent() {
        try {
            const profileRes = await Api.auth.profile();
            if (profileRes.family && profileRes.family.invite_code) {
                const el = document.getElementById('inviteCodeDisplay');
                if (el) el.textContent = profileRes.family.invite_code;
            }
        } catch {}
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
            <div class="form-group"><label>类型</label><select id="recordType"><option>病历</option><option>检查报告</option><option>药方</option></select></div>
            <div class="form-group"><label>就诊日期</label><input id="recordDate" type="date"></div>
            <div class="form-group"><label>医院</label><input id="recordHospital" placeholder="医院名称"></div>
            <div class="form-group"><label>科室</label><input id="recordDept" placeholder="科室"></div>
            <div class="form-group"><label>主诉</label><textarea id="recordComplaint" placeholder="主要症状"></textarea></div>
            <div class="form-group"><label>诊断 *</label><input id="recordDiagnosis" placeholder="诊断结果"></div>
            <div class="form-group"><label>医嘱</label><textarea id="recordOrders" placeholder="医嘱内容"></textarea></div>
            <button class="btn-primary" onclick="App.saveRecord()">保存</button>
        </div>`;
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
            <div class="form-group"><label>数量</label><input id="drugQty" type="number" value="1" min="1"></div>
            <div class="form-group"><label>有效期</label><input id="drugExp" type="date"></div>
            <div class="form-group"><label>备注</label><textarea id="drugNote" placeholder="备注信息"></textarea></div>
            <button class="btn-primary" onclick="App.saveDrug()">保存</button>
        </div>`;
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
                        <div class="text-muted">${e.gender || '男'} · ${e.age || '-'}岁 · ${relationMap[e.relation] || '其他'}</div>
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
