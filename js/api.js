// ========== API 服务层 ==========
const API_BASE = window.API_BASE || '';
const TOKEN_KEY = 'fh_token';
const USER_KEY = 'fh_user';

async function api(endpoint, options = {}) {
    const url = `${API_BASE}/api${endpoint}`;
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    // 登录和注册接口不携带token，避免旧token导致401
    const isAuthEndpoint = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register');
    if (token && !isAuthEndpoint) headers['Authorization'] = `Bearer ${token}`;
    // 注入当前家庭组ID（用于多家庭切换）
    const currentFamilyId = window.__currentFamilyId;
    if (currentFamilyId && !isAuthEndpoint) headers['family-id'] = currentFamilyId;
    try {
        const res = await fetch(url, { ...options, headers });
        const data = await res.json();
        if (!res.ok) {
            if (res.status === 401 && !isAuthEndpoint) { App.logout(); throw new Error('登录已过期'); }
            throw new Error(data.error || '请求失败');
        }
        return data;
    } catch (err) {
        console.error(`API ${options.method || 'GET'} ${endpoint}:`, err);
        throw err;
    }
}

const Api = {
    auth: {
        register: (name, phone, password) => api('/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, password }) }),
        login: (phone, password) => api('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
        profile: () => api('/auth/profile'),
        updateProfile: (data) => api('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
        familyMembers: () => api('/auth/family-members'),
        families: () => api('/auth/families'),
        joinFamily: (inviteCode) => api('/auth/join-family', { method: 'POST', body: JSON.stringify({ inviteCode }) }),
        updateFamily: (name) => api('/auth/family', { method: 'PUT', body: JSON.stringify({ name }) }),
        toggleAuthorize: (userId) => api(`/auth/authorize/${userId}`, { method: 'PUT' }),
        switchFamily: (familyId) => api('/auth/profile', { headers: { 'family-id': familyId } }),
    },
    elders: {
        getAll: () => api('/elders'),
        get: (id) => api(`/elders/${id}`),
        add: (d) => api('/elders', { method: 'POST', body: JSON.stringify(d) }),
        update: (id, d) => api(`/elders/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
        delete: (id) => api(`/elders/${id}`, { method: 'DELETE' }),
    },
    records: {
        getAll: (elderId) => api(elderId ? `/records?elderId=${elderId}` : '/records'),
        get: (id) => api(`/records/${id}`),
        add: (d) => api('/records', { method: 'POST', body: JSON.stringify(d) }),
        update: (id, d) => api(`/records/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
        delete: (id) => api(`/records/${id}`, { method: 'DELETE' }),
        addNote: (id, text, author) => api(`/records/${id}/notes`, { method: 'POST', body: JSON.stringify({ text, author }) }),
    },
    medications: {
        getAll: (elderId, active) => {
            let q = '/medications'; const p = [];
            if (elderId) p.push(`elderId=${elderId}`);
            if (active) p.push('active=true');
            if (p.length) q += '?' + p.join('&');
            return api(q);
        },
        get: (id) => api(`/medications/${id}`),
        add: (d) => api('/medications', { method: 'POST', body: JSON.stringify(d) }),
        update: (id, d) => api(`/medications/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
        delete: (id) => api(`/medications/${id}`, { method: 'DELETE' }),
        log: (medId, scheduledTime, missed) => api('/medications/logs', { method: 'POST', body: JSON.stringify({ medId, scheduledTime, missed }) }),
        getLogs: (medId) => api(medId ? `/medications/logs?medId=${medId}` : '/medications/logs'),
    },
    drugs: {
        getAll: (status) => api(status ? `/drugs?status=${status}` : '/drugs'),
        get: (id) => api(`/drugs/${id}`),
        getRecords: (id) => api(`/drugs/${id}/records`),
        add: (d) => api('/drugs', { method: 'POST', body: JSON.stringify(d) }),
        update: (id, d) => api(`/drugs/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
        delete: (id) => api(`/drugs/${id}`, { method: 'DELETE' }),
        updateInventoryItem: (id, data) => api(`/drugs/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        autoConsume: () => api('/drugs/auto-consume', { method: 'POST' }),
        getChronic: () => api('/drugs/chronic/list'),
        saveChronic: (drugInventoryIds, elderId) => api('/drugs/chronic/save', { method: 'POST', body: JSON.stringify({ drugInventoryIds, elderId }) }),
    },
    drugLibrary: {
        search: (q, limit = 20) => api(`/drug-library/search?q=${encodeURIComponent(q)}&limit=${limit}`),
        get: (code) => api(`/drug-library/${encodeURIComponent(code)}`),
        fetchInfo: (params) => api(`/drug-library/fetch-info?${new URLSearchParams(params).toString()}`),
        check: (name) => api(`/drug-library/check?name=${encodeURIComponent(name)}`),
        match: (name) => api(`/drug-library/match?name=${encodeURIComponent(name)}`),
        add: (d) => api('/drug-library/add', { method: 'POST', body: JSON.stringify(d) }),
    },
    hospitals: {
        search: (q, limit = 20) => api(`/hospitals/search?q=${encodeURIComponent(q)}&limit=${limit}`),
        check: (name) => api(`/hospitals/check?name=${encodeURIComponent(name)}`),
        match: (name) => api(`/hospitals/match?name=${encodeURIComponent(name)}`),
        add: (name, abbreviation, alias, phone, address) => api('/hospitals/add', { method: 'POST', body: JSON.stringify({ name, abbreviation, alias, phone, address }) }),
    },
    departments: {
        search: (q, limit = 20) => api(`/departments/search?q=${encodeURIComponent(q)}&limit=${limit}`),
        check: (name) => api(`/departments/check?name=${encodeURIComponent(name)}`),
        add: (name, abbreviation, alias, category) => api('/departments/add', { method: 'POST', body: JSON.stringify({ name, abbreviation, alias, category }) }),
    },
    feedback: {
        save: (data) => api('/feedback/save', { method: 'POST', body: JSON.stringify(data) }),
        list: () => api('/feedback/list'),
        search: (q) => api(`/feedback/search?q=${encodeURIComponent(q)}`),
        detail: (id) => api(`/feedback/${encodeURIComponent(id)}`),
        like: (id) => api(`/feedback/${encodeURIComponent(id)}/like`, { method: 'POST' }),
        comment: (id, content) => api(`/feedback/${encodeURIComponent(id)}/comment`, { method: 'POST', body: JSON.stringify({ content }) }),
    },
    search: (keyword) => api(`/search?keyword=${encodeURIComponent(keyword)}`),
    upload: async (files) => {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        const token = localStorage.getItem(TOKEN_KEY);
        const res = await fetch(`${API_BASE}/api/upload/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        return data;
    },
    ocr: {
        // type: record | report | prescription | drug
        recognize: async (files, type) => {
            const formData = new FormData();
            files.forEach(f => formData.append('files', f));
            formData.append('type', type);
            const token = localStorage.getItem(TOKEN_KEY);
            console.log(`[API] POST /api/ocr/recognize, type=${type}, files=${files.length}`);
            const res = await fetch(`${API_BASE}/api/ocr/recognize`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            console.log(`[API] OCR响应状态: ${res.status} ${res.statusText}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'OCR识别失败');
            return data;
        },
        // 纯文本解析（不调百度OCR），供粘贴文本自动识别使用
        parse: async (type, text) => {
            const token = localStorage.getItem(TOKEN_KEY);
            const res = await fetch(`${API_BASE}/api/ocr/parse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ type, text }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '文本解析失败');
            return data;
        },
    },
};
