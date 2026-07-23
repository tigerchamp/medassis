// ========== OCR 模拟数据 ==========
const OCR_TEMPLATES = {
    record: [
        { diagnosis: '高血压3级', hospital: '市中心医院', department: '心内科', chiefComplaint: '头晕、头痛伴乏力1周', metrics: [{ name: '收缩压', value: '155', unit: 'mmHg', ref: '90-140', abnormal: true }, { name: '舒张压', value: '95', unit: 'mmHg', ref: '60-90', abnormal: true }, { name: '空腹血糖', value: '7.8', unit: 'mmol/L', ref: '3.9-6.1', abnormal: true }], orders: '低盐低脂饮食，规律服药，监测血压血糖，1周后复诊。' },
        { diagnosis: '2型糖尿病', hospital: '人民医院', department: '内分泌科', chiefComplaint: '多饮多尿伴体重下降2月', metrics: [{ name: '空腹血糖', value: '9.1', unit: 'mmol/L', ref: '3.9-6.1', abnormal: true }, { name: '糖化血红蛋白', value: '8.2', unit: '%', ref: '4.0-6.0', abnormal: true }], orders: '糖尿病饮食，规律降糖药物治疗，每周监测血糖2-3次。' },
    ],
    report: [
        { diagnosis: '胸部CT平扫', hospital: '市中心医院', department: '影像科', findings: '双肺纹理清晰，右肺中叶见小斑片状磨玻璃影，边界模糊，约8mm×6mm，余肺野未见明显实变及结节。纵隔居中，心影大小形态未见明显异常。双侧胸腔未见积液征象。', conclusion: '右肺中叶磨玻璃结节，建议6个月后CT复查随访。' },
        { diagnosis: '腹部超声检查', hospital: '人民医院', department: '超声科', findings: '肝脏形态正常，实质回声均匀，未见明显占位性病变。胆囊大小正常，壁光滑，腔内未见异常回声。胰腺显示清晰，未见异常。双肾形态正常，皮髓质分界清，未见明显积水及占位。', conclusion: '腹部超声未见明显异常。' },
        { diagnosis: '头颅MRI平扫', hospital: '省立医院', department: '影像科', findings: '双侧大脑半球对称，脑灰白质分界清。双侧基底节区可见小点状长T2信号影，FLAIR呈高信号，最大径约3mm。脑室系统无扩张，中线结构居中。小脑及脑干未见明显异常信号。', conclusion: '双侧基底节区腔隙性脑梗塞，建议结合临床定期随访。' },
    ],
    medication: [
        { name: '苯磺酸氨氯地平片', dose: '5mg', frequency: '每日1次', times: ['08:00'], note: '晨起服用' },
        { name: '二甲双胍缓释片', dose: '0.5g', frequency: '每日2次', times: ['08:00', '20:00'], note: '餐中或餐后服用' },
        { name: '阿托伐他汀钙片', dose: '20mg', frequency: '每晚1次', times: ['21:30'], note: '睡前服用' },
    ],
    drug: [
        { name: '阿莫西林胶囊', specification: '20粒/盒', manufacturer: '联邦制药', quantity: 2, expiryDate: '2028-03-14' },
        { name: '硝苯地平缓释片', specification: '30片/盒', manufacturer: '拜耳医药', quantity: 1, expiryDate: '2027-12-01' },
    ],
};
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

    async startScan(type) {
        document.getElementById('scanOverlay').classList.remove('show');
        const memberId = this.state.currentMemberId;
        if (!memberId) { this.toast('请先选择一位成员'); return; }

        this.openModal(`<div class="ocr-loading"><div class="spinner"></div><h3>正在识别...</h3><p class="text-muted">图像预处理 + OCR识别</p></div>`);
        await new Promise(r => setTimeout(r, 1500));
        const today = new Date().toISOString().slice(0, 10);

        if (type === '病历') {
            const result = pick(OCR_TEMPLATES.record);
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 病历</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('病历')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                <div class="form-group"><label>关联成员</label><select id="ocr-record-elder">${this._memberOptions()}</select></div>
                <div class="form-group"><label>类型</label><select id="ocr-record-type"><option selected>病历</option><option>检查报告</option></select></div>
                <div class="form-group"><label>就诊日期</label><input id="ocr-record-date" type="date" value="${today}"></div>
                <div class="form-group"><label>医院</label><input id="ocr-hospital" value="${result.hospital}"></div>
                <div class="form-group"><label>科室</label><input id="ocr-department" value="${result.department}"></div>
                <div class="form-group"><label>主诉</label><input id="ocr-complaint" value="${result.chiefComplaint}"></div>
                <div class="form-group"><label>诊断</label><input id="ocr-diagnosis" value="${result.diagnosis}"></div>
                <div class="form-group"><label>医嘱</label><textarea id="ocr-orders">${result.orders}</textarea></div>
                <button class="btn-primary" onclick="App.saveOcrRecord()">保存病历</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
            App._ocrMetrics = result.metrics;
        } else if (type === '报告') {
            const result = pick(OCR_TEMPLATES.report);
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 检查报告</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('报告')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                <div class="form-group"><label>关联成员</label><select id="ocr-record-elder">${this._memberOptions()}</select></div>
                <div class="form-group"><label>类型</label><select id="ocr-record-type"><option>病历</option><option selected>检查报告</option></select></div>
                <div class="form-group"><label>检查日期</label><input id="ocr-record-date" type="date" value="${today}"></div>
                <div class="form-group"><label>医院</label><input id="ocr-hospital" value="${result.hospital}"></div>
                <div class="form-group"><label>科室</label><input id="ocr-department" value="${result.department}"></div>
                <div class="form-group"><label>检查项目</label><input id="ocr-diagnosis" value="${result.diagnosis}"></div>
                <div class="form-group"><label>检查所见</label><textarea id="ocr-findings" rows="4">${result.findings}</textarea></div>
                <div class="form-group"><label>报告结论</label><textarea id="ocr-conclusion" rows="3">${result.conclusion}</textarea></div>
                <button class="btn-primary" onclick="App.saveOcrRecord()">保存报告</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
            App._ocrMetrics = [];
        } else if (type === '处方') {
            const meds = [pick(OCR_TEMPLATES.medication), pick(OCR_TEMPLATES.medication)];
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 处方</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('处方')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                <div class="form-group"><label>关联成员</label><select id="ocr-med-elder">${this._memberOptions()}</select></div>
                ${meds.map((m, i) => `
                    <div style="background:#f8fafd;border-radius:12px;padding:12px;margin-bottom:8px;">
                        <div class="form-group"><label>药品${i + 1}名称</label><input id="ocr-med-name-${i}" value="${m.name}"></div>
                        <div class="form-group"><label>剂量</label><input id="ocr-med-dose-${i}" value="${m.dose}"></div>
                        <div class="form-group"><label>频次</label><input id="ocr-med-freq-${i}" value="${m.frequency}"></div>
                        <div class="form-group"><label>开始日期</label><input id="ocr-med-start-${i}" type="date" value="${today}"></div>
                        <div class="form-group"><label>备注</label><input id="ocr-med-note-${i}" value="${m.note || ''}"></div>
                    </div>
                `).join('')}
                <button class="btn-primary" onclick="App.saveOcrMeds()">添加用药</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
            App._ocrMeds = meds;
        } else if (type === '药品') {
            const drug = pick(OCR_TEMPLATES.drug);
            this.closeModal();
            this.openModal(`
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <h3 style="flex:1;margin:0;">识别结果 - 药品</h3>
                    <button class="btn-outline" style="width:auto;padding:6px 12px;font-size:13px;" onclick="App.switchToScan('药品')"><i class="fas fa-camera"></i> 重新扫描</button>
                </div>
                <div class="form-group"><label>药品名称</label><input id="ocr-drug-name" value="${drug.name}"></div>
                <div class="form-group"><label>规格</label><input id="ocr-drug-spec" value="${drug.specification}"></div>
                <div class="form-group"><label>厂商</label><input id="ocr-drug-manufacturer" value="${drug.manufacturer || ''}" placeholder="如：扬子江药业"></div>
                <div class="form-group"><label>数量</label><input id="ocr-drug-qty" type="number" value="${drug.quantity}"></div>
                <div class="form-group"><label>有效期</label><input id="ocr-drug-exp" type="date" value="${drug.expiryDate}"></div>
                <div class="form-group"><label>备注</label><input id="ocr-drug-note" placeholder="备注信息"></div>
                <button class="btn-primary" onclick="App.saveOcrDrug()">录入药箱</button>
                <button class="btn-outline" style="margin-top:8px;" onclick="App.closeModal()">取消</button>
            `);
        }
    },

    // 生成成员下拉选项html
    _memberOptions() {
        return this.state.members.map(m => {
            const isSelf = m.relation === 'self';
            const label = isSelf ? m.name + '（我）' : m.name;
            return `<option value="${m.id}" ${m.id === this.state.currentMemberId ? 'selected' : ''}>${label}</option>`;
        }).join('');
    },

    async saveOcrRecord() {
        const elderId = document.getElementById('ocr-record-elder')?.value || this.state.currentMemberId;
        try {
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
                metrics: App._ocrMetrics || [],
                confidence: 0.85,
            });
            this.closeModal();
            this.toast('保存成功');
            if (this.state.currentPage === 'records' || this.state.currentPage === 'home') this.switchPage(this.state.currentPage);
        } catch (err) { this.toast(err.message); }
    },

    async saveOcrMeds() {
        if (this._ocrMedsSaving) return;
        this._ocrMedsSaving = true;
        try {
            const medCount = App._ocrMeds ? App._ocrMeds.length : 0;
            for (let i = 0; i < medCount; i++) {
                const name = document.getElementById(`ocr-med-name-${i}`);
                if (!name || !name.value.trim()) continue;
                const dose = document.getElementById(`ocr-med-dose-${i}`);
                const freq = document.getElementById(`ocr-med-freq-${i}`);
                const start = document.getElementById(`ocr-med-start-${i}`);
                const note = document.getElementById(`ocr-med-note-${i}`);
                await Api.medications.add({
                    elderId: document.getElementById('ocr-med-elder')?.value || this.state.currentMemberId,
                    name: name.value, dose: dose?.value || '', frequency: freq?.value || '',
                    times: App._ocrMeds[i].times || ['08:00'],
                    note: note?.value || App._ocrMeds[i].note || '',
                    startDate: start?.value || new Date().toISOString().slice(0, 10),
                    status: 'active'
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
            await Api.drugs.add({
                elderId: this.state.currentMemberId,
                name: document.getElementById('ocr-drug-name').value,
                specification: document.getElementById('ocr-drug-spec').value,
                manufacturer: document.getElementById('ocr-drug-manufacturer')?.value || '',
                quantity: parseInt(document.getElementById('ocr-drug-qty').value) || 1,
                expiryDate: document.getElementById('ocr-drug-exp').value,
                note: document.getElementById('ocr-drug-note')?.value || '',
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

    viewDrugInfo(name, spec, manufacturer) {
        this.state.currentDrugName = name;
        this.state.currentDrugSpec = spec || '';
        this.state.currentDrugManufacturer = manufacturer || '';
        this.switchPage('drugInfo');
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
        if (!name) { this.toast('请输入药品名称'); return; }
        try {
            const timesStr = document.getElementById('medTimes').value.trim();
            const times = timesStr ? timesStr.split(',').map(t => t.trim()) : ['08:00'];
            await Api.medications.add({
                elderId, name,
                dose: document.getElementById('medDose').value,
                frequency: document.getElementById('medFreq').value,
                times,
                startDate: document.getElementById('medStart').value || new Date().toISOString().slice(0, 10),
                note: document.getElementById('medNote').value,
                status: 'active',
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

        if (isPrescription) {
            const medName = document.getElementById('recordMedName').value.trim();
            if (!medName) { this.toast('请输入药品名称'); return; }
            try {
                await Api.medications.add({
                    elderId,
                    name: medName,
                    dose: document.getElementById('recordMedDose').value,
                    frequency: document.getElementById('recordMedFreq').value,
                    startDate: document.getElementById('recordDate3').value || new Date().toISOString().slice(0, 10),
                    note: document.getElementById('recordMedNote').value,
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
                    chiefComplaint: document.getElementById('recordComplaint').value,
                });
                this.toast('添加成功');
                this.goBack();
            } catch (err) { this.toast(err.message); }
        }
    },

    async saveDrug() {
        const name = document.getElementById('drugName').value.trim();
        if (!name) { this.toast('请输入药品名称'); return; }
        try {
            await Api.drugs.add({
                elderId: this.state.currentMemberId,
                name,
                specification: document.getElementById('drugSpec').value,
                manufacturer: document.getElementById('drugManufacturer').value,
                quantity: parseInt(document.getElementById('drugQty').value) || 1,
                expiryDate: document.getElementById('drugExp').value,
                note: document.getElementById('drugNote').value,
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
