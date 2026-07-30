// ========== 图片上传组件 ==========
// 用法：<div id="xxx"></div> 然后 ImageUploader.init('xxx', existingImages)
// 获取已上传的 fileIds：ImageUploader.getFileIds('xxx')
const ImageUploader = {
    _store: {}, // containerId -> { fileIds: [], previews: [] }

    // 给 url 加上 token 参数（供 img 标签鉴权）
    _authUrl(url) {
        const token = localStorage.getItem('fh_token');
        if (!token) return url;
        const sep = url.includes('?') ? '&' : '?';
        return url + sep + 'token=' + encodeURIComponent(token);
    },

    init(containerId, existingImages) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const existing = (existingImages || []).map(img => ({
            fileId: img.fileId || img.id,
            url: img.url,
            originalName: img.originalName || ''
        }));
        this._store[containerId] = { fileIds: existing.map(e => e.fileId), previews: existing };
        this._render(containerId);
    },

    _render(containerId) {
        const container = document.getElementById(containerId);
        const store = this._store[containerId] || { fileIds: [], previews: [] };
        const urls = store.previews.map(x => this._authUrl(x.url));
        const urlsJson = JSON.stringify(urls).replace(/"/g, '&quot;');
        const previewHtml = store.previews.map((p, idx) => `
            <div class="img-upload-item" style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;flex-shrink:0;">
                <img src="${this._authUrl(p.url)}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="ImageViewer.show(${urlsJson},${idx});event.stopPropagation();">
                <button type="button" onclick="event.stopPropagation();ImageUploader.remove('${containerId}',${idx})" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;border:none;font-size:14px;line-height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
            </div>`).join('');
        const addBtn = store.previews.length >= 9 ? '' : `
            <label class="img-upload-add" style="width:72px;height:72px;border:2px dashed #cbd5e1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#94a3b8;font-size:12px;">
                <i class="fas fa-camera" style="font-size:20px;margin-bottom:2px;"></i>添加
                <input type="file" accept="image/*" multiple style="display:none;" onchange="ImageUploader._onSelect('${containerId}',this)">
            </label>`;
        container.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">${previewHtml}${addBtn}</div>`;
    },

    async _onSelect(containerId, inputEl) {
        const files = Array.from(inputEl.files);
        if (!files.length) return;
        inputEl.value = '';
        const store = this._store[containerId];
        if (!store) return;

        // 逐张上传，每上传完一张就追加预览，避免全量重渲染
        for (const file of files) {
            try {
                const res = await Api.upload([file]);
                for (const f of res.files) {
                    store.fileIds.push(f.id);
                    store.previews.push({ fileId: f.id, url: f.url, originalName: f.originalName });
                }
            } catch (err) {
                App.toast('图片上传失败: ' + err.message);
            }
        }
        this._render(containerId);
    },

    remove(containerId, idx) {
        const store = this._store[containerId];
        if (!store) return;
        store.fileIds.splice(idx, 1);
        store.previews.splice(idx, 1);
        this._render(containerId);
    },

    getFileIds(containerId) {
        const store = this._store[containerId];
        return store ? store.fileIds : [];
    }
};

// ========== 图片查看器（点击放大，左右翻看） ==========
const ImageViewer = {
    _urls: [],
    _idx: 0,

    show(urls, idx = 0) {
        this._urls = urls;
        this._idx = idx;
        this._render();
    },

    _render() {
        let overlay = document.getElementById('imageViewerOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'imageViewerOverlay';
            document.body.appendChild(overlay);
        }
        const hasPrev = this._idx > 0;
        const hasNext = this._idx < this._urls.length - 1;
        overlay.innerHTML = `
            <div style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;" onclick="ImageViewer._onBgClick(event)">
                <button type="button" onclick="event.stopPropagation();ImageViewer.prev()" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;border:none;font-size:22px;cursor:pointer;${hasPrev?'':'opacity:0.3;pointer-events:none;'}"><i class="fas fa-chevron-left"></i></button>
                <img src="${this._urls[this._idx]}" style="max-width:92vw;max-height:88vh;object-fit:contain;border-radius:6px;" onclick="event.stopPropagation()">
                <button type="button" onclick="event.stopPropagation();ImageViewer.next()" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;border:none;font-size:22px;cursor:pointer;${hasNext?'':'opacity:0.3;pointer-events:none;'}"><i class="fas fa-chevron-right"></i></button>
                <button type="button" onclick="event.stopPropagation();ImageViewer.close()" style="position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;border:none;font-size:20px;cursor:pointer;"><i class="fas fa-times"></i></button>
                <div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:14px;">${this._idx + 1} / ${this._urls.length}</div>
            </div>`;
    },

    prev() { if (this._idx > 0) { this._idx--; this._render(); } },
    next() { if (this._idx < this._urls.length - 1) { this._idx++; this._render(); } },
    close() { const el = document.getElementById('imageViewerOverlay'); if (el) el.innerHTML = ''; },
    _onBgClick(e) { if (e.target === e.currentTarget) this.close(); }
};

// 键盘事件支持
document.addEventListener('keydown', e => {
    if (!document.getElementById('imageViewerOverlay')?.innerHTML) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); ImageViewer.prev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); ImageViewer.next(); }
    else if (e.key === 'Escape') { ImageViewer.close(); }
});

