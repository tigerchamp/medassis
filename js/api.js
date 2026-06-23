/**
 * 家庭健康助手 - API 服务层
 * 负责与后端API交互
 */
(function (global) {
  'use strict';

  // API 基础配置
  const API_BASE = window.API_BASE || 'http://localhost:3000/api';

  // Token 管理
  const TOKEN_KEY = 'familyHealthToken';
  const USER_KEY = 'familyHealthUser';

  // 获取 token
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  // 设置 token
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  // 获取用户信息
  function getUser() {
    try {
      const user = localStorage.getItem(USER_KEY);
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  }

  // 设置用户信息
  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // 清除认证信息
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // 检查是否已登录
  function isLoggedIn() {
    return !!getToken();
  }

  // 通用请求方法
  async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const token = getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          clearAuth();
          window.dispatchEvent(new Event('auth_required'));
        }
        throw new Error(data.error || '请求失败');
      }

      return data;
    } catch (err) {
      console.error(`API [${options.method || 'GET'}] ${endpoint} error:`, err);
      throw err;
    }
  }

  // ============ Auth API ============
  const Auth = {
    async register(name, phone, password) {
      const data = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, phone, password })
      });
      if (data.token) {
        setToken(data.token);
        setUser(data.user);
      }
      return data;
    },

    async login(phone, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password })
      });
      if (data.token) {
        setToken(data.token);
        setUser(data.user);
      }
      return data;
    },

    async getProfile() {
      return request('/auth/profile');
    },

    async updateProfile(name, phone) {
      return request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name, phone })
      });
    },

    async joinFamily(inviteCode, name) {
      return request('/auth/join-family', {
        method: 'POST',
        body: JSON.stringify({ inviteCode, name })
      });
    },

    async getFamilyMembers() {
      return request('/auth/family-members');
    },

    logout() {
      clearAuth();
    }
  };

  // ============ Elders API ============
  const Elders = {
    async getAll() {
      return request('/elders');
    },

    async getOne(id) {
      return request(`/elders/${id}`);
    },

    async add(elder) {
      return request('/elders', {
        method: 'POST',
        body: JSON.stringify(elder)
      });
    },

    async update(id, elder) {
      return request(`/elders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(elder)
      });
    },

    async delete(id) {
      return request(`/elders/${id}`, {
        method: 'DELETE'
      });
    }
  };

  // ============ Records API ============
  const Records = {
    async getAll(elderId) {
      const url = elderId ? `/records?elderId=${elderId}` : '/records';
      return request(url);
    },

    async getOne(id) {
      return request(`/records/${id}`);
    },

    async add(record) {
      return request('/records', {
        method: 'POST',
        body: JSON.stringify(record)
      });
    },

    async update(id, record) {
      return request(`/records/${id}`, {
        method: 'PUT',
        body: JSON.stringify(record)
      });
    },

    async delete(id) {
      return request(`/records/${id}`, {
        method: 'DELETE'
      });
    },

    async addNote(id, text, author) {
      return request(`/records/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text, author })
      });
    }
  };

  // ============ Medications API ============
  const Medications = {
    async getAll(elderId, active) {
      let url = '/medications';
      const params = [];
      if (elderId) params.push(`elderId=${elderId}`);
      if (active) params.push('active=true');
      if (params.length) url += '?' + params.join('&');
      return request(url);
    },

    async getOne(id) {
      return request(`/medications/${id}`);
    },

    async add(medication) {
      return request('/medications', {
        method: 'POST',
        body: JSON.stringify(medication)
      });
    },

    async update(id, medication) {
      return request(`/medications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(medication)
      });
    },

    async delete(id) {
      return request(`/medications/${id}`, {
        method: 'DELETE'
      });
    },

    async log(medId, scheduledTime, missed) {
      return request('/medications/logs', {
        method: 'POST',
        body: JSON.stringify({ medId, scheduledTime, missed })
      });
    },

    async getLogs(medId) {
      const url = medId ? `/medications/logs?medId=${medId}` : '/medications/logs';
      return request(url);
    }
  };

  // ============ Search API ============
  const Search = {
    async search(keyword) {
      return request(`/search?keyword=${encodeURIComponent(keyword)}`);
    },

    async getStats() {
      return request('/search/stats');
    }
  };

  // ============ Upload API ============
  const Upload = {
    async uploadFiles(files) {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const token = getToken();
      const response = await fetch(`${API_BASE}/upload/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '上传失败');
      }
      return data;
    },

    async deleteFile(key) {
      return request(`/upload/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
    }
  };

  // 导出 API 对象
  const API = {
    Auth,
    Elders,
    Records,
    Medications,
    Search,
    Upload,
    getToken,
    setToken,
    getUser,
    setUser,
    isLoggedIn,
    clearAuth,
    API_BASE
  };

  global.API = API;

})(window);
