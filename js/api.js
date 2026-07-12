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
        joinFamily: (inviteCode) => api('/auth/join-family', { method: 'POST', body: JSON.stringify({ inviteCode }) }),
        updateFamily: (name) => api('/auth/family', { method: 'PUT', body: JSON.stringify({ name }) }),
        toggleAuthorize: (userId) => api(`/auth/authorize/${userId}`, { method: 'PUT' }),
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
        add: (d) => api('/drugs', { method: 'POST', body: JSON.stringify(d) }),
        update: (id, d) => api(`/drugs/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
        delete: (id) => api(`/drugs/${id}`, { method: 'DELETE' }),
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
};