// ========== 服药时间段选择组件 ==========
// 根据频次渲染早中晚时间段勾选框
const MedTimesUI = {
  slots: [
    { key: 'morning', label: '早上', time: '08:00', icon: '🌅' },
    { key: 'noon',    label: '中午', time: '12:00', icon: '☀️' },
    { key: 'evening', label: '晚上', time: '18:00', icon: '🌇' },
    { key: 'night',   label: '睡前', time: '21:00', icon: '🌙' },
  ],
  _state: {},  // prefix -> Set of selected keys

  render(prefix) {
    const freqInput = document.getElementById(prefix + 'Freq');
    const container = document.getElementById(prefix + 'TimeSlots');
    if (!freqInput || !container) return;

    const freq = Math.min(Math.max(parseInt(freqInput.value) || 1, 1), 4);
    if (!this._state[prefix]) {
      // 默认选中前 freq 个
      this._state[prefix] = new Set(this.slots.slice(0, freq).map(s => s.key));
    }

    // 如果频次变小，移除多余的选中项
    const selected = this._state[prefix];
    const availableKeys = this.slots.slice(0, 4).map(s => s.key);
    for (const k of selected) {
      if (!availableKeys.includes(k)) selected.delete(k);
    }
    // 如果选中数超过频次，只保留前 freq 个
    if (selected.size > freq) {
      const keep = [...selected].slice(0, freq);
      selected.clear();
      keep.forEach(k => selected.add(k));
    }

    const html = this.slots.map(slot => {
      const checked = selected.has(slot.key) ? 'checked' : '';
      const disabled = '';
      return `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0;padding:6px 12px;border-radius:8px;background:${checked ? '#e8f5e9' : '#f5f5f5'};cursor:pointer;font-size:14px;transition:background 0.2s;border:2px solid ${checked ? '#4caf50' : '#ddd'};">
        <input type="checkbox" ${checked} onchange="MedTimesUI._toggle('${prefix}','${slot.key}',this)" style="width:18px;height:18px;accent-color:#4caf50;cursor:pointer;">
        <span>${slot.icon}</span>
        <span>${slot.label}</span>
        <input type="time" value="${slot.time}" id="${prefix}Time_${slot.key}" style="width:80px;padding:2px 4px;border:1px solid #ddd;border-radius:4px;font-size:12px" onclick="event.stopPropagation()">
      </label>`;
    }).join('');

    container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;">${html}</div>
      <div style="font-size:12px;color:#999;margin-top:4px;">勾选 ${freq} 个时间段</div>`;
  },

  _toggle(prefix, key, checkbox) {
    const freq = Math.min(Math.max(parseInt(document.getElementById(prefix + 'Freq').value) || 1, 1), 4);
    const selected = this._state[prefix] || new Set();
    if (checkbox.checked) {
      if (selected.size >= freq) {
        checkbox.checked = false;
        App.toast(`最多选择 ${freq} 个时间段`);
        return;
      }
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this._state[prefix] = selected;
    this.render(prefix); // 重新渲染以更新样式
  },

  // 获取选中的时间段列表
  getTimes(prefix) {
    const selected = this._state[prefix] || new Set();
    const times = [];
    for (const slot of this.slots) {
      if (selected.has(slot.key)) {
        const timeInput = document.getElementById(`${prefix}Time_${slot.key}`);
        times.push(timeInput ? timeInput.value : slot.time);
      }
    }
    return times.length > 0 ? times : ['08:00'];
  }
};

// ========== 药品库下拉建议组件 ==========
// 用法：在药品名称输入框上 oninput="DrugSuggest.onInput(this, '隐藏code字段id')"
// 选中后自动填充名称到当前输入框、code 到隐藏字段；未选中直接提交则后端按名匹配/入库
const DrugSuggest = {
    _timer: null,
    _currentInput: null,
    _autoFillMap: null,
    _lockedIds: [], // 被置灰的字段 ID 列表

    onInput(inputEl, hiddenCodeId, autoFillMap) {
        this._currentInput = inputEl;
        this._autoFillMap = autoFillMap || null;
        // 用户改了名称视为未选中，解锁字段
        if (hiddenCodeId) {
            const h = document.getElementById(hiddenCodeId);
            if (h) h.value = '';
        }
        this._unlockFields();
        if (this._autoFillMap) {
            Object.values(this._autoFillMap).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }
        clearTimeout(this._timer);
        const q = inputEl.value.trim();
        this._hide();
        if (!q) return;
        this._timer = setTimeout(() => this._search(inputEl, q, hiddenCodeId), 220);
    },

    async _search(inputEl, q, hiddenCodeId) {
        try {
            const res = await Api.drugLibrary.search(q);
            this._render(inputEl, res.drugs || [], hiddenCodeId);
        } catch (e) { /* 静默失败 */ }
    },

    _render(inputEl, drugs, hiddenCodeId) {
        let box = inputEl.parentNode.querySelector('.drug-suggest');
        if (!box) {
            box = document.createElement('div');
            box.className = 'drug-suggest';
            inputEl.parentNode.style.position = 'relative';
            inputEl.parentNode.appendChild(box);
        }
        if (drugs.length === 0) {
            box.innerHTML = '<div class="drug-suggest-item drug-suggest-empty">未找到，保存时将自动新增入库</div>';
        } else {
            this._lastDrugs = drugs;
            box.innerHTML = drugs.map((d, i) => {
                const spec = d.specification ? this._esc(d.specification) : '';
                const manu = d.manufacturer ? this._esc(d.manufacturer) : '';
                const name = this._esc(d.name);
                const sub = [spec, manu].filter(x => x).join(' · ');
                return `<div class="drug-suggest-item" onclick="DrugSuggest._pick(${i})">
                    <div class="ds-name">${name}${d.pinyinAbbr ? `<span class="ds-py">${this._esc(d.pinyinAbbr)}</span>` : ''}</div>
                    ${sub ? `<div class="ds-sub">${sub}</div>` : ''}
                </div>`;
            }).join('');
        }
        box.style.display = 'block';
    },

    _pick(index) {
        const drug = (this._lastDrugs || [])[index];
        if (!drug) return;
        const inputEl = this._currentInput;
        if (inputEl) inputEl.value = drug.name;
        const hiddenEl = inputEl ? inputEl.parentNode.querySelector('input[type=hidden]') : null;
        if (hiddenEl) hiddenEl.value = drug.code;
        // 自动填充关联字段并置灰
        this._unlockFields();
        const lockIds = [];
        if (this._autoFillMap) {
            const fieldMap = {
                specDosage: drug.specDosage,
                specDosageUnit: drug.specDosageUnit,
                unitCapacity: drug.unitCapacity,
                unitCapacityUnit: drug.unitCapacityUnit,
                manufacturer: drug.manufacturer,
                specification: drug.specification
            };
            Object.entries(this._autoFillMap).forEach(([drugKey, elId]) => {
                const el = document.getElementById(elId);
                const val = fieldMap[drugKey];
                if (el && val != null && val !== '') {
                    el.value = val;
                    el.disabled = true;
                    lockIds.push(elId);
                }
            });
        }
        this._lockedIds = lockIds;
        this._hide();
    },

    _unlockFields() {
        this._lockedIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        this._lockedIds = [];
    },

    _hide() {
        document.querySelectorAll('.drug-suggest').forEach(b => b.style.display = 'none');
    },

    _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};

// 点击页面空白处关闭下拉
document.addEventListener('click', (e) => {
    if (!e.target.closest('.drug-suggest') && !e.target.matches('input')) DrugSuggest._hide();
    if (!e.target.closest('.hosp-suggest') && !e.target.matches('input')) HospitalSuggest._hide();
    if (!e.target.closest('.dept-suggest') && !e.target.matches('input')) DeptSuggest._hide();
});

// ========== 医院库下拉建议组件 ==========
// 用法：在医院名称输入框上 oninput="HospitalSuggest.onInput(this)"
// 选中后自动填充名称到当前输入框
const HospitalSuggest = {
    _timer: null,
    _currentInput: null,
    _lastHospitals: [],

    onInput(inputEl) {
        this._currentInput = inputEl;
        clearTimeout(this._timer);
        const q = inputEl.value.trim();
        this._hide();
        if (!q) return;
        this._timer = setTimeout(() => this._search(inputEl, q), 220);
    },

    async _search(inputEl, q) {
        try {
            const res = await Api.hospitals.search(q);
            this._render(inputEl, res.hospitals || []);
        } catch (e) { /* 静默失败 */ }
    },

    _render(inputEl, hospitals) {
        let box = inputEl.parentNode.querySelector('.hosp-suggest');
        if (!box) {
            box = document.createElement('div');
            box.className = 'hosp-suggest';
            inputEl.parentNode.style.position = 'relative';
            inputEl.parentNode.appendChild(box);
        }
        if (hospitals.length === 0) {
            box.innerHTML = '<div class="hosp-suggest-item hosp-suggest-empty">未找到匹配医院</div>';
        } else {
            this._lastHospitals = hospitals;
            box.innerHTML = hospitals.map((h, i) => {
                const name = this._esc(h.name);
                return `<div class="hosp-suggest-item" onclick="HospitalSuggest._pick(${i})">${name}</div>`;
            }).join('');
        }
        box.style.display = 'block';
    },

    _pick(index) {
        const hosp = (this._lastHospitals || [])[index];
        if (!hosp || !this._currentInput) return;
        this._currentInput.value = hosp.name;
        this._hide();
    },

    _hide() {
        document.querySelectorAll('.hosp-suggest').forEach(b => b.style.display = 'none');
    },

    _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};

// ========== 科室下拉建议组件 ==========
// 用法：在科室输入框上 oninput="DeptSuggest.onInput(this)"
const DeptSuggest = {
    _timer: null,
    _currentInput: null,
    _lastDepts: [],

    onInput(inputEl) {
        this._currentInput = inputEl;
        clearTimeout(this._timer);
        const q = inputEl.value.trim();
        this._hide();
        if (!q) return;
        this._timer = setTimeout(() => this._search(inputEl, q), 180);
    },

    async _search(inputEl, q) {
        try {
            const res = await Api.departments.search(q);
            this._render(inputEl, res.departments || []);
        } catch (e) { /* 静默 */ }
    },

    _render(inputEl, depts) {
        let box = inputEl.parentNode.querySelector('.dept-suggest');
        if (!box) {
            box = document.createElement('div');
            box.className = 'dept-suggest';
            inputEl.parentNode.style.position = 'relative';
            inputEl.parentNode.appendChild(box);
        }
        if (depts.length === 0) {
            box.innerHTML = '<div class="dept-suggest-item dept-suggest-empty">未找到匹配科室</div>';
        } else {
            this._lastDepts = depts;
            box.innerHTML = depts.map((d, i) =>
                `<div class="dept-suggest-item" onclick="DeptSuggest._pick(${i})">${this._esc(d.name)}</div>`
            ).join('');
        }
        box.style.display = 'block';
    },

    _pick(index) {
        const dept = (this._lastDepts || [])[index];
        if (!dept || !this._currentInput) return;
        this._currentInput.value = dept.name;
        this._hide();
    },

    _hide() {
        document.querySelectorAll('.dept-suggest').forEach(b => b.style.display = 'none');
    },

    _esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};

// ========== 应用主体 ==========
const App = {
    state: {
        currentPage: 'login',
        currentMemberId: null,
        members: [],
        user: null,
        family: null,
        pageHistory: [],
    },

    init() {
        const savedUser = localStorage.getItem(USER_KEY);
        const token = localStorage.getItem(TOKEN_KEY);
        if (savedUser && token) {
            try { this.state.user = JSON.parse(savedUser); } catch {}
        }
        this.updateTime();
        setInterval(() => this.updateTime(), 60000);
        if (this.state.user) {
            this.loadData().then(() => this.switchPage('home')).catch(() => this.switchPage('login'));
        } else {
            this.switchPage('login');
        }
    },

    updateTime() {
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const el = document.getElementById('statusTime');
        if (el) el.textContent = `${h}:${m}`;
    },

    async loadData() {
        try {
            const eldersRes = await Api.elders.getAll();
            this.state.members = eldersRes.elders || [];
            if (!this.state.currentMemberId) {
                const self = this.state.members.find(m => m.relation === 'self');
                this.state.currentMemberId = self ? self.id : (this.state.members[0]?.id || null);
            }
            try {
                const profileRes = await Api.auth.profile();
                this.state.family = profileRes.family;
            } catch {}
            this.updateHeader();
        } catch (err) {
            console.error('加载数据失败:', err);
        }
    },

    getCurrentMember() {
        return this.state.members.find(m => m.id === this.state.currentMemberId) || null;
    },

    updateHeader() {
        const familyNameEl = document.getElementById('currentFamilyName');
        const memberNameEl = document.getElementById('headerUsername');
        familyNameEl.textContent = this.state.family ? this.state.family.name : '我的家庭';
        const current = this.getCurrentMember();
        if (memberNameEl) {
            memberNameEl.textContent = current ? current.name : '';
        }
    },

    switchPage(page) {
        if (!this.state.user && page !== 'login') { this.switchPage('login'); return; }
        if (page !== 'login' && page !== this.state.currentPage) {
            this.state.pageHistory.push(this.state.currentPage);
        }
        this.state.currentPage = page;

        document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        const bottomNav = document.getElementById('bottomNav');
        const appHeader = document.querySelector('.app-header');
        bottomNav.style.display = page === 'login' ? 'none' : 'flex';
        appHeader.style.display = page === 'login' ? 'none' : 'flex';

        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="page active" id="page-${page}">${this.renderPage(page)}</div>`;
        main.scrollTop = 0;
        // 调用页面的 afterRender 异步钩子
        const pageObj = this._getPageObj(page);
        if (pageObj && typeof pageObj.afterRender === 'function') {
            pageObj.afterRender();
        }
    },

    _getPageObj(page) {
        const map = { drugInfo: PageDrugInfo, drugDetail: PageDrugDetail, home: PageHome, records: PageRecords, pharmacy: PagePharmacy, profile: PageProfile, messages: PageMessages, family: PageFamily, joinFamily: PageJoinFamily, addMed: PageAddMed, addRecord: PageAddRecord, addDrug: PageAddDrug, recordDetail: PageRecordDetail, elderDetail: PageElderDetail, profileEdit: PageProfileEdit, medEdit: PageMedEdit, medHistory: PageMedHistory, login: PageLogin };
        return map[page];
    },

    renderPage(page) {
        const pages = {
            login: () => PageLogin.render(),
            home: () => PageHome.render(),
            records: () => PageRecords.render(),
            pharmacy: () => PagePharmacy.render(),
            profile: () => PageProfile.render(),
            messages: () => PageMessages.render(),
            family: () => PageFamily.render(),
            joinFamily: () => PageJoinFamily.render(),
            addMed: () => PageAddMed.render(),
            addRecord: () => PageAddRecord.render(),
            addDrug: () => PageAddDrug.render(),
            recordDetail: () => PageRecordDetail.render(),
            elderDetail: () => PageElderDetail.render(),
            drugInfo: () => PageDrugInfo.render(),
            drugDetail: () => PageDrugDetail.render(),
            profileEdit: () => PageProfileEdit.render(),
            medEdit: () => PageMedEdit.render(),
            medHistory: () => PageMedHistory.render(),
        };
        return (pages[page] || pages.home)();
    },

    goBack() {
        if (this.state.pageHistory.length > 0) {
            const prev = this.state.pageHistory.pop();
            this.state.currentPage = prev;
            this.switchPage(prev);
        } else {
            this.switchPage('home');
        }
    },

    toast(msg) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
    },

    openModal(html) {
        document.getElementById('modalContent').innerHTML = html;
        document.getElementById('modalOverlay').classList.add('show');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('show');
    },

    // 下拉菜单：显示所有家庭成员 + 家庭组管理入口（无"添加成员"）
    toggleDropdown() {
        const dd = document.getElementById('familyDropdown');
        if (dd.classList.contains('show')) { dd.classList.remove('show'); return; }
        let html = '';
        this.state.members.forEach(m => {
            const checked = m.id === this.state.currentMemberId ? '<i class="fas fa-check check"></i>' : '';
            const isSelf = m.relation === 'self';
            const label = isSelf ? m.name + '（我）' : m.name;
            html += `<button class="dropdown-item" onclick="App.selectMember('${m.id}')">
                <div class="avatar-small">${m.avatar || m.name.charAt(0)}</div>
                <span>${label}</span>${checked}</button>`;
        });
        html += '<div class="dropdown-divider"></div>';
        html += `<button class="dropdown-item" onclick="App.switchPage('family');document.getElementById('familyDropdown').classList.remove('show');"><i class="fas fa-cog" style="color:#2b7a78;width:32px;text-align:center;"></i><span>家庭组管理</span></button>`;
        dd.innerHTML = html;
        dd.classList.add('show');
    },

    selectMember(id) {
        this.state.currentMemberId = id;
        document.getElementById('familyDropdown').classList.remove('show');
        this.updateHeader();
        if (['home', 'records', 'pharmacy'].includes(this.state.currentPage)) {
            this.switchPage(this.state.currentPage);
        }
    },

    openScanSelector() {
        document.getElementById('scanOverlay').classList.add('show');
    },

    closeScanSelector(e) {
        if (e && e.target && e.target !== document.getElementById('scanOverlay')) return;
        document.getElementById('scanOverlay').classList.remove('show');
    },

    // 从手动添加页面切换到拍照识别
    switchToScan(type) {
        this.closeModal();
        this.startScan(type);
    },

    // 中文扫描类型 → 后端 OCR 类型
    _ocrTypeMap: { '病历': 'record', '报告': 'report', '处方': 'prescription', '药品': 'drug' },

    // 给图片 url 拼上 token，供 <img> 鉴权访问
    _authImgUrl(url) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token || !url) return url;
        const sep = url.includes('?') ? '&' : '?';
        return url + sep + 'token=' + encodeURIComponent(token);
    },

    // 调起相机/相册选择图片
    _pickImages() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', () => {
                const files = Array.from(input.files || []);
                document.body.removeChild(input);
                resolve(files);
            }, { once: true });
            // 用户取消时 change 不触发，无法可靠监听取消，保留 input 由 change 清理
            input.click();
        });
    },

    async startScan(type) {
        document.getElementById('scanOverlay').classList.remove('show');
        const memberId = this.state.currentMemberId;
        if (!memberId) { this.toast('请先选择一位成员'); return; }

        const files = await this._pickImages();
        if (!files.length) { console.log('[扫描] 用户未选择图片'); return; }
        console.log(`[扫描] 选了 ${files.length} 张图片:`, files.map(f => `${f.name}(${f.type},${f.size}bytes)`));

        const ocrType = this._ocrTypeMap[type] || 'record';
        console.log(`[扫描] 开始OCR识别, type=${type} → ocrType=${ocrType}`);
        this.openModal(`<div class="ocr-loading"><div class="spinner"></div><h3>正在识别...</h3><p class="text-muted">上传图片并 OCR 识别中</p></div>`);

        let resp;
        try {
            resp = await Api.ocr.recognize(files, ocrType);
            console.log('[扫描] OCR响应:', { text: resp.text, parsed: resp.parsed });
        } catch (err) {
            console.error('[扫描] OCR失败:', err);
            this.closeModal();
            this.toast(err.message || 'OCR识别失败');
            return;
        }

        const parsed = resp.parsed || {};
        // 保留 File 对象，确认保存时才上传到 MinIO（符合"先识别后保存"流程）
        App._ocrFiles = files;
        App._ocrImageUrls = files.map(f => URL.createObjectURL(f));
        App._ocrConfidence = 0.9;

        // 已拍图片缩略图（本地预览，保存时才上传为附件）
        const thumbUrls = App._ocrImageUrls;
        const thumbsHtml = thumbUrls.length ? `
            <div class="form-group">
                <label>拍摄图片（保存时上传为附件）</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${thumbUrls.map((u, idx) => {
                        const urlsJson = JSON.stringify(thumbUrls).replace(/"/g, '&quot;');
                        return `<div style="width:72px;height:72px;border-radius:8px;overflow:hidden;flex-shrink:0;">
                            <img src="${u}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="ImageViewer.show(${urlsJson},${idx})">
                        </div>`;
                    }).join('')}
                </div>
            </div>` : '';
        const today = new Date().toISOString().slice(0, 10);
        // OCR 识别原文（参考用，便于手动核对/填写）
        const ocrTextHtml = resp.text ? `
            <div class="form-group">
                <label>识别原文（可参考手动核对）</label>
                <textarea readonly style="background:#f5f5f5;font-size:13px;min-height:50px;max-height:120px;white-space:pre-wrap;">${this._escAttr(resp.text)}</textarea>
            </div>` : '';

        if (type === '病历') {
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 病历</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('病历')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                ${thumbsHtml}
                ${ocrTextHtml}
                <div class="form-group"><label>关联成员</label><select id="ocr-record-elder">${this._memberOptions()}</select></div>
                <div class="form-group"><label>类型</label><select id="ocr-record-type"><option selected>病历</option><option>检查报告</option></select></div>
                <div class="form-group"><label>就诊日期</label><input id="ocr-record-date" type="date" value="${parsed.visitDate || today}"></div>
                <div class="form-group"><label>医院</label><input id="ocr-hospital" value="${this._escAttr(parsed.hospital)}" placeholder="输入医院名称或拼音首字母" autocomplete="off" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室</label><input id="ocr-department" value="${this._escAttr(parsed.department)}" placeholder="输入科室名称或拼音首字母" autocomplete="off" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>主诉</label><textarea id="ocr-complaint" placeholder="主要症状">${this._escAttr(parsed.chiefComplaint)}</textarea></div>
                <div class="form-group"><label>诊断 *</label><input id="ocr-diagnosis" value="${this._escAttr(parsed.diagnosis)}" placeholder="诊断结果"></div>
                <div class="form-group"><label>医嘱</label><textarea id="ocr-orders" placeholder="医嘱内容">${this._escAttr(parsed.orders)}</textarea></div>
                <div class="form-group"><label>医生</label><input id="ocr-doctor" value="${this._escAttr(parsed.doctor)}" placeholder="主治医生"></div>
                <button class="btn-primary" onclick="App.saveOcrRecord()">保存病历</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
            App._ocrMetrics = parsed.metrics || [];
        } else if (type === '报告') {
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 检查报告</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('报告')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                ${thumbsHtml}
                ${ocrTextHtml}
                <div class="form-group"><label>关联成员</label><select id="ocr-record-elder">${this._memberOptions()}</select></div>
                <div class="form-group"><label>类型</label><select id="ocr-record-type"><option>病历</option><option selected>检查报告</option></select></div>
                <div class="form-group"><label>检查日期</label><input id="ocr-record-date" type="date" value="${parsed.visitDate || today}"></div>
                <div class="form-group"><label>医院</label><input id="ocr-hospital" value="${this._escAttr(parsed.hospital)}" placeholder="如：市中心医院" oninput="HospitalSuggest.onInput(this)"></div>
                <div class="form-group"><label>科室</label><input id="ocr-department" value="${this._escAttr(parsed.department)}" placeholder="如：影像科" oninput="DeptSuggest.onInput(this)"></div>
                <div class="form-group"><label>检查项目</label><input id="ocr-diagnosis" value="${this._escAttr(parsed.examName)}"></div>
                <div class="form-group"><label>检查所见</label><textarea id="ocr-findings" rows="4">${this._escAttr(parsed.findings)}</textarea></div>
                <div class="form-group"><label>报告结论</label><textarea id="ocr-conclusion" rows="3">${this._escAttr(parsed.conclusion)}</textarea></div>
                <button class="btn-primary" onclick="App.saveOcrRecord()">保存报告</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
            App._ocrMetrics = [];
        } else if (type === '处方') {
            const meds = (parsed.medications && parsed.medications.length) ? parsed.medications : [{ name: '', dose: '', frequency: '每日1次', note: '' }];
            const specUnitOpts = ['g', 'mg', 'ml', 'μg'];
            const capUnitOpts = ['片', '粒', '袋', '支', '瓶', '贴'];
            const doseUnitOpts = ['mg', 'g', 'ml', 'μg', '片', '粒', '袋', '支', '贴'];
            const opts = arr => arr.map(u => `<option value="${u}">${u}</option>`).join('');
            const optsSel = (arr, sel) => arr.map(u => `<option value="${u}"${u === sel ? ' selected' : ''}>${u}</option>`).join('');
            const normUnit = u => (u === 'ug' ? 'μg' : u) || '';
            const medBlocks = meds.map((m, i) => {
                const p = `ocrMed${i}`;
                const freqN = this._freqTextToCount(m.frequency).frequency;
                const sdu = normUnit(m.specDosageUnit);
                const du = normUnit(m.doseUnit);
                return `
                <div style="background:#f8fafd;border-radius:12px;padding:12px;margin-bottom:8px;">
                    <div class="form-group"><label>药品${i + 1}名称 *</label><input id="${p}Name" value="${this._escAttr(m.name)}" placeholder="输入名称或拼音首字母" autocomplete="off" oninput="DrugSuggest.onInput(this,'${p}Code')"><input type="hidden" id="${p}Code"></div>
                    <div class="form-group"><label>规格（每片/袋含量）</label><div style="display:flex;gap:8px"><input id="${p}SpecDosage" type="number" step="0.001" value="${m.specDosage || ''}" placeholder="如 0.25" style="flex:2"><select id="${p}SpecDosageUnit" style="flex:1">${optsSel(specUnitOpts, sdu)}</select></div></div>
                    <div class="form-group"><label>单位容量（每盒/瓶数量）</label><div style="display:flex;gap:8px"><input id="${p}UnitCap" type="number" value="${m.unitCap || ''}" placeholder="如 20" style="flex:2"><select id="${p}UnitCapUnit" style="flex:1">${opts(capUnitOpts)}</select></div></div>
                    <div class="form-group"><label>数量</label><input id="${p}Qty" type="number" value="1" min="1"></div>
                    <div class="form-group"><label>有效期 *</label><input id="${p}Expiry" type="date"></div>
                    <div class="form-group"><label>每次剂量</label><div style="display:flex;gap:8px"><input id="${p}DoseAmount" type="number" step="0.001" value="${m.doseAmount || ''}" placeholder="如 5" style="flex:2"><select id="${p}DoseUnit" style="flex:1">${optsSel(doseUnitOpts, du)}</select></div></div>
                    <div class="form-group"><label>每日次数</label><input id="${p}Freq" type="number" min="1" max="4" value="${freqN}" oninput="MedTimesUI.render('${p}')"></div>
                    <div class="form-group"><label>服用时间段</label><div id="${p}TimeSlots"></div></div>
                    <div class="form-group"><label>开始日期</label><input id="${p}Start" type="date" value="${today}"></div>
                    <div class="form-group"><label>备注</label><input id="${p}Note" value="${this._escAttr(m.note)}" placeholder="如：餐后服用"></div>
                </div>`;
            }).join('');
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 处方</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('处方')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                ${thumbsHtml}
                ${ocrTextHtml}
                <div class="form-group"><label>关联成员</label><select id="ocr-med-elder">${this._memberOptions()}</select></div>
                ${medBlocks}
                <button class="btn-primary" onclick="App.saveOcrMeds()">添加用药</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
            // 初始化每个药品的服用时间段
            for (let i = 0; i < meds.length; i++) {
                const p = `ocrMed${i}`;
                delete MedTimesUI._state[p];
                MedTimesUI.render(p);
            }
            App._ocrMeds = meds;
        } else if (type === '药品') {
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 药品</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('药品')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                ${thumbsHtml}
                ${ocrTextHtml}
                <div class="form-group"><label>药品名称</label><input id="ocr-drug-name" value="${this._escAttr(parsed.name)}" oninput="DrugSuggest.onInput(this,'drugCodeHidden',{specification:'ocr-drug-spec',manufacturer:'ocr-drug-manufacturer'})"><input type="hidden" id="drugCodeHidden"></div>
                <div class="form-group"><label>规格</label><input id="ocr-drug-spec" value="${this._escAttr(parsed.specification)}"></div>
                <div class="form-group"><label>厂商</label><input id="ocr-drug-manufacturer" value="${this._escAttr(parsed.manufacturer)}" placeholder="如：扬子江药业"></div>
                <div class="form-group"><label>数量</label><input id="ocr-drug-qty" type="number" value="1"></div>
                <div class="form-group"><label>有效期</label><input id="ocr-drug-exp" type="date"></div>
                <div class="form-group"><label>备注</label><input id="ocr-drug-note" placeholder="备注信息"></div>
                <button class="btn-primary" onclick="App.saveOcrDrug()">录入药箱</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
        }
    },

    // 转义属性/文本，避免 OCR 文本含引号破坏 HTML
    _escAttr(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // 生成成员下拉选项html
    _memberOptions() {
        return this.state.members.map(m => {
            const isSelf = m.relation === 'self';
            const label = isSelf ? m.name + '（我）' : m.name;
            return `<option value="${m.id}" ${m.id === this.state.currentMemberId ? 'selected' : ''}>${label}</option>`;
        }).join('');
    },

    // 确认保存时上传 OCR 拍摄的图片到 MinIO，返回 fileIds（失败时提示但不阻断保存）
    async _uploadOcrFiles() {
        if (!App._ocrFiles || !App._ocrFiles.length) return undefined;
        const filesToUpload = App._ocrFiles;
        App._ocrFiles = null; // 防止重复上传
        try {
            const uploaded = await Api.upload.files(filesToUpload);
            const ids = uploaded.map(f => f.id);
            return ids.length ? ids : undefined;
        } catch (err) {
            console.error('上传OCR图片失败:', err.message);
            this.toast('图片上传失败：' + err.message);
            return undefined;
        }
    },

    async saveOcrRecord() {
        const elderId = document.getElementById('ocr-record-elder')?.value || this.state.currentMemberId;
        try {
            const fileIds = await this._uploadOcrFiles();
            await Api.records.add({
                elderId,
                type: document.getElementById('ocr-record-type')?.value || '病历',
                visitDate: document.getElementById('ocr-record-date')?.value || new Date().toISOString().slice(0, 10),
                diagnosis: document.getElementById('ocr-diagnosis').value,
                hospital: document.getElementById('ocr-hospital').value,
                department: document.getElementById('ocr-department').value,
                chiefComplaint: document.getElementById('ocr-complaint')?.value || '',
                findings: document.getElementById('ocr-findings')?.value || '',
                conclusion: document.getElementById('ocr-conclusion')?.value || '',
                orders: document.getElementById('ocr-orders')?.value || '',
                doctor: document.getElementById('ocr-doctor')?.value || '',
                metrics: App._ocrMetrics || [],
                confidence: App._ocrConfidence || 0.9,
                fileIds,
            });
            this.closeModal();
            this.toast('保存成功');
            if (this.state.currentPage === 'records' || this.state.currentPage === 'home') this.switchPage(this.state.currentPage);
        } catch (err) { this.toast(err.message); }
    },

    // 将频次文本（每日X次/qd/bid/tid）映射为 { frequency:number, times:[...] }
    _freqTextToCount(text) {
        const t = (text || '').trim();
        let n = 1;
        const slashM = t.match(/(\d)\s*\/\s*日/);
        if (slashM) n = parseInt(slashM[1]);
        else if (/每日3次|每天3次|tid/i.test(t)) n = 3;
        else if (/每日2次|每天2次|bid/i.test(t)) n = 2;
        else if (/每日4次|每天4次|qid/i.test(t)) n = 4;
        else if (/每晚|qn/i.test(t)) n = 1;
        const slots = ['08:00', '12:00', '18:00', '21:00'];
        return { frequency: n, times: slots.slice(0, n) };
    },

    async saveOcrMeds() {
        if (this._ocrMedsSaving) return;
        this._ocrMedsSaving = true;
        try {
            const fileIds = await this._uploadOcrFiles();
            const medCount = App._ocrMeds ? App._ocrMeds.length : 0;
            for (let i = 0; i < medCount; i++) {
                const p = `ocrMed${i}`;
                const nameEl = document.getElementById(`${p}Name`);
                if (!nameEl || !nameEl.value.trim()) continue;
                const expiryDate = document.getElementById(`${p}Expiry`).value;
                if (!expiryDate) { this.toast(`请填写药品${i + 1}的有效期`); return; }
                const specDosageVal = document.getElementById(`${p}SpecDosage`).value;
                const doseAmountVal = document.getElementById(`${p}DoseAmount`).value;
                const times = MedTimesUI.getTimes(p);
                await Api.medications.add({
                    elderId: document.getElementById('ocr-med-elder')?.value || this.state.currentMemberId,
                    name: nameEl.value,
                    drugCode: (document.getElementById(`${p}Code`) || {}).value || undefined,
                    specification: specDosageVal ? `${specDosageVal}${document.getElementById(`${p}SpecDosageUnit`).value}` : undefined,
                    dose: doseAmountVal ? `${doseAmountVal}${document.getElementById(`${p}DoseUnit`).value}` : undefined,
                    doseAmount: doseAmountVal ? parseFloat(doseAmountVal) : undefined,
                    doseUnit: doseAmountVal ? document.getElementById(`${p}DoseUnit`).value : undefined,
                    quantity: parseInt(document.getElementById(`${p}Qty`).value) || 1,
                    frequency: parseInt(document.getElementById(`${p}Freq`).value) || 1,
                    times,
                    startDate: document.getElementById(`${p}Start`).value || new Date().toISOString().slice(0, 10),
                    note: document.getElementById(`${p}Note`)?.value || '',
                    expiryDate,
                    status: 'active',
                    fileIds,
                });
            }
            this.closeModal();
            this.toast('用药已添加');
            if (this.state.currentPage === 'home') this.switchPage('home');
        } catch (err) { this.toast(err.message); }
        finally { this._ocrMedsSaving = false; }
    },

    async saveOcrDrug() {
        try {
            const fileIds = await this._uploadOcrFiles();
            await Api.drugs.add({
                elderId: this.state.currentMemberId,
                name: document.getElementById('ocr-drug-name').value,
                drugCode: (document.getElementById('drugCodeHidden') || {}).value || undefined,
                specification: document.getElementById('ocr-drug-spec').value,
                manufacturer: document.getElementById('ocr-drug-manufacturer')?.value || '',
                quantity: parseInt(document.getElementById('ocr-drug-qty').value) || 1,
                expiryDate: document.getElementById('ocr-drug-exp').value,
                note: document.getElementById('ocr-drug-note')?.value || '',
                fileIds,
            });
            this.closeModal();
            this.toast('药品已录入药箱');
            if (this.state.currentPage === 'pharmacy') this.switchPage('pharmacy');
        } catch (err) { this.toast(err.message); }
    },

    openMessages() { this.switchPage('messages'); },

    async doLogin() {
        const phone = document.getElementById('loginPhone').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!phone || !password) { this.toast('请输入手机号和密码'); return; }
        try {
            const data = await Api.auth.login(phone, password);
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));
            this.state.user = data.user;
            this.state.family = data.family;
            await this.loadData();
            this.switchPage('home');
        } catch (err) { this.toast(err.message); }
    },

    async doRegister() {
        const name = document.getElementById('regName').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const password = document.getElementById('regPassword').value;
        if (!name || !password) { this.toast('请填写姓名和密码'); return; }
        if (password.length < 6) { this.toast('密码至少6位'); return; }
        try {
            const data = await Api.auth.register(name, phone, password);
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));
            this.state.user = data.user;
            this.state.family = data.family;
            await this.loadData();
            this.switchPage('home');
        } catch (err) { this.toast(err.message); }
    },

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        this.state.user = null;
        this.state.family = null;
        this.state.members = [];
        this.state.currentMemberId = null;
        this.state.pageHistory = [];
        this.switchPage('login');
    },

    showRegister() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    },

    showLogin() {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    },

    async saveProfile() {
        const selfElder = this.state.members.find(m => m.relation === 'self');
        if (!selfElder) { this.toast('未找到个人信息'); return; }
        const name = document.getElementById('pe-name')?.value.trim();
        const gender = document.getElementById('pe-gender')?.value;
        const age = parseInt(document.getElementById('pe-age')?.value) || 0;
        const bloodType = document.getElementById('pe-blood')?.value || null;
        const allergies = document.getElementById('pe-allergies')?.value.trim() || null;
        const conditions = document.getElementById('pe-conditions')?.value.trim() || null;
        const phone = document.getElementById('pe-phone')?.value.trim() || null;
        if (!name) { this.toast('姓名不能为空'); return; }
        try {
            await Api.elders.update(selfElder.id, { name, gender, age, bloodType, allergies, conditions, phone });
            if (phone && phone !== this.state.user.phone) {
                await Api.auth.updateProfile({ phone });
            }
            if (name !== this.state.user.name) {
                await Api.auth.updateProfile({ name });
            }
            await this.loadData();
            this.toast('个人信息已保存');
            this.goBack();
        } catch (err) { this.toast(err.message); }
    },

    async toggleMedTaken(btn) {
        if (btn.classList.contains('taken')) {
            btn.classList.remove('taken');
            btn.textContent = '待服';
        } else {
            btn.classList.add('taken');
            btn.innerHTML = '✓ 已服';
            const elderId = this.state.currentMemberId;
            try {
                const medsRes = await Api.medications.getAll(elderId, true);
                const meds = medsRes.medications || [];
                if (meds.length > 0) {
                    await Api.medications.log(meds[0].id, new Date().toISOString().slice(0, 19).replace('T', ' '), false);
                }
            } catch {}
        }
    },

    async viewRecord(id) {
        this.state.currentRecordId = id;
        this.switchPage('recordDetail');
    },

    viewDrugInfo(name, spec, manufacturer, drugCode) {
        this.state.currentDrugName = name;
        this.state.currentDrugSpec = spec || '';
        this.state.currentDrugManufacturer = manufacturer || '';
        this.state.currentDrugCode = drugCode || '';
        this.switchPage('drugInfo');
    },

    viewDrugDetail(drugId) {
        this.state.currentDrugId = drugId;
        this.switchPage('drugDetail');
    },

    async deleteRecord(id) {
        if (!confirm('确认删除此病历？')) return;
        try { await Api.records.delete(id); this.toast('已删除'); this.goBack(); } catch (err) { this.toast(err.message); }
    },

    async deleteDrug(id) {
        if (!confirm('确认删除此药品？')) return;
        try { await Api.drugs.delete(id); this.toast('已删除'); this.switchPage('pharmacy'); } catch (err) { this.toast(err.message); }
    },

    async saveMed() {
        const elderId = document.getElementById('medElderId').value;
        const name = document.getElementById('medName').value.trim();
        const drugCode = (document.getElementById('medDrugCode') || {}).value || '';
        const expiryDate = document.getElementById('medExpiryDate').value;
        if (!name) { this.toast('请输入药品名称'); return; }
        if (!expiryDate) { this.toast('请填写有效期'); return; }
        const specDosageVal = document.getElementById('medSpecDosage').value;
        try {
            const times = MedTimesUI.getTimes('med');
            const fileIds = ImageUploader.getFileIds('medImages');
            const doseAmountVal = document.getElementById('medDoseAmount').value;
            await Api.medications.add({
                elderId, name, drugCode: drugCode || undefined,
                specification: specDosageVal ? `${specDosageVal}${document.getElementById('medSpecDosageUnit').value}` : undefined,
                dose: doseAmountVal ? `${doseAmountVal}${document.getElementById('medDoseUnit').value}` : undefined,
                doseAmount: doseAmountVal ? parseFloat(doseAmountVal) : undefined,
                doseUnit: doseAmountVal ? document.getElementById('medDoseUnit').value : undefined,
                quantity: parseInt(document.getElementById('medQty').value) || 1,
                frequency: parseInt(document.getElementById('medFreq').value) || 1,
                times,
                startDate: document.getElementById('medStart').value || new Date().toISOString().slice(0, 10),
                note: document.getElementById('medNote').value,
                status: 'active',
                fileIds: fileIds.length > 0 ? fileIds : undefined,
            });
            this.toast('添加成功');
            this.goBack();
        } catch (err) { this.toast(err.message); }
    },

    async saveRecord() {
        const elderId = document.getElementById('recordElderId').value;
        const type = document.getElementById('recordType').value;
        const isReport = type === '检查报告';
        const isPrescription = type === '处方';
        const fileIds = ImageUploader.getFileIds('recordImages');

        if (isPrescription) {
            const medName = document.getElementById('recordMedName').value.trim();
            const medDrugCode = (document.getElementById('recordMedCode') || {}).value || '';
            const medExpiryDate = document.getElementById('recordMedExpiryDate').value;
            if (!medName) { this.toast('请输入药品名称'); return; }
            if (!medExpiryDate) { this.toast('请填写有效期'); return; }
            const specDosageVal = document.getElementById('recordMedSpecDosage').value;
            const doseAmountVal = document.getElementById('recordMedDoseAmount').value;
            try {
                const times = MedTimesUI.getTimes('recordMed');
                await Api.medications.add({
                    elderId,
                    name: medName,
                    drugCode: medDrugCode || undefined,
                    specification: specDosageVal ? `${specDosageVal}${document.getElementById('recordMedSpecDosageUnit').value}` : undefined,
                    dose: doseAmountVal ? `${doseAmountVal}${document.getElementById('recordMedDoseUnit').value}` : undefined,
                    doseAmount: doseAmountVal ? parseFloat(doseAmountVal) : undefined,
                    doseUnit: doseAmountVal ? document.getElementById('recordMedDoseUnit').value : undefined,
                    quantity: parseInt(document.getElementById('recordMedQty').value) || 1,
                    frequency: parseInt(document.getElementById('recordMedFreq').value) || 1,
                    times,
                    startDate: document.getElementById('recordDate3').value || new Date().toISOString().slice(0, 10),
                    note: document.getElementById('recordMedNote').value,
                    expiryDate: medExpiryDate,
                    fileIds: fileIds.length > 0 ? fileIds : undefined,
                });
                this.toast('处方添加成功');
                this.goBack();
            } catch (err) { this.toast(err.message); }
        } else if (isReport) {
            const examName = document.getElementById('recordExamName').value.trim();
            if (!examName) { this.toast('请输入检查项目'); return; }
            try {
                await Api.records.add({
                    elderId,
                    type,
                    visitDate: document.getElementById('recordDate2').value || new Date().toISOString().slice(0, 10),
                    diagnosis: examName,
                    hospital: document.getElementById('recordHospital2').value,
                    department: document.getElementById('recordDept2').value,
                    findings: document.getElementById('recordFindings').value,
                    conclusion: document.getElementById('recordConclusion').value,
                    fileIds: fileIds.length > 0 ? fileIds : undefined,
                });
                this.toast('报告添加成功');
                this.goBack();
            } catch (err) { this.toast(err.message); }
        } else {
            const diagnosis = document.getElementById('recordDiagnosis').value.trim();
            if (!diagnosis) { this.toast('请输入诊断'); return; }
            try {
                await Api.records.add({
                    elderId,
                    type,
                    visitDate: document.getElementById('recordDate').value || new Date().toISOString().slice(0, 10),
                    diagnosis,
                    hospital: document.getElementById('recordHospital').value,
                    department: document.getElementById('recordDept').value,
                    orders: document.getElementById('recordOrders').value,
                    doctor: document.getElementById('recordDoctor').value,
                    chiefComplaint: document.getElementById('recordComplaint').value,
                    fileIds: fileIds.length > 0 ? fileIds : undefined,
                });
                this.toast('添加成功');
                this.goBack();
            } catch (err) { this.toast(err.message); }
        }
    },

    async saveDrug() {
        const name = document.getElementById('drugName').value.trim();
        const drugCode = (document.getElementById('drugCodeHidden') || {}).value || '';
        const expiryDate = document.getElementById('drugExp').value;
        if (!name) { this.toast('请输入药品名称'); return; }
        if (!expiryDate) { this.toast('请填写有效期'); return; }
        const specDosageVal = document.getElementById('specDosage').value;
        const unitCapVal = document.getElementById('unitCap').value;
        const fileIds = ImageUploader.getFileIds('drugImages');
        try {
            await Api.drugs.add({
                elderId: this.state.currentMemberId,
                name,
                drugCode: drugCode || undefined,
                specDosage: specDosageVal ? parseFloat(specDosageVal) : undefined,
                specDosageUnit: document.getElementById('specDosageUnit').value.trim() || undefined,
                unitCapacity: unitCapVal ? parseInt(unitCapVal) : undefined,
                unitCapacityUnit: document.getElementById('unitCapUnit').value.trim() || undefined,
                manufacturer: document.getElementById('drugManu').value.trim() || undefined,
                quantity: parseInt(document.getElementById('drugQty').value) || 1,
                expiryDate: document.getElementById('drugExp').value,
                note: document.getElementById('drugNote').value,
                fileIds: fileIds.length > 0 ? fileIds : undefined,
            });
            this.toast('添加成功');
            this.goBack();
        } catch (err) { this.toast(err.message); }
    },

    async joinFamily() {
        const code = document.getElementById('joinCode').value.trim();
        if (!code) { this.toast('请输入邀请码'); return; }
        try {
            await Api.auth.joinFamily(code);
            this.toast('加入成功');
            await this.loadData();
            this.switchPage('home');
        } catch (err) { this.toast(err.message); }
    },

    copyInviteCode() {
        const codeEl = document.querySelector('.invite-code-text');
        if (codeEl) {
            navigator.clipboard.writeText(codeEl.textContent).then(() => this.toast('邀请码已复制')).catch(() => this.toast('复制失败'));
        }
    },

    async deleteElder(id) {
        const member = this.state.members.find(m => m.id === id);
        if (member && member.relation === 'self') { this.toast('不能删除自己的档案'); return; }
        if (!confirm('确认删除此成员档案？相关病历和用药记录也会被删除。')) return;
        try { await Api.elders.delete(id); this.toast('已删除'); await this.loadData(); this.switchPage('home'); } catch (err) { this.toast(err.message); }
    },

    async toggleMemberAuth(userId) {
        try {
            const res = await Api.auth.toggleAuthorize(userId);
            this.toast(res.authorized ? '已授权' : '已取消授权');
        } catch (err) { this.toast(err.message); }
    },

    async updateFamilyName() {
        const input = document.getElementById('familyNameInput');
        if (!input) return;
        const name = input.value.trim();
        if (!name) { this.toast('请输入家庭组名称'); return; }
        try {
            const res = await Api.auth.updateFamily(name);
            this.state.family = res.family;
            this.updateHeader();
            this.toast('家庭组名称已更新');
        } catch (err) { this.toast(err.message); }
    },

    async editFamilyName(familyId, currentName) {
        const newName = prompt('修改家庭组名称', currentName);
        if (!newName || newName === currentName) return;
        try {
            await Api.auth.updateFamily(newName);
            if (this.state.family && this.state.family.id === familyId) {
                this.state.family.name = newName;
                this.updateHeader();
            }
            this.toast('名称已更新');
            PageFamily.loadFamilies();
        } catch (err) { this.toast(err.message); }
    },
};
