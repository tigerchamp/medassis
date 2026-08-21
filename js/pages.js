// ========== 辅助函数 ==========

// 根据出生日期计算当前年龄
function calcAge(birthDate) {
    if (!birthDate) return null;
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
}

// 格式化日期为 YYYY-MM-DD
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 格式化日期时间为 YYYY-MM-DD HH:mm
function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
}

// HTML 转义，防止 XSS/显示错乱
function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 格式化数值：去除多余的0（5.000 → 5, 2.500 → 2.5）
function cleanNumber(n) {
    if (n == null) return '';
    const num = Number(n);
    return num % 1 === 0 ? String(num) : String(parseFloat(num.toFixed(3)));
}

// 格式化药品用量显示：5mg + 1次/日 → "5mg 1次/日"
function formatMedUsage(m) {
    const parts = [];
    if (m.doseAmount) {
        const unit = m.doseUnit || '';
        parts.push(cleanNumber(m.doseAmount) + unit);
    }
    if (m.frequency != null) {
        const freq = Number(m.frequency);
        if (freq > 0) {
            parts.push(freq + '次/日');
        }
    }
    return parts.join(' ') || '';
}

// 根据药品名称（剂型关键字）选择合适的 FontAwesome 图标
function getDrugIcon(name) {
    const n = String(name || '');
    if (/注射|注射液|注射剂/.test(n)) return 'fa-syringe';
    if (/口服液|口服溶液|糖浆|合剂|滴剂|混悬液|溶液/.test(n)) return 'fa-prescription-bottle-medical';
    if (/胶囊|软胶囊/.test(n)) return 'fa-capsules';
    if (/片|肠溶片|分散片|咀嚼片|含片|泡腾片/.test(n)) return 'fa-tablets';
    if (/丸|滴丸|浓缩丸|水蜜丸|颗粒|冲剂/.test(n)) return 'fa-circle-dot'; // 丸/颗粒用圆点图标
    return 'fa-capsules'; // 兜底
}

// 轻量 markdown 渲染：支持 GFM 表格（化验单指标表），其余按段落保留换行
// 用于检查报告详情页展示"检查所见"（验血化验单整理为表格后存储为 markdown）
function renderMarkdown(md) {
    if (!md) return '';
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const lines = md.split(/\r?\n/);
    let html = '';
    let buf = [];
    const flush = () => {
        if (buf.length) {
            html += `<p style="white-space:pre-wrap;line-height:1.8;margin:0;">${esc(buf.join('\n'))}</p>`;
            buf = [];
        }
    };
    let i = 0;
    while (i < lines.length) {
        if (/^\s*\|/.test(lines[i])) {
            flush();
            const tlines = [];
            while (i < lines.length && /^\s*\|/.test(lines[i])) {
                tlines.push(lines[i].replace(/^\s+|\s+$/g, ''));
                i++;
            }
            html += renderMdTable(tlines, esc);
        } else {
            buf.push(lines[i]);
            i++;
        }
    }
    flush();
    return html;
}

// 渲染 markdown 表格行为 HTML <table>，样式与项目差异对比表保持一致
function renderMdTable(tlines, esc) {
    if (tlines.length < 2) return tlines.map(l => `<p style="white-space:pre-wrap;">${esc(l)}</p>`).join('');
    const splitRow = (l) => {
        let s = l.trim();
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        // 先用占位符保护转义的 \|，再按 | 分割，最后还原（兼容用户手写的转义管道符）
        const PH = '\u0001PIPE\u0001';
        return s.replace(/\\\|/g, PH).split('|').map(c => c.trim().replace(new RegExp(PH, 'g'), '|'));
    };
    const header = splitRow(tlines[0]);
    // 第二行须为分隔行（| :--- | ---: |），否则当作普通内容
    const sepCells = splitRow(tlines[1]);
    const isSep = sepCells.every(s => /^\s*:?-+:?\s*$/.test(s));
    if (!isSep) {
        return tlines.map(l => `<p style="white-space:pre-wrap;">${esc(l)}</p>`).join('');
    }
    const aligns = sepCells.map(s => {
        if (/^:-+:$/.test(s.trim())) return 'center';
        if (/^-+:$/.test(s.trim())) return 'right';
        return 'left';
    });
    const body = tlines.slice(2).map(splitRow);
    const ths = header.map((h, ci) => {
        const align = aligns[ci] === 'right' ? 'text-align:right;' : (aligns[ci] === 'center' ? 'text-align:center;' : 'text-align:left;');
        return `<th style="padding:8px 10px;${align}border:1px solid #e9ecef;background:#f8f9fa;font-weight:600;color:#495057;">${esc(h)}</th>`;
    }).join('');
    const trs = body.map(row => {
        const tds = header.map((_, ci) => {
            const v = row[ci] || '';
            const align = aligns[ci] === 'right' ? 'text-align:right;' : (aligns[ci] === 'center' ? 'text-align:center;' : 'text-align:left;');
            // 仅 ↑↓ 箭头表示异常高亮；* 是检验互认项目标记，< > 常出现在参考范围，均不高亮
            const color = /[↑↓]/.test(v) ? 'color:#d33;' : 'color:#333;';
            return `<td style="padding:8px 10px;${align}${color}border:1px solid #e9ecef;white-space:nowrap;">${esc(v)}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('');
    return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

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
                <span style="flex:1;"><i class="fas fa-pills"></i> 用药安排</span>
                <button class="btn-outline" style="width:auto;padding:3px 10px;font-size:12px;margin-left:8px;" onclick="App.switchPage('medEdit')"><i class="fas fa-edit"></i> 编辑</button>
                <button class="btn-outline" style="width:auto;padding:3px 10px;font-size:12px;margin-left:4px;" onclick="App.switchPage('medHistory')"><i class="fas fa-history"></i> 历史</button>
            </div>
            <div id="homeMeds"><p class="text-muted" style="text-align:center;padding:12px;">加载中...</p></div>
        </div>
        <div id="homeRefill"></div>
        <div id="homeRecent"></div>`;
    },

    async loadContent(memberId) {
        try {
            // 并行拉取：用药计划表 + 长期用药设置 + 药箱（用于长期用药提醒）
            const [medsRes, chronicRes, drugsRes] = await Promise.all([
                Api.medications.getAll(memberId, true),
                Api.drugs.getChronic(memberId).catch(() => ({ chronicMeds: [] })),
                Api.drugs.getAll().catch(() => ({ drugs: [] })),
            ]);
            const meds = medsRes.medications || [];
            const medsEl = document.getElementById('homeMeds');
            const refillEl = document.getElementById('homeRefill');

            if (meds.length === 0) {
                if (medsEl) medsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:12px;">暂无用药计划</p>';
            } else if (medsEl) {
                // 时间段分组（与处方表单 MedTimesUI.slots 一致：早/中/晚/睡前）
                const timeSlots = [
                    { key: 'morning', label: '早上', time: '08:00', meds: [] },
                    { key: 'noon',    label: '中午', time: '12:00', meds: [] },
                    { key: 'evening', label: '晚上', time: '18:00', meds: [] },
                    { key: 'night',   label: '睡前', time: '21:00', meds: [] },
                ];
                // 按小时归类到时间段（兜底，处理自定义时间）
                const slotByHour = (hour) => {
                    if (hour >= 5 && hour < 11) return 'morning';
                    if (hour >= 11 && hour < 14) return 'noon';
                    if (hour >= 14 && hour < 20) return 'evening';
                    return 'night';
                };
                // 用量文本：doseAmount+doseUnit，无则退回 dose（不显示频次）
                const doseText = (m) => {
                    if (m.doseAmount != null) return cleanNumber(m.doseAmount) + (m.doseUnit || '');
                    return m.dose || '';
                };
                // 将每个药品按其 times 数组放入对应时间段（一天 N 次则出现在 N 个时段）
                meds.forEach(m => {
                    const times = (m.times && m.times.length > 0) ? m.times : ['08:00'];
                    times.forEach(t => {
                        let key = null;
                        for (const s of timeSlots) { if (t === s.time) { key = s.key; break; } }
                        if (!key) key = slotByHour(parseInt(String(t).split(':')[0]) || 8);
                        const group = timeSlots.find(g => g.key === key);
                        if (group) group.meds.push(m);
                    });
                });
                const hasAny = timeSlots.some(g => g.meds.length > 0);
                if (!hasAny) {
                    medsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:12px;">暂无用药计划</p>';
                } else {
                    medsEl.innerHTML = timeSlots.map(g => {
                        if (g.meds.length === 0) return '';
                        return `<div class="time-group">
                            <div class="time-group-title"><span class="time-tag ${g.key}">${g.label} ${g.time}</span></div>
                            ${g.meds.map(m => `<div class="med-item">
                                <span class="med-name" style="cursor:pointer;color:#2b7a78;" onclick="App.viewDrugInfo('${m.name.replace(/'/g, "\\'")}','','','')">${m.name}</span>
                                <span class="med-usage">${doseText(m)}</span>
                            </div>`).join('')}
                        </div>`;
                    }).join('');
                }
            }

            // 真实计算剩余天数（递减）
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTs = today.getTime();
            const DAY_MS = 86400000;
            const DEFAULT_PER_DAY_PILLS = 3;
            const DEFAULT_PACK_DAYS = 30;

            const calcPackDays = (unitCapacity, perDayPills) => {
                const pillsPerDay = Math.max(1, perDayPills || DEFAULT_PER_DAY_PILLS);
                if (unitCapacity && unitCapacity > 0) {
                    return Math.max(1, Math.floor(unitCapacity / pillsPerDay));
                }
                return DEFAULT_PACK_DAYS;
            };

            // 长期用药倒计时：直接遍历 chronicList，用 cm.drug 的库存计算
            let medStats = [];
            const chronicList = (chronicRes && chronicRes.chronicMeds) || [];
            const allDrugs = (drugsRes && drugsRes.drugs) || [];

            // 药名 → medication（借用剂量信息）
            const medsByName = new Map();
            meds.filter(m => m.status === 'active').forEach(m => {
                if (!medsByName.has(m.name)) medsByName.set(m.name, m);
            });

            // 直接遍历长期用药，每个都显示
            chronicList.forEach(cm => {
                const d = cm.drug || {};
                const drugName = cm.drugName || d.name || '未命名药品';
                const qty = d.quantity || 0;
                const unitCapacity = d.unitCapacity;
                const unitCapacityUnit = d.unitCapacityUnit || '';
                const specDosageUnit = d.specDosageUnit || '';

                // 借用用药计划的剂量信息
                const mm = medsByName.get(drugName);
                const timesLen = (mm && mm.times && mm.times.length) ? mm.times.length : (mm && mm.frequency) || 2;
                const doseEach = (mm && mm.doseAmount != null) ? mm.doseAmount : 1;
                const perDayPills = timesLen * doseEach;

                // 起点：medication.startDate 优先，否则 drug.createdAt，否则今天
                let startDt = (mm && mm.startDate) ? new Date(mm.startDate)
                          : (d.createdAt ? new Date(d.createdAt) : new Date());
                startDt.setHours(0, 0, 0, 0);
                const daysUsed = Math.max(0, Math.floor((todayTs - startDt.getTime()) / DAY_MS));

                const packDays = calcPackDays(unitCapacity, perDayPills);
                const totalDays = Math.max(1, qty * packDays);
                const daysLeft = qty <= 0 ? 0 : Math.max(0, totalDays - daysUsed);
                const progress = Math.max(0, Math.min(100, (daysLeft / Math.max(1, totalDays)) * 100));

                const basis = unitCapacity
                    ? `按每日 ${timesLen} 次 × 每次 ${doseEach}${specDosageUnit || '片'} · 每盒 ${unitCapacity}${unitCapacityUnit || '片'} 估算`
                    : `按每盒约 ${packDays} 天 · 每日 ${timesLen} 次估算`;

                medStats.push({ name: drugName, daysLeft, progress, totalDays, basis });
            });

            // 没有长期用药时，回退到用药计划表
            if (chronicList.length === 0 && meds.length > 0) {
                const invByName = new Map();
                allDrugs.forEach(dr => { if (!invByName.has(dr.name)) invByName.set(dr.name, dr); });

                medStats = meds.filter(m => m.status === 'active').map(m => {
                    const mElderId = m.elderId || null;
                    if (mElderId && memberId && mElderId !== memberId) return null;
                    if (!mElderId && memberId) return null;
                    const timesLen = (m.times && m.times.length > 0) ? m.times.length : (m.frequency || 1);
                    const doseEach = (m.doseAmount != null) ? m.doseAmount : 1;
                    const perDayPills = timesLen * doseEach;
                    const elderId = mElderId;
                    const elderName = (elderId && memberMap.get(elderId)) || (m.elderName || '未指定');

                    const startDt = m.startDate ? new Date(m.startDate) : new Date(m.createdAt);
                    startDt.setHours(0, 0, 0, 0);
                    const daysUsed = Math.max(0, Math.floor((todayTs - startDt.getTime()) / DAY_MS));

                    let daysLeft, totalDays;
                    let basis;
                    if (m.endDate) {
                        const endDt = new Date(m.endDate);
                        endDt.setHours(0, 0, 0, 0);
                        totalDays = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / DAY_MS));
                        daysLeft = Math.max(0, Math.ceil((endDt.getTime() - todayTs) / DAY_MS));
                        basis = `按处方结束日期 ${m.endDate} 计算`;
                    } else {
                        const inv = invByName.get(m.name);
                        const unitCap = (inv && inv.unitCapacity) ? inv.unitCapacity : null;
                        const unitCapUnit = (inv && inv.unitCapacityUnit) ? inv.unitCapacityUnit : '片';
                        let qty = (m.quantity != null) ? m.quantity : (inv ? inv.quantity : 1);
                        if (elderId && inv && Array.isArray(inv.byElder)) {
                            const hit = inv.byElder.find(b => b.elderId === elderId);
                            if (hit) qty = hit.quantity;
                        }
                        const packDays = calcPackDays(unitCap, perDayPills);
                        totalDays = Math.max(1, qty * packDays);
                        daysLeft = Math.max(0, totalDays - daysUsed);
                        basis = unitCap
                            ? `按每日 ${timesLen} 次 × 每次 ${doseEach}${m.doseUnit || unitCapUnit} · 每盒 ${unitCap}${unitCapUnit} 估算`
                            : `按每盒约 ${packDays} 天 · 每日 ${timesLen} 次估算`;
                    }
                    const progress = Math.max(0, Math.min(100, (daysLeft / Math.max(1, totalDays)) * 100));
                    return { name: m.name, daysLeft, progress, totalDays, basis };
                }).filter(Boolean);
            }

            if (refillEl) {
                if (medStats.length === 0) {
                    refillEl.innerHTML = `<div class="card">
                        <div class="card-title"><i class="fas fa-calculator"></i> 开药倒计时</div>
                        <p class="text-muted" style="text-align:center;padding:10px;font-size:13px;">
                            尚未设置长期用药。<span style="color:#2b7a78;cursor:pointer;text-decoration:underline;" onclick="App.switchPage('chronicMeds')">去设置</span>
                        </p>
                    </div>`;
                } else {
                    // 按剩余天数从少到多排序，优先显示最需要开药的
                    medStats.sort((a, b) => a.daysLeft - b.daysLeft);
                    // 每个药品独立显示：剩余天数、进度条、建议开药日、估算依据
                    const items = medStats.map(s => {
                        const warn = s.daysLeft <= 7 ? 'color:#dc2626;' : (s.daysLeft <= 14 ? 'color:#d97706;' : '');
                        const badgeColor = s.daysLeft <= 7 ? '#fee2e2' : (s.daysLeft <= 14 ? '#fef3c7' : '#e0f2fe');
                        const badgeText = s.daysLeft <= 7 ? '#991b1b' : (s.daysLeft <= 14 ? '#92400e' : '#075985');
                        const suggestDate = new Date(todayTs + Math.max(1, s.daysLeft) * DAY_MS).toISOString().slice(0, 10);
                        const barColor = s.daysLeft <= 7 ? '#dc2626' : (s.daysLeft <= 14 ? '#d97706' : '#2b7a78');
                        return `<div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                                <span style="font-weight:600;">${s.name}</span>
                                <span class="badge" style="background:${badgeColor};color:${badgeText};">剩余 ${s.daysLeft} 天</span>
                            </div>
                            <div class="refill-progress"><div class="bar-bg"><div class="bar-fill" style="width:${s.progress}%;background:${barColor};"></div></div></div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                                <div class="refill-date" style="margin:0;">
                                    <span>建议开药日: ${suggestDate}</span>
                                </div>
                                <div style="font-size:11px;color:#94a3b8;line-height:1.4;">
                                    <i class="fas fa-info-circle"></i> ${s.basis || '估算值'}
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    refillEl.innerHTML = `<div class="card">
                        <div class="card-title"><i class="fas fa-calculator"></i> 开药倒计时 <span class="text-muted" style="font-size:12px;font-weight:400;">(${chronicList.length > 0 ? '基于长期用药' : '基于用药计划'})</span></div>
                        ${items}
                    </div>`;
                }
            }
        } catch (err) {
            console.error('加载首页失败:', err);
        }

        // 加载最近病历和检查报告（最多3条）
        try {
            const recentEl = document.getElementById('homeRecent');
            if (!recentEl) return;
            const recordsRes = await Api.records.getAll(memberId);
            const allRecords = recordsRes.records || [];
            // 只保留病历和检查报告，过滤掉处方
            const filteredRecords = allRecords.filter(r => r.type === '病历' || r.type === '检查报告');
            const recentRecords = filteredRecords.slice(0, 3);
            
            if (recentRecords.length === 0) {
                recentEl.innerHTML = `<div class="card"><div class="card-title"><i class="fas fa-notes-medical"></i> 最近病历 <span style="margin-left:auto;font-size:13px;color:#2b7a78;cursor:pointer;" onclick="App.switchPage('records')">更多 <i class="fas fa-chevron-right"></i></span></div><p class="text-muted" style="text-align:center;padding:12px;">暂无病历记录</p></div>`;
            } else {
                recentEl.innerHTML = `
                <div class="card">
                    <div class="card-title"><i class="fas fa-notes-medical"></i> 最近病历 <span style="margin-left:auto;font-size:13px;color:#2b7a78;cursor:pointer;" onclick="App.switchPage('records')">更多 <i class="fas fa-chevron-right"></i></span></div>
                    ${recentRecords.map(r => `
                        <div class="record-item" onclick="App.viewRecord('${r.id}')">
                            ${r.type === '病历' ? `
                                <span class="right-info">${[r.department, r.doctor].filter(Boolean).join(' · ')}</span>
                                <div class="record-no">${r.recordNo || ''}</div>
                                <div class="sub">${r.hospital || '未填写'}</div>
                                <div class="title">${r.diagnosis || '未填写诊断'}</div>
                            ` : `
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span class="record-no">${r.recordNo || ''}</span>${r.relatedRecordNo ? `　<span class="record-no-link" onclick="event.stopPropagation();App.viewRecord('${r.relatedRecordId}')">病历：${r.relatedRecordNo}</span>` : ''}
                                </div>
                                
                                <div class="title">${r.diagnosis || '未填写'}</div>
                            `}
                        </div>
                    `).join('')}
                </div>`;
            }
        } catch (err) {
            console.error('加载最近病历失败:', err);
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
                        <span class="right-info">${[r.department, r.doctor].filter(Boolean).join(' · ')}</span>
                        <div class="record-no">${r.recordNo || ''}</div>
                        <div class="sub">${r.hospital || '未填写'}</div>
                        <div class="title">${r.diagnosis || '未填写诊断'}</div>
                    </div>`).join('');
            }

            if (reports.length === 0) {
                reportsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无报告记录</p>';
            } else {
                reportsEl.innerHTML = reports.map(r => `
                    <div class="record-item" onclick="App.viewRecord('${r.id}')">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span class="record-no">${r.recordNo || ''}</span>
                            ${r.relatedRecordNo ? `　<span class="record-no-link" onclick="event.stopPropagation();App.viewRecord('${r.relatedRecordId}')">病历：${r.relatedRecordNo}</span>` : ''}
                        </div>
                        <div class="title">${r.diagnosis || '未填写'}</div>
                    </div>`).join('');
            }

            if (prescriptions.length === 0) {
                prescriptionsEl.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">暂无处方记录</p>';
            } else {
                prescriptionsEl.innerHTML = prescriptions.map(r => `
                    <div class="record-item" onclick="App.viewRecord('${r.id}')">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span class="record-no">${r.recordNo || ''}</span>
                            ${r.relatedRecordNo ? `<span class="record-no-link" onclick="event.stopPropagation();App.viewRecord('${r.relatedRecordId}')">病历：${r.relatedRecordNo}</span>` : ''}
                        </div>
                        ${r.medications && r.medications.length > 0 ? r.medications.map(m => `<div class="med-item"><span class="med-name">${m.name}</span><span class="med-usage">${formatMedUsage(m)}</span></div>`).join('') : '<div class="sub">无药品明细</div>'}
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
    _editing: false,
    _rawRecord: null,

    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('records')"><i class="fas fa-arrow-left"></i></button>
            <h2 id="recordDetailTitle">详情</h2>
            <div style="margin-left:auto;">
                <button id="recordEditBtn" class="btn-outline" style="width:auto;padding:6px 14px;font-size:13px;" onclick="PageRecordDetail._startEdit()"><i class="fas fa-edit"></i> 编辑</button>
            </div>
        </div>
        <div id="recordDetailContent"><p class="text-muted" style="text-align:center;padding:40px;">加载中...</p></div>`;
    },

    _auditHtml(r) {
        const parts = [];
        if (r.createdAt) {
            const prefix = r.createdByName ? `由 ${r.createdByName} 创建于 ` : '创建于 ';
            parts.push(prefix + r.createdAt);
        }
        if (r.updatedAt && r.updatedAt !== r.createdAt) {
            const prefix = r.updatedByName ? `由 ${r.updatedByName} 更新于 ` : '更新于 ';
            parts.push(prefix + r.updatedAt);
        }
        if (parts.length === 0) return '';
        return `<div style="margin-top:16px;padding-top:10px;border-top:1px dashed #e2e8f0;font-size:11px;color:#94a3b8;text-align:right;">${parts.join(' · ')}</div>`;
    },

    async loadContent() {
        const id = App.state.currentRecordId;
        try {
            const res = await Api.records.get(id);
            const r = res.record;
            this._rawRecord = r;
            // 更新标题：药方→处方，其他保留原类型名
            const titleEl = document.getElementById('recordDetailTitle');
            if (titleEl) {
                const typeLabel = r.type === '药方' ? '处方' : (r.type || '记录');
                titleEl.textContent = `${typeLabel}详情`;
            }
            // 处方不允许编辑
            const editBtn = document.getElementById('recordEditBtn');
            if (editBtn) editBtn.style.display = (r.type === '药方') ? 'none' : '';
            const el = document.getElementById('recordDetailContent');
            if (!el) return;
            // 缓存 OCR 识别原文，供"查看识别内容"按钮使用
            App._viewOcrText = r.ocrText || '';

            if (r.type === '检查报告') {
                // 报告类型：显示检查所见、报告结论
                el.innerHTML = `
                <div class="card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        ${r.recordNo ? `<span class="record-no">${r.recordNo}</span>` : ''}
                        ${r.relatedRecordNo ? `<span class="record-no-link" onclick="App.viewRecord('${r.relatedRecordId}')">病历：${r.relatedRecordNo}</span>` : ''}
                    </div>
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}${r.doctor ? ' · ' + r.doctor : ''}</div>
                </div>
                ${r.findings ? `<div class="card"><div class="card-title"><i class="fas fa-microscope"></i> 检查所见</div>${renderMarkdown(r.findings)}</div>` : ''}
                ${r.conclusion ? `<div class="card"><div class="card-title"><i class="fas fa-clipboard-check"></i> 报告结论</div>${renderMarkdown(r.conclusion)}</div>` : ''}
                ${renderImageGallery(r.images)}
                ${r.ocrText ? `<button class="btn-outline" style="margin-top:8px;" onclick="App.showOcrTextFullscreen(App._viewOcrText)"><i class="fas fa-file-alt"></i> 查看识别内容</button>` : ''}
                ${this._auditHtml(r)}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此报告</button>`;
            } else if (r.type === '药方') {
                // 处方类型：显示诊断、医院、医生、用药明细
                const meds = r.medications || [];
                const medsHtml = meds.length === 0
                    ? '<p class="text-muted" style="text-align:center;padding:10px;">暂无用药明细</p>'
                    : meds.map(m => `
                        <div class="med-item" style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                            <span class="med-name" style="font-weight:600;color:#2b7a78;">${m.name || '未命名'}</span>
                            <span class="med-usage">${formatMedUsage({doseAmount: m.doseAmount, doseUnit: m.doseUnit, frequency: m.frequency})}</span>
                        </div>
                        ${m.specification ? `<div style="font-size:0.85em;color:#64748b;margin-bottom:6px;">规格: ${m.specification}</div>` : ''}
                        ${m.note ? `<div style="font-size:0.85em;color:#94a3b8;margin-bottom:6px;">备注: ${m.note}</div>` : ''}
                        ${(m.quantity || m.startDate) ? `<div style="display:flex;justify-content:space-between;font-size:0.85em;color:#94a3b8;margin-bottom:6px;">
                            <span>${m.quantity ? '数量: ' + m.quantity + (m.quantityUnit || '') : ''}</span>
                            <span>${m.startDate ? '开始日期: ' + m.startDate : ''}</span>
                        </div>` : ''}
                    `).join('');
                el.innerHTML = `
                <div class="card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        ${r.recordNo ? `<span class="record-no">${r.recordNo}</span>` : ''}
                        ${r.relatedRecordNo ? `<span style="font-size:13px;color:#2b7a78;text-decoration:underline;cursor:pointer;" onclick="App.viewRecord('${r.relatedRecordId}')">病历：${r.relatedRecordNo}</span>` : ''}
                    </div>
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">${r.hospital || ''} ${r.department ? '· ' + r.department : ''}${r.doctor ? ' · ' + r.doctor : ''}</div>
                </div>
                <div class="card">
                    <div class="card-title"><i class="fas fa-prescription-bottle-medical"></i> 用药明细</div>
                    ${medsHtml}
                </div>
                ${renderImageGallery(r.images)}
                ${r.ocrText ? `<button class="btn-outline" style="margin-top:8px;" onclick="App.showOcrTextFullscreen(App._viewOcrText)"><i class="fas fa-file-alt"></i> 查看识别内容</button>` : ''}
                ${this._auditHtml(r)}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此处方</button>`;
            } else {
                // 病历类型：显示主诉、医嘱，及关联的处方/报告
                const related = r.relatedRecords || [];
                const relatedHtml = related.length === 0 ? '' : `
                <div class="card">
                    <div class="card-title"><i class="fas fa-link"></i> 关联记录</div>
                    ${related.map(rr => `
                        <div class="record-item" onclick="App.viewRecord('${rr.id}')">
                            <div class="title">${rr.recordNo || ''} · ${rr.type === '药方' ? '处方' : '检查报告'}</div>
                            ${rr.type === '药方' && rr.medications && rr.medications.length > 0
                                ? rr.medications.map(m => `<div class="med-item" style="padding:4px 0;"><span class="med-name">${m.name}</span><span class="med-usage">${formatMedUsage({doseAmount: m.doseAmount, doseUnit: m.doseUnit, frequency: m.frequency})}</span></div>`).join('') : ''}
                            ${rr.type === '检查报告' && rr.conclusion
                                ? `<div class="sub" style="color:#2b7a78;">结论：${rr.conclusion.substring(0, 40)}${rr.conclusion.length > 40 ? '...' : ''}</div>` : ''}
                        </div>`).join('')}
                </div>`;
                el.innerHTML = `
                <div class="card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        ${r.recordNo ? `<span class="record-no">${r.recordNo}</span>` : ''}
                        <span class="right-info">${[r.department, r.doctor].filter(Boolean).join(' · ')}</span>
                    </div>
                    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${r.diagnosis || '未填写'}</div>
                    <div class="text-muted">${r.hospital || '未填写'}</div>
                    ${r.chiefComplaint ? `<div style="margin-top:12px;"><strong>主诉：</strong>${r.chiefComplaint}</div>` : ''}
                </div>
                ${r.orders ? `<div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 医嘱</div><p>${r.orders}</p></div>` : ''}
                ${relatedHtml}
                ${renderImageGallery(r.images)}
                ${r.ocrText ? `<button class="btn-outline" style="margin-top:8px;" onclick="App.showOcrTextFullscreen(App._viewOcrText)"><i class="fas fa-file-alt"></i> 查看识别内容</button>` : ''}
                ${this._auditHtml(r)}
                <button class="btn-danger" style="margin-top:8px;" onclick="App.deleteRecord('${r.id}')">删除此病历</button>`;
            }
        } catch (err) {
            const el = document.getElementById('recordDetailContent');
            if (el) el.innerHTML = `<p>加载失败: ${err.message}</p>`;
        }
    },

    _startEdit() {
        const r = this._rawRecord;
        if (!r || r.type === '药方') return;
        const isReport = r.type === '检查报告';
        const typeLabel = isReport ? '检查报告' : '病历';
        const escAttr = (v) => String(v || '').replace(/"/g, '&quot;');
        const escText = (v) => String(v || '').replace(/</g, '&lt;');

        const dateId = isReport ? 'editRecordDate2' : 'editRecordDate';
        const hospId = isReport ? 'editRecordHospital2' : 'editRecordHospital';
        const deptId = isReport ? 'editRecordDept2' : 'editRecordDept';
        const doctorId = isReport ? 'editRecordDoctor2' : 'editRecordDoctor';

        let typeFields = '';
        if (isReport) {
            typeFields = `
                <div class="form-group"><label>检查项目 *</label><input id="editRecordExamName" value="${escAttr(r.diagnosis)}" placeholder="如：胸部CT平扫"></div>
                <div class="form-group"><label>检查所见</label><textarea id="editRecordFindings" rows="4" placeholder="检查所见内容">${escText(r.findings)}</textarea></div>
                <div class="form-group"><label>报告结论</label><textarea id="editRecordConclusion" rows="3" placeholder="报告结论内容">${escText(r.conclusion)}</textarea></div>`;
        } else {
            typeFields = `
                <div class="form-group"><label>主诉</label><textarea id="editRecordComplaint" rows="2" placeholder="主要症状">${escText(r.chiefComplaint)}</textarea></div>
                <div class="form-group"><label>诊断 *</label><input id="editRecordDiagnosis" value="${escAttr(r.diagnosis)}" placeholder="诊断结果"></div>
                <div class="form-group"><label>医嘱</label><textarea id="editRecordOrders" rows="3" placeholder="医嘱内容">${escText(r.orders)}</textarea></div>`;
        }

        App.openModal(`
        <div style="padding:20px;max-height:85vh;overflow-y:auto;">
            <div style="font-size:18px;font-weight:700;margin-bottom:16px;"><i class="fas fa-edit" style="color:#2b7a78;"></i> 编辑${typeLabel}</div>
            <div class="form-group">
                <label>${isReport ? '检查日期' : '就诊日期'}</label>
                <input id="${dateId}" type="text" readonly value="${escAttr(r.visitDate)}" onclick="CalendarPicker.attach(this,{max:'today'})" placeholder="点击选择日期" style="background:#fff;">
            </div>
            <div class="form-group">
                <label>医院 *</label>
                <input id="${hospId}" value="${escAttr(r.hospital)}" placeholder="输入医院名称或拼音首字母" autocomplete="off" onclick="HospitalSuggest.showSuggestions(this)" oninput="HospitalSuggest.onInput(this)">
            </div>
            <div class="form-group">
                <label>科室 *</label>
                <input id="${deptId}" value="${escAttr(r.department)}" placeholder="输入科室名称或拼音首字母" autocomplete="off" onclick="DeptSuggest.showSuggestions(this)" oninput="DeptSuggest.onInput(this)">
            </div>
            ${typeFields}
            <div class="form-group"><label>医生</label><input id="${doctorId}" value="${escAttr(r.doctor)}" placeholder="主治医生"></div>
            <div style="display:flex;gap:12px;margin-top:16px;">
                <button class="btn-secondary" onclick="App.closeModal()" style="flex:1;padding:10px;border-radius:24px;">取消</button>
                <button class="btn-primary" onclick="PageRecordDetail._doEdit()" style="flex:1;padding:10px;border-radius:24px;">保存</button>
            </div>
        </div>`);

        // 如果有医院/科室值，尝试匹配列表中的已有项
        if (r.hospital) setTimeout(() => HospitalSuggest.matchAndFill(document.getElementById(hospId), r.hospital), 100);
        if (r.department) setTimeout(() => DeptSuggest.matchAndFill(document.getElementById(deptId), r.department), 100);
    },

    async _doEdit() {
        const r = this._rawRecord;
        if (!r) return;
        const isReport = r.type === '检查报告';
        const hospId = isReport ? 'editRecordHospital2' : 'editRecordHospital';
        const deptId = isReport ? 'editRecordDept2' : 'editRecordDept';

        // 校验医院/科室
        const hospEl = document.getElementById(hospId);
        const deptEl = document.getElementById(deptId);
        if (!hospEl?.value.trim()) { App.toast('请填写医院'); return; }
        if (!deptEl?.value.trim()) { App.toast('请填写科室'); return; }
        if (false === await HospitalSuggest.ensure(hospEl)) return;
        if (false === await DeptSuggest.ensure(deptEl)) return;

        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const data = {
            visitDate: getVal(isReport ? 'editRecordDate2' : 'editRecordDate'),
            hospital: getVal(hospId),
            department: getVal(deptId),
            doctor: getVal(isReport ? 'editRecordDoctor2' : 'editRecordDoctor'),
        };

        if (isReport) {
            const examName = getVal('editRecordExamName');
            if (!examName) { App.toast('请输入检查项目'); return; }
            data.diagnosis = examName;
            data.findings = getVal('editRecordFindings');
            data.conclusion = getVal('editRecordConclusion');
        } else {
            const diagnosis = getVal('editRecordDiagnosis');
            if (!diagnosis) { App.toast('请输入诊断'); return; }
            data.diagnosis = diagnosis;
            data.chiefComplaint = getVal('editRecordComplaint');
            data.orders = getVal('editRecordOrders');
        }

        try {
            App.toast('保存中...');
            await Api.records.update(r.id, data);
            App.closeModal();
            App.toast('修改成功');
            this.loadContent();
        } catch (err) {
            App.toast('保存失败: ' + (err.message || ''));
        }
    }
};

// ---------- 药箱页 ----------
const PagePharmacy = {
    _currentCat: '全部',
    _currentStock: '有库存',

    render() {
        this.loadContent();
        return `
        <div class="card">
            <div class="card-title"><i class="fas fa-kit-medical"></i> 家庭药箱 <button class="btn-outline" style="width:auto;padding:6px 14px;font-size:13px;margin-left:auto;" onclick="App.switchPage('addDrug')"><i class="fas fa-plus"></i> 添加</button></div>
            <div id="pharmacyStockFilter" style="margin-bottom:8px;"></div>
            <div id="pharmacyCats" style="margin-bottom:10px;"></div>
            <div id="pharmacyList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    _renderDrugCard(d) {
        const isExpired = d.status === 'expired';
        const isExpiring = d.status === 'expiring_soon';
        const isDepleted = d.quantity <= 0;
        const dateColor = isExpired ? 'color:#dc2626;' : (isDepleted ? 'color:#94a3b8;' : '');
        let statusHtml = '';
        if (isDepleted) statusHtml = '<span style="margin-left:8px;color:#94a3b8;">已用完</span>';
        else if (isExpired) statusHtml = '<span class="danger" style="margin-left:8px;">⛔ 已过期!</span>';
        else if (isExpiring) statusHtml = '<span class="danger" style="margin-left:8px;">⚠ 即将过期</span>';
        const icon = getDrugIcon(d.name);
        let specLine = d.specification || '';
        if (!specLine) {
            const specParts = [];
            if (d.specDosage != null) specParts.push(`每${d.unitCapacityUnit || '片'}${d.specDosage}${d.specDosageUnit || ''}`);
            if (d.unitCapacity != null) specParts.push(`每${d.quantityUnit || '盒'}${d.unitCapacity}${d.unitCapacityUnit || '片'}`);
            specLine = specParts.join('，');
        }
        const unit = d.quantityUnit || '盒';
        const qtyLine = `${d.quantity || 0}${unit}`;
        const qtySpecLine = `${qtyLine}`;
//        const qtySpecLine = `剩余 ${qtyLine}${specLine ? ' · ' + specLine : ''}`;
        const textColor = isDepleted ? 'color:#94a3b8;' : '';
        // 用真正的 anchorId 打开详情（确保后端能按 name 聚合到所有同名人的库存）
        const openId = d._anchorId || d.id;
        return `<div class="drug-item" style="cursor:pointer;${isDepleted ? 'opacity:0.7;' : ''}" onclick="App.viewDrugDetail('${openId}')">
            <div class="drug-icon"><i class="fas ${icon}"></i></div>
            <div class="drug-info" style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                    <div class="dname" style="color:#2b7a78;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${textColor}">${d.name}</div>
                    <div class="qty" style="flex-shrink:0;width:50px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${textColor}">${qtySpecLine}</div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <div class="dexp">📅 过期: <span style="${dateColor}">${d.expiryDate || '未设置'}</span>${statusHtml}</div>
                    <div style="display:flex;gap:2px;flex-shrink:0;">
                        <button style="background:none;border:none;color:#2b7a78;cursor:pointer;padding:2px 8px;" title="快速添加库存" onclick="event.stopPropagation();PagePharmacy.quickAdd('${d.name.replace(/'/g, "\\'")}',${d.drugCode ? `'${d.drugCode.replace(/'/g, "\\'")}'` : 'null'},'${openId}')"><i class="fas fa-plus"></i></button>
                        <button style="background:none;border:none;color:#b91c1c;cursor:pointer;padding:2px 8px;" title="删除" onclick="event.stopPropagation();App.deleteDrug('${d.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>`;
    },

    async loadContent() {
        try {
            // 先触发自动消耗计算，再加载列表
            try {
                await Api.drugs.autoConsume();
            } catch (e) {
                console.warn('自动消耗计算失败（不影响加载）:', e);
            }
            const res = await Api.drugs.getAll();
            const drugs = res.drugs || [];
            const stockFilterEl = document.getElementById('pharmacyStockFilter');
            const catsEl = document.getElementById('pharmacyCats');
            const listEl = document.getElementById('pharmacyList');
            if (!listEl) return;

            // === 库存状态筛选 ===
            const stockCounts = { '全部': drugs.length, '有库存': 0, '已过期': 0 };
            drugs.forEach(d => {
                if (d.quantity > 0) stockCounts['有库存']++;
                if (d.status === 'expired') stockCounts['已过期']++;
            });
            const stockOptions = ['全部', '有库存', '已过期'];
            if (stockFilterEl) {
                stockFilterEl.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;padding-bottom:4px;">
                    ${stockOptions.map(s => {
                        const active = s === this._currentStock;
                        let bg = active ? 'background:#2b7a78;color:#fff;' : 'background:#f1f5f9;color:#475569;';
                        if (s === '已过期' && active) bg = 'background:#dc2626;color:#fff;';
                        else if (s === '已过期' && !active) bg = 'background:#fee2e2;color:#dc2626;';
                        return `<span onclick="PagePharmacy._selectStock('${s}')"
                            style="padding:4px 12px;border-radius:16px;cursor:pointer;font-size:13px;white-space:nowrap;${bg}">
                            ${s} <span style="opacity:0.75;">(${stockCounts[s]})</span>
                        </span>`;
                    }).join('')}
                </div>`;
            }

            // 先按库存状态筛选
            let stockFiltered = drugs;
            if (this._currentStock === '有库存') {
                stockFiltered = drugs.filter(d => d.quantity > 0);
            } else if (this._currentStock === '已过期') {
                stockFiltered = drugs.filter(d => d.status === 'expired');
            }

            // === 分类筛选 ===
            const catMap = {};
            stockFiltered.forEach(d => {
                const c = d.category && d.category.trim() ? d.category.trim() : '其他';
                catMap[c] = (catMap[c] || 0) + 1;
            });
            const catList = Object.keys(catMap).sort((a, b) => {
                if (a === '其他') return 1;
                if (b === '其他') return -1;
                return catMap[b] - catMap[a];
            });
            const allCats = ['全部', ...catList];

            // 如果当前选中的分类不在列表中，重置为全部
            if (!allCats.includes(this._currentCat)) this._currentCat = '全部';

            // 渲染分类导航
            if (catsEl) {
                catsEl.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;overflow-x:auto;padding-bottom:4px;">
                    ${allCats.map(c => {
                        const active = c === this._currentCat;
                        const count = c === '全部' ? stockFiltered.length : (catMap[c] || 0);
                        return `<span onclick="PagePharmacy._selectCat('${c.replace(/'/g, "\\'")}')"
                            style="padding:4px 12px;border-radius:16px;cursor:pointer;font-size:13px;white-space:nowrap;
                            ${active ? 'background:#2b7a78;color:#fff;' : 'background:#f1f5f9;color:#475569;'}">
                            ${c} <span style="opacity:0.75;">(${count})</span>
                        </span>`;
                    }).join('')}
                </div>`;
            }

            // 按当前分类筛选（在库存筛选的基础上）
            const filtered = this._currentCat === '全部'
                ? stockFiltered
                : stockFiltered.filter(d => (d.category && d.category.trim() ? d.category.trim() : '其他') === this._currentCat);

            // 按分类分组显示
            let html = '';
            if (filtered.length === 0) {
                html = '<p class="text-muted" style="text-align:center;padding:20px;">暂无符合条件的药品</p>';
            } else if (this._currentCat === '全部') {
                // 全部：按分类分组展示
                html = catList.map(cat => {
                    const items = filtered.filter(d => (d.category && d.category.trim() ? d.category.trim() : '其他') === cat);
                    if (items.length === 0) return '';
                    return `<div style="margin-top:10px;">
                        <div style="font-size:13px;color:#64748b;margin-bottom:4px;padding-left:2px;font-weight:600;">
                            <i class="fas fa-folder" style="width:16px;"></i> ${cat} (${items.length})
                        </div>
                        ${items.map(d => this._renderDrugCard(d)).join('')}
                    </div>`;
                }).join('');
            } else {
                // 指定分类：平铺
                html = filtered.map(d => this._renderDrugCard(d)).join('');
            }

            listEl.innerHTML = html;
        } catch (err) {
            const el = document.getElementById('pharmacyList');
            if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    },

    _selectCat(cat) {
        this._currentCat = cat;
        this.loadContent();
    },

    _selectStock(stock) {
        this._currentStock = stock;
        this.loadContent();
    },

    quickAdd(name, drugCode, anchorId) {
        App.state._quickAddDrug = { name, drugCode, anchorId };
        App.openModal(PagePharmacy._quickAddModal(name));
        setTimeout(() => {
            const input = document.getElementById('quickAddQty');
            if (input) { input.focus(); input.select(); }
        }, 50);
    },

    _quickAddModal(name) {
        const members = App.state.members || [];
        const currentUserId = App.state.user?.id;
        const memberOptions = members.map(m => {
            const selected = m.id === App.state.currentMemberId ? 'selected' : '';
            const isSelf = m.relation === 'self' && m.user_id === currentUserId;
            const label = isSelf ? m.name + '（我）' : m.name;
            return `<option value="${m.id}" ${selected}>${label}</option>`;
        }).join('');
        return `
        <div style="padding:20px;min-width:280px;">
            <div style="font-size:16px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-box" style="color:#2b7a78;"></i> 快速添加库存
            </div>
            <div style="background:#f1f5f9;padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:13px;color:#475569;">
                药品：<strong>${name}</strong>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label>服药人</label>
                <select id="quickAddElder" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:15px;box-sizing:border-box;background:#fff;">
                    ${memberOptions}
                </select>
            </div>
            <div class="form-group" style="margin-bottom:16px;">
                <label>添加数量</label>
                <input id="quickAddQty" type="number" min="1" value="1" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:15px;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:12px;">
                <button class="btn-secondary" onclick="App.closeModal()" style="flex:1;padding:10px;border-radius:24px;">取消</button>
                <button class="btn-primary" onclick="PagePharmacy._doQuickAdd()" style="flex:1;padding:10px;border-radius:24px;">确认添加</button>
            </div>
        </div>`;
    },

    async _doQuickAdd() {
        const state = App.state._quickAddDrug;
        if (!state) return;
        const qtyInput = document.getElementById('quickAddQty');
        const elderSel = document.getElementById('quickAddElder');
        const qty = parseInt(qtyInput?.value);
        const elderId = elderSel?.value || App.state.currentMemberId;
        if (!qty || qty < 1) { App.toast('请输入有效数量'); return; }
        if (!elderId) { App.toast('请选择服药人'); return; }
        App.closeModal();
        try {
            await Api.drugs.add({
                elderId,
                name: state.name,
                drugCode: state.drugCode || undefined,
                quantity: qty,
                quantityUnit: '盒',
                expiryDate: null,
            });
            App.toast(`已添加 ${qty} 盒`);
            this.loadContent();
        } catch (err) {
            App.toast(err.message);
        }
        App.state._quickAddDrug = null;
    }
};

// ---------- 我的页 ----------
const PageProfile = {
    render() {
        const user = App.state.user;
        const selfElder = App.state.members.find(m => m.relation === 'self' && m.user_id === user?.id);
        if (!user) return '';
        const relationMap = { self: '本人', parent: '父母', spouse_parent: '公婆/岳父母', spouse: '配偶', other: '其他' };
        const infoItems = [];
        if (selfElder) {
            if (selfElder.gender && selfElder.gender !== '未知') infoItems.push(`<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${selfElder.gender}</span>`);
            const ageFromBD = calcAge(selfElder.birth_date);
            if (ageFromBD != null) infoItems.push(`<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${ageFromBD}岁</span>`);
            if (selfElder.blood_type) infoItems.push(`<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${selfElder.blood_type}</span>`);
        }
        return `
        <div class="card">
            <div class="flex" style="gap:16px;margin-bottom:12px;">
                ${App.renderAvatar(selfElder, 'xl')}
                <div>
                    <div style="font-weight:700;font-size:20px;">${user.name}</div>
                    <div class="text-muted">${user.role === 'admin' ? '管理员' : '成员'} · ${user.phone || '未绑定手机'}</div>
                    ${infoItems.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${infoItems.join('')}</div>` : ''}
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-title"><i class="fas fa-cog"></i> 设置</div>
            <div style="cursor:pointer;display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f1f5f9;" onclick="App.switchPage('chronicMeds')">
                <i class="fas fa-capsules" style="width:24px;color:#2b7a78;"></i>
                <div style="flex:1;"><div style="font-weight:600;">长期用药</div><div class="text-muted">从药箱选择长期服用的药品，首页开药提醒基于此</div></div>
                <i class="fas fa-chevron-right" style="color:#94a3b8;"></i>
            </div>
            <div style="cursor:pointer;display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f1f5f9;" onclick="App.switchPage('profileEdit')">
                <i class="fas fa-user-edit" style="width:24px;color:#2b7a78;"></i>
                <div style="flex:1;"><div style="font-weight:600;">个人信息</div><div class="text-muted">修改性别、出生日期、血型等基本信息</div></div>
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
        const user = App.state.user;
        const selfElder = App.state.members.find(m => m.relation === 'self' && m.user_id === user?.id);
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
            <div class="form-group"><label>出生日期</label>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input id="pe-birthDate" type="text" readonly onclick="CalendarPicker.attach(this,{max:'today'})" value="${e.birth_date ? formatDate(e.birth_date) : ''}" placeholder="点击选择出生日期" style="background:#fff;flex:1;" onchange="PageProfileEdit._updateAge()">
                    <span id="pe-calcAge" style="font-size:12px;color:#2b7a78;"></span>
                </div>
            </div>
            <div class="form-group"><label>血型</label><select id="pe-blood">
                <option value="" ${!e.blood_type ? 'selected' : ''}>未知</option>
                <option value="A型" ${e.blood_type === 'A型' ? 'selected' : ''}>A型</option>
                <option value="B型" ${e.blood_type === 'B型' ? 'selected' : ''}>B型</option>
                <option value="AB型" ${e.blood_type === 'AB型' ? 'selected' : ''}>AB型</option>
                <option value="O型" ${e.blood_type === 'O型' ? 'selected' : ''}>O型</option>
            </select></div>
            <div class="form-group"><label>过敏史</label><textarea id="pe-allergies" placeholder="如：青霉素、花粉">${e.allergies || ''}</textarea></div>
            <div class="form-group"><label>基础疾病</label><textarea id="pe-conditions" placeholder="如：高血压、糖尿病">${e.conditions || ''}</textarea></div>
            <div class="form-group"><label>手机号（登录账号，不可修改）</label><input id="pe-phone" type="tel" value="${e.phone || user?.phone || ''}" disabled style="background:#f5f5f5;"></div>
            <button class="btn-primary" onclick="App.saveProfile()">保存</button>
        </div>`;
    },

    afterRender() {
        this._updateAge();
    },

    _updateAge() {
        const bd = document.getElementById('pe-birthDate')?.value;
        const age = calcAge(bd);
        const el = document.getElementById('pe-calcAge');
        if (el) {
            el.textContent = (age != null) ? `${age}岁` : '';
        }
    }
};

// ---------- 长期用药设置页 ----------
const PageChronicMeds = {
    _allDrugs: [],
    _selectedIds: new Set(),

    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('profile')"><i class="fas fa-arrow-left"></i></button>
            <h2>长期用药设置</h2>
        </div>
        <div class="card" style="margin-bottom:12px;">
            <div style="font-size:13px;color:#64748b;line-height:1.6;">
                <i class="fas fa-info-circle" style="color:#2b7a78;"></i>
                请从下方药箱列表中勾选您需要长期服用的药品，首页的<b>开药倒计时</b>将基于这些药品的库存进行提醒。
            </div>
        </div>
        <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div class="card-title" style="margin-bottom:0;"><i class="fas fa-kit-medical"></i> 药箱列表 <span id="chronicCount" class="text-muted" style="font-size:13px;font-weight:400;"></span></div>
                <button class="btn-primary" style="width:auto;padding:6px 16px;font-size:14px;" onclick="PageChronicMeds._save()"><i class="fas fa-save"></i> 保存</button>
            </div>
            <div id="chronicList"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    _renderDrugCard(d, checked) {
        const cat = d.category || '其他';
        const icon = getDrugIcon(d.name);
        let specLine = d.specification || '';
        if (!specLine) {
            const specParts = [];
            if (d.specDosage != null) specParts.push(`每${d.unitCapacityUnit || '片'}${d.specDosage}${d.specDosageUnit || ''}`);
            if (d.unitCapacity != null) specParts.push(`每${d.quantityUnit || '盒'}${d.unitCapacity}${d.unitCapacityUnit || '片'}`);
            specLine = specParts.join('，');
        }
        const qty = `${d.quantity || 1}${d.quantityUnit || '盒'}`;
        const isExpired = d.status === 'expired';
        const isExpiring = d.status === 'expiring_soon';
        const warnBadge = isExpired ? '<span class="badge" style="background:#fee2e2;color:#991b1b;margin-left:6px;">已过期</span>' :
            (isExpiring ? '<span class="badge" style="background:#fef3c7;color:#92400e;margin-left:6px;">即将过期</span>' : '');
        return `<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;cursor:pointer;user-select:none;${checked ? 'background:#f0fdfa;' : ''}">
            <input type="checkbox" value="${d.id}" ${checked ? 'checked' : ''} onchange="PageChronicMeds._toggle('${d.id}', this.checked)"
                style="width:18px;height:18px;margin-top:4px;accent-color:#2b7a78;flex-shrink:0;">
            <div class="drug-icon" style="flex-shrink:0;"><i class="fas ${icon}"></i></div>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                    <span style="font-weight:600;color:#2b7a78;">${d.name}</span>${warnBadge}
                    <span style="margin-left:auto;font-size:12px;background:#eef2f6;color:#475569;padding:1px 8px;border-radius:10px;">${cat}</span>
                </div>
                <div class="text-muted" style="font-size:13px;margin-top:3px;">
                    库存: <strong>${qty}</strong>${specLine ? ' · ' + specLine : ''}
                    ${d.expiryDate ? ' · 有效期至: ' + d.expiryDate : ''}
                </div>
            </div>
        </label>`;
    },

    async loadContent() {
        try {
            const [drugsRes, chronicRes] = await Promise.all([
                Api.drugs.getAll(),
                Api.drugs.getChronic(App.state.currentMemberId)
            ]);
            this._allDrugs = drugsRes.drugs || [];
            const chronicList = chronicRes.chronicMeds || [];
            this._selectedIds = new Set(chronicList.map(c => c.drugInventoryId));

            const listEl = document.getElementById('chronicList');
            const countEl = document.getElementById('chronicCount');
            if (!listEl) return;

            if (this._allDrugs.length === 0) {
                listEl.innerHTML = `<div style="padding:20px;">
                    <p class="text-muted" style="text-align:center;margin-bottom:10px;">药箱为空，请先添加药品</p>
                    <button class="btn-outline" style="width:100%;" onclick="App.switchPage('addDrug')"><i class="fas fa-plus"></i> 去添加药品</button>
                </div>`;
                if (countEl) countEl.textContent = '';
                return;
            }

            // 按分类排序，同分类按名称
            const sorted = [...this._allDrugs].sort((a, b) => {
                const ca = a.category || '其他';
                const cb = b.category || '其他';
                if (ca !== cb) {
                    if (ca === '其他') return 1;
                    if (cb === '其他') return -1;
                    return ca.localeCompare(cb, 'zh');
                }
                return a.name.localeCompare(b.name, 'zh');
            });

            listEl.innerHTML = sorted.map(d => this._renderDrugCard(d, this._selectedIds.has(d.id))).join('');
            if (countEl) countEl.textContent = `（已选 ${this._selectedIds.size} / ${this._allDrugs.length}）`;
        } catch (err) {
            console.error('加载长期用药失败:', err);
            const el = document.getElementById('chronicList');
            if (el) el.innerHTML = `<p class="text-muted" style="text-align:center;padding:20px;">加载失败: ${err.message || ''}</p>`;
        }
    },

    _toggle(id, checked) {
        if (checked) this._selectedIds.add(id);
        else this._selectedIds.delete(id);
        const countEl = document.getElementById('chronicCount');
        if (countEl) countEl.textContent = `（已选 ${this._selectedIds.size} / ${this._allDrugs.length}）`;
    },

    async _save() {
        try {
            const ids = Array.from(this._selectedIds);
            const elderId = App.state.currentMemberId || null;
            const res = await Api.drugs.saveChronic(ids, elderId);
            App.toast(`已保存 ${ids.length} 种长期用药`);
            // 同步一下状态
            const chronicList = res.chronicMeds || [];
            this._selectedIds = new Set(chronicList.map(c => c.drugInventoryId));
            setTimeout(() => App.switchPage('profile'), 500);
        } catch (err) {
            App.toast('保存失败: ' + (err.message || ''));
        }
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

// ---------- 留言反馈（填写页）----------
const PageFeedback = {
    _searchTimer: null,
    _from: null,

    render() {
        // 使用 App._feedbackFromPage 记录用户点击留言按钮时的页面；如果没有（比如用户直接刷新），退回首页
        const from = App._feedbackFromPage || { key: App.state.page || 'home', name: App.getPageLabel(App.state.page) || '首页' };
        this._from = from;
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>留言反馈</h2>
            <span style="margin-left:auto;font-size:13px;color:#2b7a78;cursor:pointer;" onclick="App.switchPage('feedbackList')">
                <i class="fas fa-list"></i> 查看全部留言
            </span>
        </div>
        <div class="card">
            <div style="font-size:13px;color:#64748b;line-height:1.7;margin-bottom:14px;">
                <i class="fas fa-info-circle" style="color:#2b7a78;"></i>
                欢迎留下 Bug 报告或使用建议。我们会认真对待每一条反馈。
            </div>

            <div style="margin-bottom:14px;">
                <label style="font-size:13px;color:#475569;font-weight:600;display:block;margin-bottom:6px;">当前页面（自动记录）</label>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;color:#64748b;font-size:13px;">
                    <i class="fas fa-map-marker-alt" style="color:#94a3b8;"></i>
                    来自：<b style="color:#2b7a78;">${from.name || '未知'}</b>
                    ${from.name !== '首页' && from.name ? `<span style="color:#94a3b8;margin-left:10px;">（提交时会一并记录）</span>` : ''}
                </div>
            </div>

            <div style="margin-bottom:14px;">
                <label style="font-size:13px;color:#475569;font-weight:600;display:block;margin-bottom:6px;">留言标题 <span style="color:#dc2626;">*</span></label>
                <input type="text" id="fbTitle" placeholder="一句话概括，如：药箱图标显示错误" style="width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;" oninput="PageFeedback._onTitleInput()">
                <!-- 相似留言展示区 -->
                <div id="fbMatches" style="margin-top:8px;"></div>
            </div>

            <div style="margin-bottom:16px;">
                <label style="font-size:13px;color:#475569;font-weight:600;display:block;margin-bottom:6px;">留言内容 <span style="color:#dc2626;">*</span></label>
                <textarea id="fbContent" rows="6" placeholder="请描述具体问题或建议（可附截图链接、操作步骤、预期行为等）" style="width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.6;"></textarea>
            </div>

            <button class="btn-primary" style="width:100%;" onclick="PageFeedback._submit()"><i class="fas fa-paper-plane"></i> 提交留言</button>
        </div>`;
    },

    _onTitleInput() {
        if (this._searchTimer) clearTimeout(this._searchTimer);
        const q = (document.getElementById('fbTitle')?.value || '').trim();
        if (q.length < 2) {
            const el = document.getElementById('fbMatches');
            if (el) el.innerHTML = '';
            return;
        }
        // 300ms debounce
        this._searchTimer = setTimeout(() => this._doSearch(q), 300);
    },

    async _doSearch(q) {
        try {
            const res = await Api.feedback.search(q);
            const list = res.matches || [];
            const el = document.getElementById('fbMatches');
            if (!el) return;
            if (list.length === 0) {
                el.innerHTML = '';
                return;
            }
            el.innerHTML = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;">
                <div style="font-size:12px;color:#92400e;margin-bottom:6px;">
                    <i class="fas fa-lightbulb"></i> 找到 ${list.length} 条相似留言，您可以先查看是否已有相同问题：
                </div>
                ${list.map(m => `
                <div style="padding:8px 10px;background:#fff;border:1px solid #fde68a;border-radius:6px;margin-bottom:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px;">
                        <span style="font-weight:600;font-size:13px;color:#78350f;">${escHtml(m.title)}</span>
                        <span style="font-size:11px;color:#94a3b8;flex-shrink:0;">${formatDate(m.created_at)} · ${escHtml(m.user_name)}</span>
                    </div>
                    <div style="font-size:12px;color:#6b7280;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${escHtml(m.content || '').substring(0, 120)}${(m.content || '').length > 120 ? '...' : ''}</div>
                    ${m.page_name ? `<div style="font-size:11px;color:#94a3b8;margin-top:3px;"><i class="fas fa-map-marker-alt"></i> 来自：${escHtml(m.page_name)}</div>` : ''}
                </div>`).join('')}
            </div>`;
        } catch (err) {
            // 搜索失败静默，不影响用户填写
        }
    },

    async _submit() {
        const title = (document.getElementById('fbTitle')?.value || '').trim();
        const content = (document.getElementById('fbContent')?.value || '').trim();
        if (!title) { App.toast('请填写留言标题'); return; }
        if (!content) { App.toast('请填写留言内容'); return; }
        try {
            await Api.feedback.save({
                title, content,
                pageKey: this._from && this._from.key,
                pageName: this._from && this._from.name,
            });
            App.toast('留言提交成功，感谢您的反馈！');
            // 清空输入
            const tEl = document.getElementById('fbTitle'); if (tEl) tEl.value = '';
            const cEl = document.getElementById('fbContent'); if (cEl) cEl.value = '';
            const mEl = document.getElementById('fbMatches'); if (mEl) mEl.innerHTML = '';
            setTimeout(() => App.switchPage('feedbackList'), 600);
        } catch (err) {
            App.toast('提交失败：' + (err.message || ''));
        }
    }
};

// ---------- 留言列表（只显示标题 + 徽章，点击进详情）----------
const PageFeedbackList = {
    render() {
        this.loadContent();
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('feedback')"><i class="fas fa-arrow-left"></i></button>
            <h2>留言列表</h2>
            <span style="margin-left:auto;font-size:13px;color:#2b7a78;cursor:pointer;" onclick="App.switchPage('feedback')">
                <i class="fas fa-plus"></i> 我要留言
            </span>
        </div>
        <div id="fbListWrap"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>`;
    },

    async loadContent() {
        try {
            const res = await Api.feedback.list();
            const list = res.feedback || [];
            const wrap = document.getElementById('fbListWrap');
            if (!wrap) return;
            if (list.length === 0) {
                wrap.innerHTML = `<div class="card"><p class="text-muted" style="text-align:center;padding:20px;">还没有留言，<span style="color:#2b7a78;cursor:pointer;text-decoration:underline;" onclick="App.switchPage('feedback')">去写第一条</span></p></div>`;
                return;
            }
            wrap.innerHTML = `<div class="card">
                <div class="card-title" style="margin-bottom:6px;"><i class="fas fa-comments"></i> 全部留言 <span class="text-muted" style="font-size:13px;font-weight:400;">（${list.length} 条）</span></div>
                ${list.map(f => `
                <div style="padding:12px 4px;border-bottom:1px solid #f1f5f9;${list.indexOf(f) === list.length - 1 ? 'border-bottom:none;' : ''}
                            cursor:pointer;display:flex;align-items:center;gap:10px;"
                     onclick="App.switchFeedbackDetail('${f.id}')">
                    <div style="width:32px;height:32px;border-radius:50%;background:#def7f5;color:#2b7a78;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">
                        ${(f.user_name || '?').charAt(0)}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:14px;color:#2b7a78;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${escHtml(f.title)}
                        </div>
                        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
                            ${escHtml(f.user_name || '匿名')} · ${formatDateTime(f.created_at)}
                            ${f.page_name ? `<span style="margin-left:6px;"><i class="fas fa-map-marker-alt"></i> ${escHtml(f.page_name)}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                        ${f.like_count > 0 ? `<span class="badge" style="background:#fef2f2;color:#dc2626;"><i class="fas fa-heart"></i> ${f.like_count}</span>` : ''}
                        ${f.comment_count > 0 ? `<span class="badge" style="background:#eff6ff;color:#2563eb;"><i class="fas fa-comment"></i> ${f.comment_count}</span>` : ''}
                        <i class="fas fa-chevron-right" style="color:#cbd5e1;font-size:12px;margin-left:4px;"></i>
                    </div>
                </div>`).join('')}
            </div>`;
        } catch (err) {
            const wrap = document.getElementById('fbListWrap');
            if (wrap) wrap.innerHTML = `<div class="card"><p class="text-muted" style="text-align:center;padding:20px;">加载失败: ${err.message || ''}</p></div>`;
        }
    }
};

// ---------- 留言详情：完整内容 + 点赞/取消点赞 + 评论（评价）----------
const PageFeedbackDetail = {
    _id: null,
    _rawDetail: null,
    _state: { likeCount: 0, likedByMe: false, comments: [] },

    render(id) {
        this._id = id || this._id;
        this._rawDetail = null;
        setTimeout(() => this.loadContent(), 0);
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.switchPage('feedbackList')"><i class="fas fa-arrow-left"></i></button>
            <h2>留言详情</h2>
        </div>
        <div id="fbDetailWrap"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>`;
    },

    _paint() {
        const wrap = document.getElementById('fbDetailWrap');
        if (!wrap || !this._rawDetail) return;
        const fb = this._rawDetail;
        const comments = this._state.comments;
        const likeCount = this._state.likeCount;
        const likedByMe = this._state.likedByMe;
        const likeBtnStyle = likedByMe
            ? 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;'
            : 'background:#f8fafc;color:#475569;border:1px solid #e2e8f0;';

        wrap.innerHTML = `
        <div class="card" id="fbDetailCard">
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
                <div style="width:40px;height:40px;border-radius:50%;background:#def7f5;color:#2b7a78;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">
                    ${(fb.user_name || '?').charAt(0)}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:15px;color:#2b7a78;">${escHtml(fb.title)}</div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:3px;">
                        ${escHtml(fb.user_name || '匿名')} · ${formatDateTime(fb.created_at)}
                    </div>
                    ${fb.page_name ? `<div style="margin-top:6px;"><span class="badge" style="background:#eef2f6;color:#475569;"><i class="fas fa-map-marker-alt" style="margin-right:2px;"></i>来自：${escHtml(fb.page_name)}</span></div>` : ''}
                </div>
            </div>
            <div style="padding:12px;background:#f8fafc;border-radius:8px;font-size:14px;color:#334155;line-height:1.8;white-space:pre-wrap;word-break:break-word;">${escHtml(fb.content || '')}</div>

            <!-- 点赞按钮 + 评论数 -->
            <div style="display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap;">
                <button id="fbLikeBtn" style="${likeBtnStyle}padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;"
                        onclick="PageFeedbackDetail._toggleLike()">
                    <i class="fas fa-heart"></i> ${likedByMe ? '已点赞' : '点赞'} <span id="fbLikeCount">${likeCount}</span>
                </button>
                <div style="margin-left:auto;font-size:12px;color:#64748b;">
                    <i class="fas fa-comment-dots"></i> 评价 <b style="color:#2b7a78;">${comments.length}</b> 条
                </div>
            </div>
        </div>

        <!-- 评论输入 -->
        <div class="card">
            <div class="card-title" style="margin-bottom:8px;"><i class="fas fa-pen"></i> 写评价</div>
            <textarea id="fbCommentInput" rows="3" placeholder="写下你的看法或补充信息..." style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;box-sizing:border-box;resize:vertical;font-family:inherit;line-height:1.6;"></textarea>
            <div style="display:flex;justify-content:flex-end;margin-top:8px;">
                <button class="btn-primary" style="padding:6px 18px;font-size:13px;" onclick="PageFeedbackDetail._submitComment()"><i class="fas fa-paper-plane"></i> 发表评价</button>
            </div>
        </div>

        <!-- 评论列表 -->
        <div class="card">
            <div class="card-title" style="margin-bottom:6px;"><i class="fas fa-comments"></i> 全部评价</div>
            <div id="fbCommentsWrap">
                ${comments.length === 0 ? `<p class="text-muted" style="text-align:center;padding:14px;">暂无评价，抢沙发~</p>` :
                    comments.map(c => `
                    <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                        <div style="display:flex;align-items:flex-start;gap:8px;">
                            <div style="width:28px;height:28px;border-radius:50%;background:#e0f2fe;color:#0369a1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">
                                ${(c.user_name || '?').charAt(0)}
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                                    <span style="font-weight:600;font-size:13px;color:#0f172a;">${escHtml(c.user_name || '匿名')}</span>
                                    <span style="font-size:11px;color:#94a3b8;flex-shrink:0;">${formatDateTime(c.created_at)}</span>
                                </div>
                                <div style="font-size:13px;color:#475569;line-height:1.7;margin-top:3px;white-space:pre-wrap;word-break:break-word;">${escHtml(c.content || '')}</div>
                            </div>
                        </div>
                    </div>`).join('')
                }
            </div>
        </div>`;
    },

    async loadContent() {
        if (!this._id) return;
        try {
            const res = await Api.feedback.detail(this._id);
            this._rawDetail = res.feedback;
            this._state.likeCount = res.likeCount || 0;
            this._state.likedByMe = !!res.likedByMe;
            this._state.comments = res.comments || [];
            this._paint();
        } catch (err) {
            const wrap = document.getElementById('fbDetailWrap');
            if (wrap) wrap.innerHTML = `<div class="card"><p class="text-muted" style="text-align:center;padding:20px;">加载失败: ${err.message || ''}</p></div>`;
        }
    },

    async _toggleLike() {
        if (!this._id) return;
        try {
            const res = await Api.feedback.like(this._id);
            this._state.likedByMe = res.liked;
            this._state.likeCount = res.likeCount;
            // 局部刷新按钮和计数，避免整页重绘丢失评论输入
            const btn = document.getElementById('fbLikeBtn');
            const cnt = document.getElementById('fbLikeCount');
            if (btn) {
                if (res.liked) {
                    btn.style.background = '#fef2f2';
                    btn.style.color = '#dc2626';
                    btn.style.border = '1px solid #fecaca';
                    btn.innerHTML = `<i class="fas fa-heart"></i> 已点赞 <span id="fbLikeCount">${res.likeCount}</span>`;
                } else {
                    btn.style.background = '#f8fafc';
                    btn.style.color = '#475569';
                    btn.style.border = '1px solid #e2e8f0';
                    btn.innerHTML = `<i class="fas fa-heart"></i> 点赞 <span id="fbLikeCount">${res.likeCount}</span>`;
                }
            }
            if (cnt) cnt.textContent = res.likeCount;
        } catch (err) {
            App.toast('点赞失败：' + (err.message || ''));
        }
    },

    async _submitComment() {
        if (!this._id) return;
        const input = document.getElementById('fbCommentInput');
        const content = (input && input.value || '').trim();
        if (!content) { App.toast('请输入评价内容'); return; }
        try {
            const res = await Api.feedback.comment(this._id, content);
            if (res.comment) this._state.comments.push(res.comment);
            if (input) input.value = '';
            // 重绘评论区局部
            this._repaintComments();
            App.toast('评价发表成功');
        } catch (err) {
            App.toast('发表失败：' + (err.message || ''));
        }
    },

    _repaintComments() {
        const wrap = document.getElementById('fbCommentsWrap');
        if (!wrap) return;
        const comments = this._state.comments;
        if (comments.length === 0) {
            wrap.innerHTML = `<p class="text-muted" style="text-align:center;padding:14px;">暂无评价，抢沙发~</p>`;
            return;
        }
        wrap.innerHTML = comments.map(c => `
            <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                <div style="display:flex;align-items:flex-start;gap:8px;">
                    <div style="width:28px;height:28px;border-radius:50%;background:#e0f2fe;color:#0369a1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">
                        ${(c.user_name || '?').charAt(0)}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                            <span style="font-weight:600;font-size:13px;color:#0f172a;">${escHtml(c.user_name || '匿名')}</span>
                            <span style="font-size:11px;color:#94a3b8;flex-shrink:0;">${formatDateTime(c.created_at)}</span>
                        </div>
                        <div style="font-size:13px;color:#475569;line-height:1.7;margin-top:3px;white-space:pre-wrap;word-break:break-word;">${escHtml(c.content || '')}</div>
                    </div>
                </div>
            </div>`).join('');
        // 同步更新详情卡片右上角的评价数量显示
        const cntEl = document.querySelector('#fbDetailCard .fa-comment-dots + b');
        if (cntEl) cntEl.textContent = comments.length;
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
                    const currentUserId = App.state.user?.id;
                    listEl.innerHTML = families.map(f => {
                        const isCurrent = f.id === currentFamilyId;
                        const isCreator = f.creator_id === currentUserId;
                        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9;${isCurrent ? 'background:#f0fdf4;border-radius:8px;padding:12px;' : ''}">
                            <div style="width:40px;height:40px;border-radius:50%;background:#d1e0e8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;"><i class="fas fa-home"></i></div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;">${f.name}${isCurrent ? ' <span style="font-size:11px;background:#16a34a;color:#fff;padding:1px 6px;border-radius:4px;flex-shrink:0;">当前</span>' : ''}</div>
                                <div class="text-muted" style="font-size:12px;">创建者: ${f.creator_name || '未知'}</div>
                                <div style="font-size:12px;color:#6b7280;">邀请码: <span style="font-family:monospace;letter-spacing:1px;">${f.invite_code || ''}</span></div>
                            </div>
                            ${isCreator ? `<button class="btn-outline" style="width:auto;padding:6px 12px;font-size:12px;flex-shrink:0;" onclick="App.editFamilyName('${f.id}','${f.name.replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i></button>` : ''}
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
                                    ${calcAge(elder.birth_date) != null ? `<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${calcAge(elder.birth_date)}岁</span>` : (elder.age ? `<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${elder.age}岁</span>` : '')}
                                    ${elder.blood_type ? `<span style="background:#eef2f6;padding:2px 8px;border-radius:4px;">${elder.blood_type}</span>` : ''}
                                    ${elder.relation ? `<span style="background:#dbeafe;padding:2px 8px;border-radius:4px;">${elder.relation === 'self' && !isCurrent ? '成员' : (relationMap[elder.relation] || '其他')}</span>` : ''}
                                </div>
                                ${elder.allergies ? `<div style="font-size:12px;color:#b91c1c;margin-top:4px;">过敏: ${elder.allergies}</div>` : ''}
                                ${elder.conditions ? `<div style="font-size:12px;color:#92400e;margin-top:2px;">基础病: ${elder.conditions}</div>` : ''}
                            </div>` : '';

                        const isAdmin = m.role === 'admin';
                        return `<div style="display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid #f1f5f9;">
                            <div style="position:relative;flex-shrink:0;">
                                <div style="width:44px;height:44px;border-radius:50%;background:#d1e0e8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;">${m.avatar || m.name.charAt(0)}</div>
                                ${isAdmin ? `<div style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;border:2px solid #fff;" title="管理员"><i class="fas fa-crown"></i></div>` : ''}
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;">${m.name}${isCurrent ? '（我）' : ''}</div>
                                <div class="text-muted">${m.role === 'admin' ? '管理员' : '成员'} · ${m.phone || ''}</div>
                                ${elderInfo}
                            </div>
                            <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
                                ${!isCurrent ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">${m.authorized ? '可修改您的档案' : '仅可查看'}</div><button class="btn-outline" style="width:auto;padding:4px 10px;font-size:11px;${m.authorized ? 'color:#16a34a;border-color:#16a34a;' : 'color:#dc2626;border-color:#dc2626;'}" onclick="App.toggleMemberAuth('${m.id}')">${m.authorized ? '已授权修改' : '授权修改'}</button>` : ''}
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
            <div style="background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;line-height:1.6;">
                <i class="fas fa-exclamation-triangle"></i> <b>隐私提示：</b>加入家庭后，您的病历、处方、检查报告等资料将向家庭内所有人公开，家庭成员可查看。在加入家庭后，可在成员权限管理页设置对特定成员开放修改权限。
            </div>
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
            const isSelf = m.relation === 'self' && m.user_id === App.state.user?.id;
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
            <div class="form-group"><label>药品名称 *</label><input id="medName" placeholder="输入名称或拼音首字母（如 SHP）" autocomplete="off" onclick="DrugSuggest.showSuggestions(this)" oninput="DrugSuggest.onInput(this,'medDrugCode',{specDosage:'medSpecDosage',specDosageUnit:'medSpecDosageUnit',unitCapacity:'medUnitCap',unitCapacityUnit:'medUnitCapUnit',manufacturer:'medManu'})"><input type="hidden" id="medDrugCode"></div>
            <div class="form-group"><label>规格（每片/袋含量）</label><div style="display:flex;gap:8px"><input id="medSpecDosage" type="number" step="1" min="0" placeholder="如 0.25" style="flex:2"><select id="medSpecDosageUnit" style="flex:1"><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="μg">μg</option></select></div></div>
            <div class="form-group"><label>单位容量（每盒/瓶数量）</label><div style="display:flex;gap:8px"><input id="medUnitCap" type="number" step="1" min="0" placeholder="如 20" style="flex:2"><select id="medUnitCapUnit" style="flex:1"><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="瓶">瓶</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label>生产厂商</label><input id="medManu" placeholder="生产单位"></div>
            <div class="form-group"><label>数量</label><div style="display:flex;gap:8px"><input id="medQty" type="number" step="1" min="1" value="1" style="flex:2"><select id="medQtyUnit" style="flex:1"><option value="盒">盒</option><option value="瓶">瓶</option><option value="件">件</option><option value="包">包</option></select></div></div>
            <div class="form-group"><label>每次剂量</label><div style="display:flex;gap:8px"><input id="medDoseAmount" type="number" step="1" min="0" placeholder="如 5" style="flex:2"><select id="medDoseUnit" style="flex:1"><option value="mg">mg</option><option value="g">g</option><option value="ml">ml</option><option value="μg">μg</option><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label>每日次数</label><input id="medFreq" type="number" step="1" min="1" max="4" value="1" oninput="MedTimesUI.render('med')"></div>
            <div class="form-group"><label>服用时间段</label><div id="medTimeSlots"></div></div>
            <div class="form-group"><label>开始日期</label><input id="medStart" type="text" readonly onclick="CalendarPicker.attach(this,{max:'today'})" placeholder="点击选择日期" style="background:#fff;"></div>
            <div class="form-group"><label>有效期 *</label><input id="medExpiryDate" type="text" readonly onclick="CalendarPicker.attach(this)" placeholder="点击选择日期" style="background:#fff;"></div>
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
            const isSelf = m.relation === 'self' && m.user_id === App.state.user?.id;
            const label = isSelf ? m.name + '（我）' : m.name;
            return `<option value="${m.id}" ${m.id === App.state.currentMemberId ? 'selected' : ''}>${label}</option>`;
        }).join('');
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>添加病历</h2>
            <button style="background:none;border:none;cursor:pointer;font-size:20px;color:#2b7a78;margin-left:auto;padding:8px;" onclick="App.startScan()" title="拍照识别"><i class="fas fa-camera"></i></button>
        </div>
        <div class="card">
            <div class="form-group" style="background:#f0f7ff;border-radius:8px;padding:10px;border:1px dashed #2b7a78;position:relative;">
                <label style="font-size:13px;color:#2b7a78;display:flex;align-items:center;gap:4px;"><i class="fas fa-paste"></i> 粘贴文本自动识别</label>
                <button type="button" onclick="PageAddRecord.showPasteFullscreen()" style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px;padding:4px;" title="全屏编辑"><i class="fas fa-expand"></i></button>
                <textarea id="pasteRecognizeBox" placeholder="将病历/处方/检查报告的文字内容粘贴到此处，自动识别并填写表单字段" style="width:100%;min-height:50px;max-height:100px;font-size:13px;border:1px solid #ddd;border-radius:6px;padding:8px;box-sizing:border-box;" onpaste="PageAddRecord.onPasteRecognize(event)"></textarea>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                    <span style="font-size:11px;color:#94a3b8;">自动识别类型，粘贴后自动填写</span>
                    <button type="button" onclick="PageAddRecord.onPasteRecognize(null)" style="background:#2b7a78;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">识别</button>
                </div>
            </div>
            <div class="form-group"><label>关联成员 *</label><select id="recordElderId" onchange="PageAddRecord.onElderChange(this.value)">${memberOptions}</select></div>
            <div id="recordRelatedGroup" class="form-group" style="display:none;"><label>关联病历</label><select id="recordRelated" onchange="PageAddRecord.onRelatedChange(this.value)"><option value="">无匹配，同步创建</option></select><div style="font-size:12px;color:#ea7e2c;margin-top:4px;">如未选择病历记录，在保存时，将自动创建一条病历记录。</div></div>
            <div class="form-group"><label>类型</label><select id="recordType" onchange="PageAddRecord.onTypeChange(this.value)"><option value="病历">病历</option><option value="检查报告">检查报告</option><option value="处方">处方</option></select></div>
            <div id="recordFieldsMedical">
                <div class="form-group"><label id="recordDateLabel">就诊日期</label><input id="recordDate" type="text" readonly onclick="CalendarPicker.attach(this,{max:'today'})" placeholder="点击选择日期" style="background:#fff;"></div>
                <div class="form-group"><label>医院 *</label><input id="recordHospital" placeholder="输入医院名称或拼音首字母" autocomplete="off" onclick="HospitalSuggest.showSuggestions(this)" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室 *</label><input id="recordDept" placeholder="输入科室名称或拼音首字母" autocomplete="off" onclick="DeptSuggest.showSuggestions(this)" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>主诉</label><textarea id="recordComplaint" placeholder="主要症状"></textarea></div>
                <div class="form-group"><label>诊断 *</label><input id="recordDiagnosis" placeholder="诊断结果"></div>
                <div class="form-group"><label>医嘱</label><textarea id="recordOrders" placeholder="医嘱内容"></textarea></div>
                <div class="form-group"><label>医生</label><input id="recordDoctor" placeholder="主治医生"></div>
            </div>
            <div id="recordFieldsReport" style="display:none;">
                <div class="form-group"><label>检查日期</label><input id="recordDate2" type="text" readonly onclick="CalendarPicker.attach(this,{max:'today'})" placeholder="点击选择日期" style="background:#fff;"></div>
                <div class="form-group"><label>医院 *</label><input id="recordHospital2" placeholder="输入医院名称或拼音首字母" autocomplete="off" onclick="HospitalSuggest.showSuggestions(this)" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室 *</label><input id="recordDept2" placeholder="输入科室名称或拼音首字母" autocomplete="off" onclick="DeptSuggest.showSuggestions(this)" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>检查项目 *</label><input id="recordExamName" placeholder="如：胸部CT平扫"></div>
                <div class="form-group"><label>检查所见</label><textarea id="recordFindings" rows="4" placeholder="检查所见内容"></textarea></div>
                <div class="form-group"><label>报告结论</label><textarea id="recordConclusion" rows="3" placeholder="报告结论内容"></textarea></div>
                <div class="form-group"><label>医生</label><input id="recordDoctor2" placeholder="申请医生"></div>
            </div>
            <div id="recordFieldsPrescription" style="display:none;">
                <div class="form-group"><label>就诊日期 *</label><input id="recordDate3" type="text" readonly onclick="CalendarPicker.attach(this,{max:'today'})" placeholder="点击选择日期" style="background:#fff;"></div>
                <div class="form-group"><label>医院 *</label><input id="recordMedHospital" placeholder="输入医院名称或拼音首字母" autocomplete="off" onclick="HospitalSuggest.showSuggestions(this)" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室 *</label><input id="recordMedDept" placeholder="输入科室名称或拼音首字母" autocomplete="off" onclick="DeptSuggest.showSuggestions(this)" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>诊断</label><input id="recordMedDiagnosis" placeholder="诊断结果"></div>
                <div class="form-group"><label>医生</label><input id="recordMedDoctor" placeholder="主治医生"></div>
                <div id="recordMedList"></div>
            </div>
            <div class="form-group"><label>图片</label><div id="recordImages"></div></div>
            <button class="btn-primary" onclick="App.saveRecord()">保存</button>
        </div>`;
    },

    onTypeChange(type) {
        const medicalFields = document.getElementById('recordFieldsMedical');
        const reportFields = document.getElementById('recordFieldsReport');
        const prescriptionFields = document.getElementById('recordFieldsPrescription');
        const relatedGroup = document.getElementById('recordRelatedGroup');
        // 关联病历下拉仅对"检查报告/处方"显示
        const showRelated = type === '检查报告' || type === '处方';
        if (relatedGroup) relatedGroup.style.display = showRelated ? 'block' : 'none';
        if (type === '检查报告') {
            medicalFields.style.display = 'none';
            reportFields.style.display = 'block';
            prescriptionFields.style.display = 'none';
        } else if (type === '处方') {
            medicalFields.style.display = 'none';
            reportFields.style.display = 'none';
            prescriptionFields.style.display = 'block';
            // 懒初始化多药品列表（已有区块时保留已填数据，不重置）
            this._ensureMedList();
        } else {
            medicalFields.style.display = 'block';
            reportFields.style.display = 'none';
            prescriptionFields.style.display = 'none';
        }
        // 若已选择关联病历，切换类型后重新填充并锁定对应字段
        if (showRelated) {
            const relatedSel = document.getElementById('recordRelated');
            if (relatedSel && relatedSel.value) {
                this.onRelatedChange(relatedSel.value);
            }
        }
        // 若已粘贴识别文本，切换类型后按新类型重新识别填写（不同类型字段不同，需重新解析）
        const pasteBox = document.getElementById('pasteRecognizeBox');
        if (pasteBox && pasteBox.value.trim()) {
            this.onPasteRecognize(null);
        }
    },

    afterRender() {
        ImageUploader.init('recordImages');
        // 页面每次进入都会整体重渲染，清空药品区块的脏状态（旧 uid 指向的 DOM 已不存在）
        this._medBlocks = [];
        this._medExpandedUid = null;
        const today = new Date().toISOString().slice(0,10);
        // 设置就诊/检查日期缺省为当天（处方的就诊日期不预填，保持用户手动选择）
        ['recordDate','recordDate2'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.value) el.value = today;
        });
        // 处方类型时初始化多药品列表（首次进入创建一个空区块）
        if (document.getElementById('recordType').value === '处方') {
            this._ensureMedList();
        }
        // 加载关联病历下拉数据（处方/报告用）
        const elderId = document.getElementById('recordElderId')?.value;
        if (elderId) this.onElderChange(elderId);
    },

    // 成员切换时刷新关联病历下拉
    async onElderChange(elderId) {
        if (!elderId) return;
        await App._loadRelatedRecords(elderId, 'recordRelated');
    },

    // 选择关联病历时，自动将该病历的医院/科室/诊断/医生等信息填入对应表单字段，
    // 并将相关字段置灰只读（即使值为空也锁定）；取消选择时解锁字段允许手动修改
    async onRelatedChange(recordId) {
        const type = document.getElementById('recordType').value;
        const fields = type === '处方'
            ? ['recordMedHospital', 'recordMedDept', 'recordMedDiagnosis', 'recordMedDoctor']
            : type === '检查报告'
            ? ['recordHospital2', 'recordDept2']
            : [];
        if (!recordId) {
            // 取消关联：解锁字段，允许手动修改
            fields.forEach(id => this._setFieldReadOnly(id, false));
            return;
        }
        try {
            const res = await Api.records.get(recordId);
            const rec = res.record || {};

            // 检查当前表单值与病历值是否有差异
            const mapping = type === '处方'
                ? [
                    { formId: 'recordMedHospital', key: 'hospital', label: '医院' },
                    { formId: 'recordMedDept', key: 'department', label: '科室' },
                    { formId: 'recordMedDiagnosis', key: 'diagnosis', label: '诊断' },
                    { formId: 'recordMedDoctor', key: 'doctor', label: '医生' },
                  ]
                : type === '检查报告'
                ? [
                    { formId: 'recordHospital2', key: 'hospital', label: '医院' },
                    { formId: 'recordDept2', key: 'department', label: '科室' },
                  ]
                : [];

            const diffs = [];
            for (const m of mapping) {
                const formVal = (document.getElementById(m.formId)?.value || '').trim();
                const recVal = (rec[m.key] || '').trim();
                if (formVal && formVal !== recVal) {
                    diffs.push({ label: m.label, formVal, recVal: recVal || '空' });
                }
            }

            // 如果有差异，弹出确认框（表格形式）
            if (diffs.length > 0) {
                const tableHtml = `
                    <div style="margin-bottom:12px;font-weight:500;">检测到以下字段与已填写内容不同：</div>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
                        <thead>
                            <tr style="background:#f8f9fa;">
                                <th style="padding:8px 10px;text-align:left;border:1px solid #e9ecef;font-weight:500;color:#495057;">字段</th>
                                <th style="padding:8px 10px;text-align:left;border:1px solid #e9ecef;font-weight:500;color:#495057;">表单</th>
                                <th style="padding:8px 10px;text-align:left;border:1px solid #e9ecef;font-weight:500;color:#495057;">病历</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${diffs.map(d => `
                                <tr>
                                    <td style="padding:8px 10px;border:1px solid #e9ecef;color:#2b7a78;font-weight:500;white-space:nowrap;">${d.label}</td>
                                    <td style="padding:8px 10px;border:1px solid #e9ecef;color:#333;word-break:break-all;max-width:140px;">${d.formVal}</td>
                                    <td style="padding:8px 10px;border:1px solid #e9ecef;color:#333;word-break:break-all;max-width:140px;">${d.recVal}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div style="font-size:13px;color:#6c757d;text-align:center;">是否用病历信息覆盖？</div>
                `;
                const confirmed = await App._confirmDialog(tableHtml, { htmlContent: true });
                if (confirmed === 'cancel') {
                    // 用户取消：恢复下拉框选择，不执行覆盖
                    const sel = document.getElementById('recordRelated');
                    if (sel) sel.value = '';
                    return;
                }
                if (confirmed === 'new') {
                    // 用户选"否，新建"：也不执行覆盖
                    const sel = document.getElementById('recordRelated');
                    if (sel) sel.value = '';
                    return;
                }
            }

            // 用户确认或无差异：写入病历信息
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            if (type === '处方') {
                setVal('recordMedHospital', rec.hospital);
                setVal('recordMedDept', rec.department);
                setVal('recordMedDiagnosis', rec.diagnosis);
                setVal('recordMedDoctor', rec.doctor);
            } else if (type === '检查报告') {
                setVal('recordHospital2', rec.hospital);
                setVal('recordDept2', rec.department);
            }
            // 选择病历后置灰只读
            fields.forEach(id => this._setFieldReadOnly(id, true));
        } catch (e) { /* 静默失败 */ }
    },

    // ===== 处方多药品区块管理 =====
    // 使用稳定 uid 作为字段前缀，避免删除/重排导致状态错乱
    _medUid: 0,
    _medBlocks: [],          // [{ uid }]
    _medExpandedUid: null,   // 当前展开的区块 uid

    // 生成单个药品区块 HTML（uid 作为字段前缀 recordMed${uid}）
    _medBlockHtml(uid) {
        const p = `recordMed${uid}`;
        return `
        <div class="med-block" data-uid="${uid}" id="medBlock${uid}">
            <div class="med-block-header" onclick="PageAddRecord.expandMed(${uid})">
                <span class="med-arrow">▶</span>
                <span class="med-title" id="medTitle${uid}"><span class="med-empty">药品（未填写）</span></span>
                <button type="button" class="med-remove" onclick="event.stopPropagation();PageAddRecord.removeMed(${uid})" title="删除该药品">×</button>
            </div>
            <div class="med-block-content">
                <div class="form-group"><label>药品名称 *</label><input id="${p}Name" placeholder="输入名称或拼音首字母" autocomplete="off" onclick="DrugSuggest.showSuggestions(this)" oninput="DrugSuggest.onInput(this,'${p}Code',{specDosage:'${p}SpecDosage',specDosageUnit:'${p}SpecDosageUnit',unitCapacity:'${p}UnitCap',unitCapacityUnit:'${p}UnitCapUnit',manufacturer:'${p}Manu'});PageAddRecord._updateHeader(${uid})"><input type="hidden" id="${p}Code"></div>
                <div class="form-group"><label>规格（每片/袋含量） *</label><div style="display:flex;gap:8px"><input id="${p}SpecDosage" type="number" step="1" min="0" placeholder="如 0.25" style="flex:2"><select id="${p}SpecDosageUnit" style="flex:1"><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="μg">μg</option></select></div></div>
                <div class="form-group"><label>单位容量（每盒/瓶数量） *</label><div style="display:flex;gap:8px"><input id="${p}UnitCap" type="number" step="1" min="0" placeholder="如 20" style="flex:2"><select id="${p}UnitCapUnit" style="flex:1"><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="瓶">瓶</option><option value="贴">贴</option></select></div></div>
                <div class="form-group"><label>生产厂商</label><input id="${p}Manu" placeholder="生产单位"></div>
                <div class="form-group"><label>数量 *</label><div style="display:flex;gap:8px"><input id="${p}Qty" type="number" step="1" min="1" value="1" style="flex:2"><select id="${p}QtyUnit" style="flex:1"><option value="盒">盒</option><option value="瓶">瓶</option><option value="件">件</option><option value="包">包</option></select></div></div>
                <div class="form-group"><label>有效期</label><input id="${p}ExpiryDate" type="text" readonly onclick="CalendarPicker.attach(this)" placeholder="点击选择日期" style="background:#fff;"></div>
                <div class="form-group"><label>每次剂量 *</label><div style="display:flex;gap:8px"><input id="${p}DoseAmount" type="number" step="1" min="0" placeholder="如 5" style="flex:2"><select id="${p}DoseUnit" style="flex:1"><option value="mg">mg</option><option value="g">g</option><option value="ml">ml</option><option value="μg">μg</option><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="贴">贴</option></select></div></div>
                <div class="form-group"><label>每日次数 *</label><input id="${p}Freq" type="number" step="1" min="1" max="4" value="1" oninput="MedTimesUI.render('${p}')"></div>
                <div class="form-group"><label>服用时间段 *</label><div id="${p}TimeSlots"></div></div>
                <div class="form-group"><label>备注</label><input id="${p}Note" placeholder="如：餐后服用"></div>
                <button type="button" class="add-next-btn" onclick="PageAddRecord.addNextMed()">+ 添加下一个</button>
            </div>
        </div>`;
    },

    // 初始化药品列表：清空容器，创建一个展开的空区块
    initMedList() {
        const container = document.getElementById('recordMedList');
        if (!container) return;
        container.innerHTML = '';
        this._medBlocks = [];
        this._medUid = 0;
        this._medExpandedUid = null;
        this._appendBlock();
    },

    // 懒初始化：仅在尚未创建任何区块时初始化，避免切换类型时丢失已填数据
    _ensureMedList() {
        if (!this._medBlocks || this._medBlocks.length === 0) {
            this.initMedList();
        }
    },

    // 追加一个新区块并展开它
    _appendBlock() {
        const container = document.getElementById('recordMedList');
        if (!container) return null;
        const uid = ++this._medUid;
        const wrap = document.createElement('div');
        wrap.innerHTML = this._medBlockHtml(uid);
        const blockEl = wrap.firstElementChild;
        container.appendChild(blockEl);
        this._medBlocks.push({ uid });
        // 初始化该区块的服用时间段状态
        const p = `recordMed${uid}`;
        delete MedTimesUI._state[p];
        MedTimesUI.render(p);
        this._setExpanded(uid);
        return uid;
    },

    // 切换展开的区块：折叠其他，仅展开指定 uid（同一时间只有一个展开）
    expandMed(uid) {
        if (this._medExpandedUid === uid) {
            // 已展开，点击则保持展开（避免全部折叠无法操作）
            return;
        }
        this._setExpanded(uid);
    },

    _setExpanded(uid) {
        this._medBlocks.forEach(b => {
            const el = document.getElementById(`medBlock${b.uid}`);
            if (!el) return;
            const content = el.querySelector('.med-block-content');
            if (b.uid === uid) {
                el.classList.add('expanded');
                if (content) content.style.display = '';
                this._updateHeader(b.uid);
            } else {
                el.classList.remove('expanded');
                if (content) content.style.display = 'none';
                this._updateHeader(b.uid);
            }
        });
        this._medExpandedUid = uid;
    },

    // 更新区块标题：展开时显示“药品 N”，折叠时显示药品名称
    _updateHeader(uid) {
        const titleEl = document.getElementById(`medTitle${uid}`);
        if (!titleEl) return;
        const nameEl = document.getElementById(`recordMed${uid}Name`);
        const name = nameEl ? nameEl.value.trim() : '';
        // 计算序号（按当前 _medBlocks 顺序）
        const idx = this._medBlocks.findIndex(b => b.uid === uid);
        const seq = idx >= 0 ? idx + 1 : uid;
        if (name) {
            titleEl.innerHTML = `药品${seq}：<span class="med-name-text">${this._escHtml(name)}</span>`;
        } else {
            titleEl.innerHTML = `药品${seq}：<span class="med-empty">未填写</span>`;
        }
    },

    _escHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    },

    // 全屏编辑粘贴文本
    showPasteFullscreen() {
        const source = document.getElementById('pasteRecognizeBox');
        const text = source ? source.value : '';
        let overlay = document.getElementById('pasteFullscreenOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'pasteFullscreenOverlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)PageAddRecord.closePasteFullscreen()">
                <div style="background:#fff;border-radius:12px;width:100%;max-width:820px;height:92vh;display:flex;flex-direction:column;overflow:hidden;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eee;">
                        <span style="font-weight:600;"><i class="fas fa-paste" style="color:#2b7a78;margin-right:6px;"></i> 粘贴文本编辑</span>
                        <button type="button" onclick="PageAddRecord.closePasteFullscreen(true)" style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;line-height:1;" title="退出全屏"><i class="fas fa-compress"></i></button>
                    </div>
                    <textarea id="pasteFullscreenText" style="flex:1;width:100%;border:none;padding:16px;font-size:14px;line-height:1.7;white-space:pre-wrap;resize:none;outline:none;font-family:inherit;color:#333;" placeholder="粘贴或输入病历/处方/检查报告文本...">${this._escHtml(text)}</textarea>
                </div>
            </div>`;
    },

    // 关闭全屏编辑器
    closePasteFullscreen(syncBack) {
        if (syncBack !== false) {
            const ta = document.getElementById('pasteFullscreenText');
            if (ta) {
                const source = document.getElementById('pasteRecognizeBox');
                if (source) source.value = ta.value;
            }
        }
        const overlay = document.getElementById('pasteFullscreenOverlay');
        if (overlay) overlay.innerHTML = '';
    },

    // 粘贴文本自动识别：event 来自 onpaste，传 null 时从文本框读取（手动点"识别"按钮）
    async onPasteRecognize(event) {
        if (this._pasteRecognizing) return; // 防止 onTypeChange 递归触发
        this._pasteRecognizing = true;
        try {
            let text;
            if (event && event.clipboardData) {
                text = event.clipboardData.getData('text');
                event.preventDefault();
                const box = document.getElementById('pasteRecognizeBox');
                if (box) box.value = text;
            } else {
                text = document.getElementById('pasteRecognizeBox')?.value || '';
            }
            if (!text || !text.trim()) { App.toast('请粘贴文本内容'); return; }
            // 用 'auto' 让后端自动判定类型，不再读取 recordType 下拉
            App.toast('正在识别...');
            const res = await Api.ocr.parse('auto', text);
            // 后端返回 detectedType，映射为中文并自动切换表单类型
            const typeMap = { 'record': '病历', 'report': '检查报告', 'prescription': '处方', 'drug': '处方' };
            const type = typeMap[res.detectedType] || '病历';
            // 自动切换类型下拉（触发 onTypeChange 显示对应字段区域）
            const typeSel = document.getElementById('recordType');
            if (typeSel && typeSel.value !== type) {
                typeSel.value = type;
                this.onTypeChange(type);
            }
            await this._applyParsedToForm(res.parsed, type);
            App.toast(`识别完成（${type}），已填写表单字段`);
        } catch (err) {
            App.toast('识别失败: ' + err.message);
        } finally {
            this._pasteRecognizing = false;
        }
    },

    // 将解析结果填入手动表单字段
    async _applyParsedToForm(parsed, type) {
        const setVal = (id, val) => { if (val != null && val !== '') { const el = document.getElementById(id); if (el) el.value = val; } };
        const matchHosp = (id, val) => { if (val != null && val !== '') HospitalSuggest.matchAndFill(document.getElementById(id), val); };
        const matchDept = (id, val) => { if (val != null && val !== '') DeptSuggest.matchAndFill(document.getElementById(id), val); };
        if (type === '病历') {
            matchHosp('recordHospital', parsed.hospital);
            matchDept('recordDept', parsed.department);
            setVal('recordDate', parsed.visitDate);
            setVal('recordDiagnosis', parsed.diagnosis);
            setVal('recordComplaint', parsed.chiefComplaint);
            setVal('recordOrders', parsed.orders);
            setVal('recordDoctor', parsed.doctor);
        } else if (type === '检查报告') {
            matchHosp('recordHospital2', parsed.hospital);
            matchDept('recordDept2', parsed.department);
            setVal('recordDate2', parsed.visitDate);
            setVal('recordExamName', parsed.examName);
            setVal('recordFindings', parsed.findings);
            setVal('recordConclusion', parsed.conclusion);
            setVal('recordDoctor2', parsed.doctor);
        } else if (type === '处方') {
            matchHosp('recordMedHospital', parsed.hospital);
            matchDept('recordMedDept', parsed.department);
            setVal('recordDate3', parsed.visitDate);
            setVal('recordMedDiagnosis', parsed.diagnosis);
            setVal('recordMedDoctor', parsed.doctor);
            if (parsed.medications && parsed.medications.length > 0) {
                await this._applyMedsToBlocks(parsed.medications);
            }
        }
        // OCR 完成后，尝试自动匹配关联病历（针对检查报告/处方）
        if (type === '检查报告' || type === '处方') {
            await this._tryAutoMatchRelatedRecord(type);
        }
    },

    // 根据就诊日期+医院+科室自动匹配关联病历
    async _tryAutoMatchRelatedRecord(type) {
        const elderId = document.getElementById('recordElderId')?.value;
        if (!elderId) return;

        const dateId = type === '检查报告' ? 'recordDate2' : 'recordDate3';
        const hospId = type === '检查报告' ? 'recordHospital2' : 'recordMedHospital';
        const deptId = type === '检查报告' ? 'recordDept2' : 'recordMedDept';

        const visitDate = document.getElementById(dateId)?.value;
        const hospital = document.getElementById(hospId)?.value;
        const department = document.getElementById(deptId)?.value;

        if (!visitDate || !hospital || !department) return;

        try {
            const res = await Api.records.getAll(elderId);
            const records = (res.records || []).filter(r => r.type === '病历');
            const matched = records.find(r =>
                r.visitDate === visitDate &&
                r.hospital && hospital && r.hospital.trim() === hospital.trim() &&
                r.department && department && r.department.trim() === department.trim()
            );
            if (matched) {
                const sel = document.getElementById('recordRelated');
                if (sel) {
                    // 确保下拉框已加载该选项
                    const exists = Array.from(sel.options).some(o => o.value === matched.id);
                    if (!exists) {
                        sel.innerHTML += `<option value="${matched.id}">${matched.visitDate || ''} ${matched.diagnosis || '未填写'}</option>`;
                    }
                    sel.value = matched.id;
                    this.onRelatedChange(matched.id);
                    App.toast(`已自动匹配关联病历：${matched.diagnosis || '未填写'}`);
                }
            }
        } catch (e) { /* 静默失败 */ }
    },

    // 将解析的药品列表填入多药品区块
    async _applyMedsToBlocks(meds) {
        // 重置药品列表
        this._medBlocks = [];
        this._medExpandedUid = null;
        const listEl = document.getElementById('recordMedList');
        if (listEl) listEl.innerHTML = '';
        // 为每个药品创建区块并填充
        for (const med of meds) {
            this._appendBlock();
            const b = this._medBlocks[this._medBlocks.length - 1];
            const p = `recordMed${b.uid}`;
            const setVal = (suffix, val) => { if (val != null && val !== '') { const el = document.getElementById(`${p}${suffix}`); if (el) el.value = val; } };
            setVal('Name', med.name);
            setVal('SpecDosage', med.specDosage);
            setVal('SpecDosageUnit', med.specDosageUnit);
            setVal('UnitCap', med.unitCap);
            setVal('Qty', med.quantity);
            setVal('QtyUnit', med.quantityUnit);
            setVal('DoseAmount', med.doseAmount);
            setVal('DoseUnit', med.doseUnit);
            // 频次文本转数字+时间段
            if (med.frequency) {
                const { frequency } = App._freqTextToCount(med.frequency);
                const freqEl = document.getElementById(`${p}Freq`);
                if (freqEl) freqEl.value = frequency;
                MedTimesUI._state[p] = new Set(MedTimesUI.slots.slice(0, frequency).map(s => s.key));
                MedTimesUI.render(p);
            }
            this._updateHeader(b.uid);
            // 药品名与数据库匹配：精确则自动填充规格/厂商等并置灰，不精确则显示红色提示与相似项
            // 串行 await 以避免并发渲染下拉时共享 _lastDrugs 状态错乱
            if (med.name) {
                const nameInput = document.getElementById(`${p}Name`);
                if (nameInput) {
                    await DrugSuggest.matchAndFill(nameInput, med.name, { specDosage: `${p}SpecDosage`, specDosageUnit: `${p}SpecDosageUnit`, unitCapacity: `${p}UnitCap`, unitCapacityUnit: `${p}UnitCapUnit`, manufacturer: `${p}Manu` });
                }
            }
        }
        // 展开第一个区块，折叠其他
        if (this._medBlocks.length > 0) {
            this._setExpanded(this._medBlocks[0].uid);
        }
    },

    // “+ 添加下一个”：追加新区块并展开（自动折叠当前）
    addNextMed() {
        this._appendBlock();
        // 滚动到新区块
        const newEl = document.getElementById(`medBlock${this._medExpandedUid}`);
        if (newEl) newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // 删除指定区块；若删的是当前展开项，则展开最后一个
    removeMed(uid) {
        const idx = this._medBlocks.findIndex(b => b.uid === uid);
        if (idx < 0) return;
        // 至少保留一个区块：若只剩一个，清空其内容而非移除
        if (this._medBlocks.length <= 1) {
            const p = `recordMed${uid}`;
            ['Name','Code','SpecDosage','UnitCap','Manu','Qty','ExpiryDate','DoseAmount','Note'].forEach(k => {
                const el = document.getElementById(`${p}${k}`);
                if (el) el.value = '';
            });
            delete MedTimesUI._state[p];
            MedTimesUI.render(p);
            this._updateHeader(uid);
            return;
        }
        const el = document.getElementById(`medBlock${uid}`);
        if (el) el.remove();
        this._medBlocks.splice(idx, 1);
        delete MedTimesUI._state[`recordMed${uid}`];
        // 重新计算序号并更新所有标题
        this._medBlocks.forEach(b => this._updateHeader(b.uid));
        // 若删除的是展开项，展开最后一个
        if (this._medExpandedUid === uid) {
            const last = this._medBlocks[this._medBlocks.length - 1];
            if (last) this._setExpanded(last.uid);
        } else {
            // 当前展开项未变，但序号可能变了，刷新其标题
            if (this._medExpandedUid != null) this._updateHeader(this._medExpandedUid);
        }
    },

    // 保存前校验所有药品：调用 DrugSuggest.ensure 并校验名称/有效期
    // 返回有效药品区块列表 [{uid, prefix}]；返回 null 表示校验未通过
    // 必填：药品名称/规格/单位容量/数量/每次剂量/每日次数/服用时间段
    // 选填：生产厂商/有效期/备注
    async ensureAllMeds() {
        const blocks = this._medBlocks.slice();
        // [字段后缀, 中文标签] —— 数值/文本类必填项
        const requiredFields = [
            ['SpecDosage', '规格'],
            ['UnitCap', '单位容量'],
            ['Qty', '数量'],
            ['DoseAmount', '每次剂量'],
            ['Freq', '每日次数'],
        ];
        for (const b of blocks) {
            const p = `recordMed${b.uid}`;
            const nameEl = document.getElementById(`${p}Name`);
            if (!nameEl || !nameEl.value.trim()) continue; // 跳过空区块
            const name = nameEl.value.trim();
            // 校验必填数值/文本字段（被药品库锁定 disabled 的字段必有值，跳过）
            for (const [suffix, label] of requiredFields) {
                const el = document.getElementById(`${p}${suffix}`);
                if (el && !el.disabled && !String(el.value).trim()) {
                    App.toast(`请填写药品“${name}”的${label}`);
                    this._setExpanded(b.uid);
                    return null;
                }
            }
            // 校验服用时间段至少一个
            const times = MedTimesUI.getTimes(p);
            if (!times || times.length === 0) {
                App.toast(`请选择药品“${name}”的服用时间段`);
                this._setExpanded(b.uid);
                return null;
            }
            // 保存前校验药品是否存在，不存在提示选择或新建
            if (false === await DrugSuggest.ensure(nameEl)) return null;
        }
        return blocks.map(b => ({ uid: b.uid, prefix: `recordMed${b.uid}` }));
    },

    // 设置字段只读/可编辑状态并切换灰色样式
    _setFieldReadOnly(id, readOnly) {
        const el = document.getElementById(id);
        if (!el) return;
        el.readOnly = readOnly;
        el.style.backgroundColor = readOnly ? '#f1f5f9' : '';
        el.style.color = readOnly ? '#64748b' : '';
        el.style.cursor = readOnly ? 'not-allowed' : '';
    }
};

// ---------- 添加药品（右上角相机图标可切换拍照识别）----------
const PageAddDrug = {
    render() {
        const members = App.state.members || [];
        const current = App.state.currentMemberId;
        const elderOptions = members.map(m => {
            const label = (m.relation === 'self' && members.length > 1 && m.name === App.state.user?.name)
                ? `${m.name}（我）`
                : (m.name || '未命名成员');
            return `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${label}</option>`;
        }).join('');
        return `
        <div class="sub-header">
            <button class="back-btn" onclick="App.goBack()"><i class="fas fa-arrow-left"></i></button>
            <h2>添加药品</h2>
            <button style="background:none;border:none;cursor:pointer;font-size:20px;color:#2b7a78;margin-left:auto;padding:8px;" onclick="App.startScan('药品')" title="拍照识别"><i class="fas fa-camera"></i></button>
        </div>
        <div class="card">
            <div class="form-group"><label>服药人 *</label><select id="drugElder">${elderOptions || '<option value="">请先添加家庭成员</option>'}</select></div>
            <div class="form-group"><label>药品名称 *</label><input id="drugName" placeholder="输入名称或拼音首字母（如 SHP）" autocomplete="off" onclick="DrugSuggest.showSuggestions(this)" oninput="DrugSuggest.onInput(this,'drugCodeHidden',{specDosage:'specDosage',specDosageUnit:'specDosageUnit',unitCapacity:'unitCap',unitCapacityUnit:'unitCapUnit',manufacturer:'drugManu'})"><input type="hidden" id="drugCodeHidden"></div>
            <div class="form-group"><label>规格（每片/袋含量） *</label><div style="display:flex;gap:8px"><input id="specDosage" type="number" step="1" min="0" placeholder="如 0.25" style="flex:2"><select id="specDosageUnit" style="flex:1"><option value="g">g</option><option value="mg">mg</option><option value="ml">ml</option><option value="μg">μg</option></select></div></div>
            <div class="form-group"><label>单位容量（每盒/瓶数量） *</label><div style="display:flex;gap:8px"><input id="unitCap" type="number" step="1" min="0" placeholder="如 20" style="flex:2"><select id="unitCapUnit" style="flex:1"><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="瓶">瓶</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label>生产厂商</label><input id="drugManu" placeholder="生产单位"></div>
            <div class="form-group"><label>数量 *</label><div style="display:flex;gap:8px"><input id="drugQty" type="number" step="1" min="1" value="1" style="flex:2"><select id="drugQtyUnit" style="flex:1"><option value="盒">盒</option><option value="瓶">瓶</option><option value="袋">袋</option><option value="支">支</option><option value="包">包</option><option value="板">板</option></select></div></div>
            <div class="form-group"><label>有效期 *</label><input id="drugExp" type="text" readonly onclick="CalendarPicker.attach(this)" placeholder="点击选择日期" style="background:#fff;"></div>
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
            const records = res.inventoryLogs || [];
            const el = document.getElementById('drugDetailContent');
            if (!el) return;

            let statusHtml = '<span style="color:#16a34a;">✔ 有效</span>';
            if (drug.status === 'expired') statusHtml = '<span class="danger">⛔ 已过期</span>';
            else if (drug.status === 'expiring_soon') statusHtml = '<span class="danger">⚠ 即将过期</span>';

            let specLine = drug.specification || '';
            if (!specLine) {
                const specParts = [];
                if (drug.specDosage != null) specParts.push(`每${drug.unitCapacityUnit || '片'}${drug.specDosage}${drug.specDosageUnit || ''}`);
                if (drug.unitCapacity != null) specParts.push(`每${drug.quantityUnit || '盒'}${drug.unitCapacity}${drug.unitCapacityUnit || '片'}`);
                specLine = specParts.join('，');
            }

            let imagesHtml = '';
            if (drug.images && drug.images.length > 0) {
                const urls = drug.images.map(img => ImageUploader._authUrl ? ImageUploader._authUrl(img.url) : img.url);
                const urlsJson = JSON.stringify(urls).replace(/"/g, '&quot;');
                imagesHtml = drug.images.map((img, idx) => `
                    <img src="${ImageUploader._authUrl ? ImageUploader._authUrl(img.url) : img.url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="ImageViewer.show(${urlsJson},${idx})">
                `).join('');
            }

            // 库存显示：多人分库存时按人拆分（如 共2盒 · 唐 1盒 · Jack 1盒）
            const unit = drug.quantityUnit || '盒';
            const hasByElder = Array.isArray(drug.byElder) && drug.byElder.length > 1;
            let stockHtml;
            if (hasByElder) {
                const parts = drug.byElder.map(e => `${e.elderName} ${e.quantity}${unit}`).join(' · ');
                stockHtml = `共 ${drug.quantity || 0}${unit}（${parts}）`;
            } else {
                stockHtml = `${drug.quantity || 0}${unit}`;
            }

            el.innerHTML = `
            <div class="card">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <span style="font-size:1.4em;font-weight:700;color:#2b7a78;cursor:pointer;" onclick="App.viewDrugInfo('${(drug.name || '').replace(/'/g, "\\'")}','${(drug.specification || '').replace(/'/g, "\\'")}','${(drug.manufacturer || '').replace(/'/g, "\\'")}','${(drug.drugCode || '').replace(/'/g, "\\'")}')">${drug.name}</span>
                </div>
                ${specLine ? `<div class="text-muted" style="font-size:0.9em;margin-bottom:4px;">${specLine}</div>` : ''}
                ${drug.manufacturer ? `<div class="text-muted" style="font-size:0.9em;margin-bottom:4px;">厂商: ${drug.manufacturer}</div>` : ''}
                <div style="margin-top:8px;">
                    <span style="font-size:1.2em;font-weight:600;">剩余库存: ${stockHtml}</span>
                </div>
                ${drug.note ? `<div class="text-muted" style="font-size:0.9em;margin-top:4px;">备注: ${drug.note}</div>` : ''}
                ${imagesHtml ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">${imagesHtml}</div>` : ''}
            </div>
            <div class="card">
                <div class="card-title"><i class="fas fa-history"></i> 添加记录</div>
                ${records.length === 0 ? '<p class="text-muted" style="text-align:center;padding:10px;">暂无入库记录</p>' : `
                <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.9em;table-layout:fixed;">
                    <colgroup>
                        <col style="width:22%;"><col style="width:18%;"><col style="width:35%;"><col style="width:25%;">
                    </colgroup>
                    <thead>
                        <tr style="background:#f1f5f9;color:#475569;">
                            <th style="padding:10px 8px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;">服药人</th>
                            <th style="padding:10px 8px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;">数量</th>
                            <th style="padding:10px 8px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;">日期</th>
                            <th style="padding:10px 8px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;">处方</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(r => {
                            const isDepleted = r.depleted || r.remainingQuantity <= 0;
                            const rowStyle = isDepleted ? 'background:#f8fafc;color:#94a3b8;' : '';
                            return `<tr style="border-bottom:1px solid #f1f5f9;${rowStyle}">
                                <td style="padding:10px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.elderName || '-'}</td>
                                <td style="padding:10px 8px;white-space:nowrap;">${r.quantity != null ? `${r.quantity}${r.quantityUnit || '盒'}` : '-'}</td>
                                <td style="padding:10px 8px;white-space:nowrap;">${r.createdAt || '-'}</td>
                                <td style="padding:10px 8px;text-align:center;">${r.recordNo && r.recordId ? `<a title="查看处方：${r.recordNo}" style="color:#2b7a78;cursor:pointer;" onclick="App.viewRecord('${r.recordId}')"><i class="fas fa-file-prescription"></i></a>` : ''}</td>
                            </tr>
                            <tr id="invtr_${r.id}" style="border-bottom:1px solid #f1f5f9;${rowStyle}">
                                <td colspan="4" style="padding:6px 10px 10px 10px;max-width:0;">
                                    ${PageDrugDetail._renderSubRow(r, isDepleted)}
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>`}
            </div>`;
        } catch (err) {
            const el = document.getElementById('drugDetailContent');
            if (el) el.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">加载失败</p>';
        }
    },

    async updateItem(id, field, value) {
        try {
            const payload = {};
            if (field === 'expiryDate') {
                payload.expiryDate = value || null;
            } else if (field === 'remainingQuantity') {
                const n = parseInt(value);
                payload.remainingQuantity = isNaN(n) ? 0 : Math.max(0, n);
            }
            await Api.drugs.updateInventoryItem(id, payload);
            App.toast('已更新');
            this.afterRender();
        } catch (err) {
            App.toast('更新失败: ' + (err.message || ''));
        }
    },

    _renderSubRow(r, isDepleted) {
        const textColor = isDepleted ? '#94a3b8' : '#475569';
        const bgStyle = isDepleted ? 'background:#f1f5f9;' : '';
        const editing = this._editingRows && this._editingRows.has(r.id);
        if (editing) {
            return `<div style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:0.9em;width:100%;box-sizing:border-box;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="color:#64748b;white-space:nowrap;">余量</span>
                    <input id="qty_${r.id}" type="number" min="0" value="${r.remainingQuantity}" style="width:56px;padding:4px 6px;border:1px solid #2b7a78;border-radius:4px;text-align:center;${bgStyle}">
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="color:#64748b;white-space:nowrap;">有效期</span>
                    <input id="exp_${r.id}" type="date" value="${r.expiryDate || ''}" style="min-width:0;max-width:150px;padding:4px 6px;border:1px solid #2b7a78;border-radius:4px;${bgStyle}">
                </div>
                <div style="display:flex;gap:8px;margin-left:auto;">
                    <button onclick="PageDrugDetail.saveRow('${r.id}')" style="background:#2b7a78;color:#fff;border:none;padding:5px 14px;border-radius:16px;cursor:pointer;font-size:0.82em;white-space:nowrap;">保存</button>
                    <button onclick="PageDrugDetail.cancelEdit('${r.id}')" style="background:#e2e8f0;color:#475569;border:none;padding:5px 14px;border-radius:16px;cursor:pointer;font-size:0.82em;white-space:nowrap;">取消</button>
                </div>
            </div>`;
        }
        return `<div style="display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;font-size:0.9em;width:100%;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:#64748b;white-space:nowrap;">余量</span>
                <span style="color:${textColor};font-weight:500;">${r.remainingQuantity != null ? r.remainingQuantity : r.quantity}</span><span style="color:#64748b;">${r.quantityUnit || '盒'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:#64748b;white-space:nowrap;">有效期</span>
                <span style="color:${textColor};font-weight:500;">${r.expiryDate || '未设置'}</span>
            </div>
            <button onclick="PageDrugDetail.toggleEdit('${r.id}')" style="margin-left:auto;background:none;border:1px solid #cbd5e1;color:#475569;padding:4px 12px;border-radius:14px;cursor:pointer;font-size:0.82em;white-space:nowrap;"><i class="fas fa-pen"></i> 编辑</button>
        </div>`;
    },

    toggleEdit(id) {
        if (!this._editingRows) this._editingRows = new Set();
        this._editingRows.add(id);
        this._refreshSubRow(id);
    },

    cancelEdit(id) {
        if (this._editingRows) this._editingRows.delete(id);
        this._refreshSubRow(id);
    },

    async saveRow(id) {
        const qtyEl = document.getElementById(`qty_${id}`);
        const expEl = document.getElementById(`exp_${id}`);
        if (!qtyEl || !expEl) return;
        const qty = parseInt(qtyEl.value);
        const exp = expEl.value || null;
        if (isNaN(qty) || qty < 0) { App.toast('请输入有效的余量'); return; }
        try {
            await Api.drugs.updateInventoryItem(id, {
                remainingQuantity: qty,
                expiryDate: exp
            });
            if (this._editingRows) this._editingRows.delete(id);
            App.toast('已保存');
            this.afterRender();
        } catch (err) {
            App.toast('保存失败: ' + (err.message || ''));
        }
    },

    _refreshSubRow(id) {
        const row = document.getElementById(`invtr_${id}`);
        if (!row) return;
        // 从当前渲染中找到记录数据 - 通过重新渲染整个记录行
        // 简化方案：重新加载整个详情页
        this.afterRender();
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
                <div id="drugInfoHeaderMeta" class="text-muted" style="font-size:0.9em;">
                    ${drugSpec ? `<div>规格: ${drugSpec}</div>` : ''}
                    ${drugManufacturer ? `<div>厂商: ${drugManufacturer}</div>` : ''}
                </div>
                <div id="drugInfoExtra" class="text-muted" style="font-size:0.9em;"></div>
            </div>
            <div id="drugInfoBody"><p class="text-muted" style="text-align:center;padding:20px;">加载中...</p></div>
        </div>`;
    },

    async afterRender() {
        const drugCode = App.state.currentDrugCode || '';
        const drugName = App.state.currentDrugName || '';
        let d = null;

        if (drugCode) {
            try {
                const res = await Api.drugLibrary.get(drugCode);
                d = res.drug || {};
            } catch (err) {
                this._showEmpty(drugName);
                return;
            }
        } else {
            try {
                const res = await Api.drugLibrary.search(drugName, 1);
                const drugs = res.drugs || [];
                if (drugs.length > 0) {
                    d = drugs[0];
                } else {
                    this._showEmpty(drugName);
                    return;
                }
            } catch (err) {
                this._showEmpty(drugName);
                return;
            }
        }

        // 显示已有数据
        this._showInfo(d);

        // 如果没有说明书内容，尝试从 ShowAPI 获取
        const hasNoInfo = !d.description || d.description.trim() === '';
        if (hasNoInfo && (d.code || d.name)) {
            try {
                const params = {};
                if (d.code) params.code = d.code;
                else if (d.name) params.name = d.name;
                App.toast('正在获取药品说明书...');
                const fetchRes = await Api.drugLibrary.fetchInfo(params);
                if (fetchRes && fetchRes.drug) {
                    this._showInfo(fetchRes.drug);
                    if (fetchRes.fetched) {
                        App.toast('说明书已更新');
                    }
                }
            } catch (err) {
                console.warn('[fetchInfo] 获取失败:', err.message);
            }
        }
    },

    _showInfo(d) {
        // 更新头部 meta（规格/厂商），兼容首页/处方入口（无参数传入）
        const metaEl = document.getElementById('drugInfoHeaderMeta');
        if (metaEl) {
            const spec = d.specification || '';
            const manufacturer = d.manufacturer || '';
            metaEl.innerHTML = [
                spec ? `<div>规格: ${spec}</div>` : '',
                manufacturer ? `<div>厂商: ${manufacturer}</div>` : '',
            ].filter(Boolean).join('');
        }
        const extraEl = document.getElementById('drugInfoExtra');
        const bodyEl = document.getElementById('drugInfoBody');
        if (extraEl) {
            const parts = [];
            if (d.type1) parts.push(d.type1);
            if (d.jx) parts.push(d.jx);
            if (d.fl) parts.push(d.fl);
            if (d.wyy) parts.push('外用');
            if (d.genericName) parts.push('通用名: ' + d.genericName);
            if (d.category) parts.push('类别: ' + d.category);
            extraEl.innerHTML = parts.map(p => `<span class="badge" style="margin-right:4px;">${p}</span>`).join('');
        }
        if (!bodyEl) return;
        const sections = [];
        if (d.syz) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 适应症</div><p style="white-space:pre-wrap;">${d.syz}</p></div>`);
        if (d.indication) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-stethoscope"></i> 适应症</div><p style="white-space:pre-wrap;">${d.indication}</p></div>`);
        if (d.contraindication) sections.push(`<div class="card"><div class="card-title" style="color:#dc2626;"><i class="fas fa-ban"></i> 禁忌</div><p style="white-space:pre-wrap;color:#dc2626;">${d.contraindication}</p></div>`);
        if (d.dosageInstruction) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-prescription-bottle-alt"></i> 用法用量</div><p style="white-space:pre-wrap;">${d.dosageInstruction}</p></div>`);
        if (d.adverseReaction) sections.push(`<div class="card"><div class="card-title" style="color:#d97706;"><i class="fas fa-exclamation-triangle"></i> 不良反应</div><p style="white-space:pre-wrap;">${d.adverseReaction}</p></div>`);
        if (d.drugInteraction) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-exchange-alt"></i> 药物相互作用</div><p style="white-space:pre-wrap;">${d.drugInteraction}</p></div>`);
        if (d.precaution) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-info-circle"></i> 注意事项</div><p style="white-space:pre-wrap;">${d.precaution}</p></div>`);
        if (d.storage) sections.push(`<div class="card"><div class="card-title"><i class="fas fa-temperature-low"></i> 贮藏</div><p style="white-space:pre-wrap;">${d.storage}</p></div>`);
        // 显示从 ShowAPI 获取的完整说明文本
        if (d.description) {
            const descLines = d.description.split('\n').filter(line => line.trim());
            if (descLines.length > 0) {
                sections.push(`<div class="card"><div class="card-title" style="color:#2b7a78;"><i class="fas fa-file-alt"></i> 药品说明书</div><div style="white-space:pre-wrap;font-size:0.92em;line-height:1.9;">${descLines.join('\n')}</div></div>`);
            }
        }
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

            const user = App.state.user;
            const isSelf = e.relation === 'self' && e.user_id === user?.id;
            const displayPhone = e.phone || e.user_phone || (isSelf ? (user?.phone || '') : '');
            const relationLabel = isSelf ? '本人' : (e.relation === 'self' ? '成员' : (relationMap[e.relation] || '其他'));
            const displayBirth = e.birth_date ? formatDate(e.birth_date) : '';
            const hasAnyInfo = e.blood_type || displayPhone || e.allergies || e.conditions || displayBirth;

            el.innerHTML = `
            <div class="card">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
                    <div style="width:64px;height:64px;border-radius:50%;background:#d1e0e8;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;">${e.avatar || e.name.charAt(0)}</div>
                    <div>
                        <div style="font-weight:700;font-size:20px;">${e.name}</div>
                        <div class="text-muted">${e.gender || '未知'} · ${calcAge(e.birth_date) != null ? calcAge(e.birth_date) : (e.age || '-')}岁 · ${relationLabel}</div>
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-title"><i class="fas fa-info-circle"></i> 基本信息</div>
                ${hasAnyInfo ? `
                ${displayBirth ? `<div class="metric-row"><span class="metric-name">出生日期</span><span class="metric-value">${displayBirth}</span></div>` : ''}
                ${e.blood_type ? `<div class="metric-row"><span class="metric-name">血型</span><span class="metric-value">${e.blood_type}</span></div>` : ''}
                ${displayPhone ? `<div class="metric-row"><span class="metric-name">电话</span><span class="metric-value">${displayPhone}</span></div>` : ''}
                ${e.allergies ? `<div class="metric-row"><span class="metric-name">过敏史</span><span class="metric-value">${e.allergies}</span></div>` : ''}
                ${e.conditions ? `<div class="metric-row"><span class="metric-name">基础疾病</span><span class="metric-value">${e.conditions}</span></div>` : ''}
                ` : '<div style="color:#94a3b8;font-size:13px;padding:4px 0;">暂无基本信息</div>'}
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

            // 顶部添加按钮 + 新增表单（默认折叠）
            const addBtnHtml = `<div style="margin-bottom:12px;">
                <button class="btn-primary" style="width:100%;" onclick="PageMedEdit.toggleAddForm()">
                    <i class="fas fa-plus"></i> 添加用药计划
                </button>
                <div id="medAddForm" style="display:none;margin-top:12px;padding:12px;background:#f8fafd;border-radius:12px;"></div>
            </div>`;

            if (meds.length === 0) {
                el.innerHTML = addBtnHtml + '<p class="text-muted" style="text-align:center;padding:20px;">暂无活跃用药计划</p>';
                return;
            }

            const timeLabelMap = { '08:00': ['morning', '早'], '12:00': ['noon', '中'], '18:00': ['evening', '晚'], '21:00': ['night', '睡'] };
            const formatTimes = (tArr) => (tArr || []).map(t => {
                const [cls, txt] = timeLabelMap[t] || ['', t];
                return cls ? `<span class="time-tag ${cls}">${txt}</span>` : txt;
            }).join(' ');

            const cardsHtml = meds.map(m => {
                const timesHtml = formatTimes(m.times);
                const doseText = [m.doseAmount != null ? cleanNumber(m.doseAmount) + (m.doseUnit || '') : (m.dose || ''), m.frequency ? m.frequency + '次/日' : ''].filter(Boolean).join(' ');
                // 添加后48小时内可删除，超过48小时只能结束
                const createdTs = m.createdAt ? new Date(m.createdAt).getTime() : (m.startDate ? new Date(m.startDate).getTime() : Date.now());
                const hoursElapsed = (Date.now() - createdTs) / 3600000;
                const canDelete = hoursElapsed < 48;
                const actionBtn = canDelete
                    ? `<button class="med-edit-btn btn-delete" onclick="PageMedEdit.deleteMed('${m.id}','${m.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i> 删除</button>`
                    : `<button class="med-edit-btn btn-end" onclick="PageMedEdit.endMed('${m.id}','${m.name.replace(/'/g, "\\'")}')"><i class="fas fa-stop-circle"></i> 结束</button>`;
                return `<div class="med-edit-card">
                <div class="med-edit-header">
                    <div class="med-edit-name">${m.name}</div>
                    <div class="med-edit-dose">${doseText}</div>
                </div>
                <div class="med-edit-footer">
                    <div class="med-edit-time">${timesHtml || '<span class="text-muted">未设置</span>'}</div>
                    <div class="med-edit-actions">
                        <button class="med-edit-btn btn-edit" onclick="PageMedEdit.showEditForm('${m.id}')"><i class="fas fa-edit"></i> 修改</button>
                        ${actionBtn}
                    </div>
                </div>
                <div id="editForm-${m.id}" style="display:none;margin-top:10px;"></div>
            </div>`;
            }).join('');

            el.innerHTML = addBtnHtml + cardsHtml;
        } catch (err) {
            console.error('用药编辑加载失败:', err);
            el.innerHTML = `<p style="color:#dc2626;">加载失败: ${err.message || err}</p>`;
        }
    },

    toggleAddForm() {
        const container = document.getElementById('medAddForm');
        if (!container) return;
        if (container.style.display !== 'none') {
            container.style.display = 'none';
            container.innerHTML = '';
            delete MedTimesUI._state['medAdd'];
            return;
        }
        const p = 'medAdd';
        const memberId = App.state.currentMemberId;
        const memberName = (App.state.members || []).find(m => m.id === memberId)?.name || '当前成员';
        container.style.display = 'block';
        const escAttr = (v) => String(v || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        MedTimesUI._state[p] = new Set(['morning']);
        container.innerHTML = `
            <div style="font-weight:600;margin-bottom:10px;">为 ${escAttr(memberName)} 添加用药计划</div>
            <div class="form-group"><label class="form-label">药品名称 *</label><input class="form-input" id="${p}Name" placeholder="输入名称或拼音首字母" autocomplete="off" onclick="DrugSuggest.showSuggestions(this)" oninput="DrugSuggest.onInput(this,'${p}Code')"><input type="hidden" id="${p}Code"></div>
            <div class="form-group"><label class="form-label">每次剂量</label><div style="display:flex;gap:8px;"><input class="form-input" id="${p}DoseAmount" type="number" step="1" min="0" placeholder="如 5" style="flex:2"><select id="${p}DoseUnit" style="flex:1"><option value="mg">mg</option><option value="g">g</option><option value="ml">ml</option><option value="μg">μg</option><option value="片">片</option><option value="粒">粒</option><option value="袋">袋</option><option value="支">支</option><option value="贴">贴</option></select></div></div>
            <div class="form-group"><label class="form-label">每日次数</label><input class="form-input" id="${p}Freq" type="number" step="1" min="1" max="4" value="1" oninput="MedTimesUI.render('${p}')"></div>
            <div class="form-group"><label class="form-label">服药时间</label><div id="${p}TimeSlots"></div></div>
            <div class="form-group"><label class="form-label">开始日期</label><input class="form-input" id="${p}Start" type="text" readonly onclick="CalendarPicker.attach(this,{max:'today'})" placeholder="点击选择日期" style="background:#fff;"></div>
            <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="${p}Note" placeholder="如：餐后服用"></div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn-primary" style="flex:1;" onclick="PageMedEdit.saveAdd()">保存</button>
                <button class="btn-outline" style="flex:1;" onclick="PageMedEdit.toggleAddForm()">取消</button>
            </div>
        `;
        MedTimesUI.render(p);
        document.getElementById(p + 'Start').value = new Date().toISOString().slice(0, 10);
    },

    async saveAdd() {
        const p = 'medAdd';
        const memberId = App.state.currentMemberId;
        const name = document.getElementById(p + 'Name')?.value?.trim();
        if (!name) { App.toast('请输入药品名称'); return; }
        if (!memberId) { App.toast('请先选择成员'); return; }
        if (false === await DrugSuggest.ensure(document.getElementById(p + 'Name'))) return;
        const drugCode = document.getElementById(p + 'Code')?.value || undefined;
        const doseAmountVal = document.getElementById(p + 'DoseAmount')?.value;
        const doseUnit = document.getElementById(p + 'DoseUnit')?.value;
        const frequency = parseInt(document.getElementById(p + 'Freq')?.value) || 1;
        const times = MedTimesUI.getTimes(p);
        const startDate = document.getElementById(p + 'Start')?.value || new Date().toISOString().slice(0, 10);
        const note = document.getElementById(p + 'Note')?.value;

        try {
            await Api.medications.add({
                elderId: memberId,
                name,
                drugCode,
                dose: doseAmountVal ? `${doseAmountVal}${doseUnit || ''}` : undefined,
                doseAmount: doseAmountVal ? parseFloat(doseAmountVal) : undefined,
                doseUnit: doseAmountVal ? doseUnit : undefined,
                frequency,
                times,
                startDate,
                note,
                status: 'active',
            });
            App.toast('添加成功');
            PageMedEdit.toggleAddForm();
            PageMedEdit.loadContent();
        } catch (err) {
            App.toast('保存失败: ' + err.message);
        }
    },

    showEditForm(medId) {
        const container = document.getElementById('editForm-' + medId);
        if (!container) return;
        if (container.style.display !== 'none') { container.style.display = 'none'; return; }

        // 先获取当前用药详情
        Api.medications.get(medId).then(res => {
            const m = res.medication;
            const escAttr = (v) => String(v || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const p = 'ef' + medId; // 唯一前缀，避免 ID 冲突
            const freq = m.frequency || (m.times && m.times.length) || 1;

            // 初始化 MedTimesUI 选中状态
            const timeKeyMap = { '08:00': 'morning', '12:00': 'noon', '18:00': 'evening', '21:00': 'night' };
            const selectedKeys = (m.times || []).map(t => timeKeyMap[t] || '').filter(Boolean);
            MedTimesUI._state[p] = new Set(selectedKeys.length > 0 ? selectedKeys : MedTimesUI.slots.slice(0, freq).map(s => s.key));

            container.style.display = 'block';
            container.innerHTML = `
            <div style="border-top:1px solid #eee;padding-top:10px;">
                <div style="font-weight:600;margin-bottom:8px;">修改用药</div>
                <div class="form-group"><label class="form-label">药品名称</label><input class="form-input" id="${p}Name" value="${escAttr(m.name || '')}" disabled style="background:#f5f5f5;color:#999;cursor:not-allowed;"><input type="hidden" id="${p}Code" value="${escAttr(m.drug_code || m.drugCode || '')}"></div>
                <div class="form-group"><label class="form-label">每次剂量</label><input class="form-input" id="${p}Dose" type="number" step="1" min="0" value="${m.doseAmount != null ? m.doseAmount : (m.dose || '')}"></div>
                <div class="form-group"><label class="form-label">每日次数</label><input class="form-input" id="${p}Freq" type="number" step="1" min="1" max="4" value="${freq}" oninput="MedTimesUI.render('${p}')"></div>
                <div class="form-group"><label class="form-label">服药时间</label><div id="${p}TimeSlots"></div></div>
                <div class="form-group"><label class="form-label">备注</label><input class="form-input" id="${p}Note" value="${escAttr(m.note || '')}"></div>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button class="btn-primary" style="flex:1;" onclick="PageMedEdit.saveEdit('${medId}','${p}')">保存</button>
                    <button class="btn-outline" style="flex:1;" onclick="document.getElementById('editForm-${medId}').style.display='none'">取消</button>
                </div>
            </div>`;
            // 渲染时间段选择
            MedTimesUI.render(p);
            // 恢复各时间段的实际时间值
            if (m.times && m.times.length > 0) {
                const slotOrder = ['morning', 'noon', 'evening', 'night'];
                m.times.forEach((t, i) => {
                    const key = timeKeyMap[t] || slotOrder[i];
                    if (key) {
                        const timeInput = document.getElementById(`${p}Time_${key}`);
                        if (timeInput) timeInput.value = t;
                    }
                });
            }
        }).catch(err => { container.innerHTML = `<p class="text-muted">获取详情失败</p>`; });
    },

    async saveEdit(medId, p) {
        const name = document.getElementById(p + 'Name')?.value;
        const doseAmount = document.getElementById(p + 'Dose')?.value;
        const frequency = document.getElementById(p + 'Freq')?.value;
        const times = MedTimesUI.getTimes(p);
        const note = document.getElementById(p + 'Note')?.value;
        const drugCode = document.getElementById(p + 'Code')?.value;

        if (!name || !name.trim()) { App.toast('请输入药品名称'); return; }

        try {
            // 保存历史：先获取旧用药，记录到历史
            const oldRes = await Api.medications.get(medId);
            const oldMed = oldRes.medication;

            await Api.medications.update(medId, { name: name.trim(), doseAmount: doseAmount ? Number(doseAmount) : undefined, frequency: frequency ? Number(frequency) : undefined, times, note, drugCode });

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
        if (!await App.confirm(`确定结束「${medName}」的用药？\n当前用药安排将被归档到历史记录。`)) return;
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
        if (!await App.confirm(`确定删除「${medName}」？\n删除后不可恢复！`)) return;
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
                    const ended = m.status === 'ended';
                    const noteDisplay = m.note && m.note.startsWith('[历史]') ? m.note.replace('[历史] ', '') : m.note;
                    const timeLabelMap = { '08:00': ['morning', '早'], '12:00': ['noon', '中'], '18:00': ['evening', '晚'], '21:00': ['night', '睡'] };
                    const timesHtml = (m.times || []).map(t => {
                        const [cls, txt] = timeLabelMap[t] || ['', t];
                        return cls ? `<span class="time-tag ${cls}">${txt}</span>` : txt;
                    }).join(' ');
                    const doseText = [m.doseAmount != null ? cleanNumber(m.doseAmount) + (m.doseUnit || '') : (m.dose || ''), m.frequency ? m.frequency + '次/日' : ''].filter(Boolean).join(' ');
                    html += `<div class="med-edit-card"${ended ? ' style="background:#f8fafc;"' : ''}>
                        <div class="med-edit-header">
                            <div class="med-edit-name"${ended ? ' style="color:#64748b;"' : ''}>${m.name}${ended ? ' <span class="badge" style="background:#e2e8f0;color:#64748b;">已结束</span>' : ''}</div>
                            <div class="med-edit-dose">${doseText}</div>
                        </div>
                        <div class="med-edit-footer">
                            <div class="med-edit-time">${timesHtml || '<span class="text-muted">未设置</span>'}${noteDisplay ? ' · ' + noteDisplay : ''}</div>
                            <div class="med-edit-date">${m.startDate ? m.startDate : ''}${m.endDate ? ' → ' + m.endDate : ' 开始'}</div>
                        </div>
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
