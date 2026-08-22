# 家庭健康助手 - 技术文档

## 一、项目概述

家庭健康助手是一个面向家庭的轻量级健康管理 Web 应用，支持：
- 家庭成员管理（多成员/多家庭组切换）
- 病历/检查报告/处方记录管理
- 用药计划与开药倒计时
- 药箱管理（药品分类库存、按服药人拆分库存）
- 药品说明书查询
- 留言反馈/Bug 报告
- 拍照 OCR 识别（病历/药品）

技术栈：**原生 HTML/CSS/JavaScript** + **Node.js/Express** + **MySQL** + **MinIO**

---

## 二、目录结构

```
medassis/
├── index.html              # 前端入口 HTML（单页应用容器）
├── css/
│   └── style.css           # 全局样式
├── js/
│   ├── app.js              # 应用主控制器（路由、状态、工具方法）
│   ├── pages.js            # 所有页面组件（render + afterRender）
│   ├── api.js              # API 服务层（封装 fetch 调用）
│   └── storage.js          # 本地存储层（localStorage 兼容层）
├── backend/
│   ├── src/
│   │   ├── index.js        # Express 服务入口，路由注册
│   │   ├── config/
│   │   │   └── database.js # MySQL 连接池 + 数据库初始化
│   │   ├── controllers/   # 业务逻辑层
│   │   │   ├── authController.js          # 登录/注册/家庭组管理
│   │   │   ├── elderController.js         # 家庭成员 CRUD
│   │   │   ├── recordController.js        # 病历/检查/处方 CRUD
│   │   │   ├── medicationController.js    # 用药计划 CRUD + 服药日志
│   │   │   ├── drugController.js          # 药箱库存 + 长期用药 + 药品 CRUD
│   │   │   ├── drugLibraryController.js   # 药品库查询/匹配/录入
│   │   │   ├── hospitalController.js      # 医院库管理
│   │   │   ├── departmentController.js    # 科室库管理
│   │   │   ├── feedbackController.js      # 留言反馈 CRUD + 点赞/评论
│   │   │   ├── searchController.js        # 全局搜索 + 首页统计
│   │   └── ...
│   │   ├── middleware/
│   │   │   └── auth.js     # JWT 鉴权 + 家庭组权限过滤
│   │   ├── routes/        # 路由定义（对应 API 前缀）
│   │   │   ├── auth.js           # /api/auth/*
│   │   │   ├── elders.js         # /api/elders/*
│   │   │   ├── records.js        # /api/records/*
│   │   │   ├── medications.js    # /api/medications/*
│   │   │   ├── drugs.js          # /api/drugs/*
│   │   │   ├── drugLibrary.js    # /api/drug-library/*
│   │   │   ├── feedback.js       # /api/feedback/*
│   │   │   └── ...
│   │   ├── services/       # 第三方服务封装
│   │   │   ├── minio.js    # MinIO 文件存储
│   │   │   ├── ocr.js      # OCR 识别服务
│   │   │   └── drugInfo.js # 药品说明书查询
│   │   ├── utils/          # 工具函数
│   │   │   ├── familyAccess.js  # 家庭组数据权限过滤 SQL
│   │   │   ├── entityFiles.js  # 实体关联文件管理
│   │   │   ├── drugLibrary.js  # 药品库辅助
│   │   │   └── pinyin.js       # 拼音首字母
│   │   └── mock/
│   │       └── fakePool.js  # Mock 模式内存数据库
│   ├── init.sql            # 数据库建表脚本
│   └── package.json
└── Dockerfile / docker-compose.yml
```

---

## 三、核心文件说明

### 3.1 前端核心文件

| 文件 | 用途 |
|------|------|
| `index.html` | SPA 入口，包含顶栏（家庭选择 + 留言按钮 + 用户名）、主内容区 `#mainContent`、底部导航栏（首页/病历/扫描/药箱/我的）、模态框容器 |
| `js/app.js` | 应用主控制器。管理全局状态 `state`（当前页、当前成员、成员列表、用户、家庭组）、路由切换 `switchPage()`、页面映射、通用工具方法（Toast、模态框、图片上传、药品搜索等） |
| `js/pages.js` | 所有页面组件。每个页面是一个对象，实现 `render()` 返回 HTML 模板、`afterRender()` 执行异步数据加载。包含 22 个页面 |
| `js/api.js` | API 服务层。封装 `fetch` 调用，自动附加 JWT Token 和家庭组 ID 请求头。按业务模块分组（auth/elders/records/medications/drugs/feedback 等） |
| `js/storage.js` | 本地存储兼容层。在无后端模式下使用 localStorage 模拟数据持久化，在在线模式下作为 API 的降级备选 |

### 3.2 后端核心文件

| 文件 | 用途 |
|------|------|
| `backend/src/index.js` | Express 服务入口。注册路由中间件、静态文件服务、错误处理、启动检查（数据库/MinIO） |
| `backend/src/config/database.js` | MySQL 连接池管理。支持 Mock 模式（`--mock` 参数）自动切换到内存数据库 |
| `backend/src/middleware/auth.js` | JWT 鉴权中间件。解析 Token、设置 `req.user` 和 `req.familyId`、支持请求头切换家庭组 |
| `backend/src/utils/familyAccess.js` | 家庭组数据权限工具。生成 SQL 过滤片段，确保多家庭组场景下的数据隔离 |
| `backend/src/utils/entityFiles.js` | 实体-文件关联工具。管理数据库记录与 MinIO 文件的关联 |
| `backend/src/controllers/drugController.js` | 药箱业务核心：药品 CRUD、按人聚合库存、长期用药设置、开药提醒计算 |

---

## 四、前端架构

### 4.1 单页应用路由

```
底部导航栏 → 点击事件 → App.switchPage(pageName)
  ↓
switchPage() 流程：
  1. 检查登录状态 + 权限
  2. 将当前页压入 pageHistory 栈（支持返回）
  3. 更新底部导航高亮
  4. 调用 renderPage(pageName) 获取 HTML 模板
  5. 注入 #mainContent
  6. 调用 _getPageObj(pageName).afterRender() 加载数据
```

### 4.2 页面对象规范

```javascript
const PageXxx = {
    render() {
        // 返回页面的 HTML 骨架（静态部分）
        return `<div class="card">...</div>`;
    },
    
    async afterRender() {
        // 异步加载数据并填充动态内容
        const data = await Api.xxx.getAll();
        const el = document.getElementById('xxxList');
        el.innerHTML = renderList(data);
    }
};
```

### 4.3 全局状态

```javascript
App.state = {
    currentPage: 'home',      // 当前页面名
    currentMemberId: null,    // 当前选中的成员（elder）
    members: [],              // 所有成员列表
    user: null,               // 登录用户信息
    family: null,             // 当前家庭组
    families: [],             // 所有家庭组列表
    pageHistory: [],          // 页面导航历史（栈）
};
```

### 4.4 页面清单

| 页面名 | 组件 | 入口方式 |
|--------|------|----------|
| 登录 | `PageLogin` | `App.init()` 自动跳转 |
| 首页 | `PageHome` | 底部导航/`switchPage('home')` |
| 病历列表 | `PageRecords` | 底部导航/`switchPage('records')` |
| 病历详情 | `PageRecordDetail` | 列表点击 |
| 添加病历 | `PageAddRecord` | 病历页右上角按钮 |
| 药箱 | `PagePharmacy` | 底部导航/`switchPage('pharmacy')` |
| 添加药品 | `PageAddDrug` | 药箱页右上角按钮 |
| 药品详情 | `PageDrugDetail` | 药箱列表点击 |
| 药品说明书 | `PageDrugInfo` | 药品详情页点击药品名 |
| 用药计划列表 | `PageAddMed` | 首页用药安排区/病历页内跳转 |
| 用药编辑 | `PageMedEdit` | 用药计划页内编辑 |
| 用药历史 | `PageMedHistory` | 用药计划页内历史按钮 |
| 我的资料 | `PageProfile` | 底部导航/`switchPage('profile')` |
| 资料编辑 | `PageProfileEdit` | 我的页编辑按钮 |
| 成员详情 | `PageElderDetail` | 家庭成员列表点击 |
| 长期用药设置 | `PageChronicMeds` | 我的页/首页"去设置"链接 |
| 家庭组管理 | `PageFamily` | 顶栏家庭下拉菜单 |
| 加入家庭 | `PageJoinFamily` | 家庭组管理页 |
| 留言填写 | `PageFeedback` | 顶栏留言按钮 |
| 留言列表 | `PageFeedbackList` | 留言填写页顶部链接 |
| 留言详情 | `PageFeedbackDetail` | 留言列表点击 |
| 消息中心 | `PageMessages` | 我的页入口（预留） |

---

## 五、后端架构

### 5.1 API 路由注册

在 `backend/src/index.js` 中统一注册：

```javascript
app.use('/api/auth',       authRoutes);        // 登录/注册/家庭组
app.use('/api/elders',     elderRoutes);        // 成员 CRUD
app.use('/api/records',    recordRoutes);       // 病历/检查/处方 CRUD
app.use('/api/medications', medicationRoutes);  // 用药计划 CRUD
app.use('/api/drugs',      drugRoutes);         // 药箱/长期用药
app.use('/api/drug-library', drugLibraryRoutes); // 药品库查询
app.use('/api/feedback',   feedbackRoutes);     // 留言反馈
app.use('/api/upload',     uploadRoutes);       // 文件上传
app.use('/api/ocr',        ocrRoutes);          // OCR 识别
app.use('/api/search',     searchRoutes);       // 全局搜索
app.use('/api/hospitals',  hospitalRoutes);     // 医院库
app.use('/api/departments', departmentRoutes);  // 科室库
```

### 5.2 请求处理链路

```
HTTP Request
  ↓
CORS 中间件（允许前端跨域）
  ↓
JSON Body Parser（50MB 限制）
  ↓
鉴权中间件 authMiddleware
  ├─ 解析 JWT Token
  ├─ 设置 req.user
  ├─ 从请求头读取 family-id 切换家庭组
  └─ 设置 req.familyId
  ↓
Router 匹配具体路由
  ↓
Controller 业务逻辑
  ├─ familyAccessFilter() 生成权限过滤 SQL
  ├─ getPool().query() 执行 SQL
  └─ 返回 JSON 响应
  ↓
全局错误处理中间件
```

### 5.3 家庭组数据隔离

所有涉及多家庭组的查询都通过 `familyAccessFilter(familyId, prefix)` 生成 WHERE 条件：

```sql
WHERE prefix.family_id = ? 
   OR prefix.elder_id IN (
     SELECT id FROM elders 
     WHERE relation = 'self' 
     AND user_id IN (
       SELECT user_id FROM user_families WHERE family_id = ?
       UNION
       SELECT id FROM users WHERE family_id = ?
     )
   )
```

这确保了跨家庭组的"self"档案数据也能正确关联。

---

## 六、页面访问链路详解

### 6.1 首页（PageHome）

```
用户打开 App
  → App.init()
    → 检查 Token
    → App.loadData()
      → Api.elders.getAll()     # GET /api/elders
      → Api.auth.profile()      # GET /api/auth/profile
    → App.switchPage('home')
      → PageHome.render()       # 渲染骨架
      → PageHome.afterRender(memberId)
        → Api.medications.getAll(memberId, true)  # GET /api/medications?elderId=xxx&active=true
        → Api.drugs.getChronic()                  # GET /api/drugs/chronic/list
        → Api.drugs.getAll()                      # GET /api/drugs
        → Api.records.getAll(memberId)            # GET /api/records?elderId=xxx
        → 并行渲染：
           - 最新用药安排（按时间段分组显示）
           - 开药倒计时（基于长期用药或用药计划计算）
           - 最近病历/检查报告
```

### 6.2 药箱页面（PagePharmacy）

```
底部导航点击"药箱"
  → App.switchPage('pharmacy')
    → PagePharmacy.render()     # 渲染骨架（分类导航栏 + 药品列表容器）
    → PagePharmacy.afterRender() → PagePharmacy.loadContent()
      → Api.drugs.getAll()      # GET /api/drugs
        后端 getDrugs() 处理：
          - 查询 drug_inventory 全表 + LEFT JOIN drugs/elders
          - 按 family+name(或drug_code) JS 层聚合
          - 每行返回：quantity=总数量, byElder=[{elderId,elderName,quantity}]
      - 生成分类列表（从药品的 category/type1 字段提取）
      - 渲染分类导航标签（全部/感冒药/肠胃药/...）
      - 默认显示"全部"，展示所有药品卡片
      - 点击分类标签 → PagePharmacy._selectCat(cat) → 重新筛选渲染
    → 药品卡片渲染 _renderDrugCard(d)：
        - 显示图标（按剂型匹配：口服液→瓶子、丸剂→药丸、片剂→药片）
        - 显示药品名 + 规格 + 数量（含按人拆分显示）
        - 显示过期状态
        - 点击卡片 → App.viewDrugDetail(d._anchorId) → 跳转药品详情页
        - 点击删除图标 → App.deleteDrug(d.id) → 弹窗确认 → Api.drugs.delete()
```

### 6.3 药品详情页（PageDrugDetail）

```
药箱列表点击药品卡片
  → App.viewDrugDetail(id)
    → App.state.currentDrugId = id
    → App.switchPage('drugDetail')
      → PageDrugDetail.render()  # 渲染骨架（加载中占位）
      → PageDrugDetail.afterRender()
        → Api.drugs.getRecords(id)   # GET /api/drugs/:id/records
          后端 getDrugRecords(id) 处理：
            - 找到 anchor 行确定 drug_code 或 name
            - 查询同 family 下所有同名/同编码的 drug_inventory 行
            - 聚合返回：
                drug: { ...主药品信息, byElder: [...], quantity: 总数 }
                inventoryLogs: [{elderName, quantity, expiryDate, createdAt, recordNo}, ...]
        - 渲染：
            - 顶部药品信息（名称/规格/厂商/状态图标）
            - 库存显示（多人时：共 2盒（唐 1盒 · Jack 1盒）；单人时：2盒）
            - 图片预览
            - "添加记录"表格（表头：服药人/数量/有效期/入库日期/关联处方）
```

### 6.4 添加药品页（PageAddDrug）

```
药箱页右上角"+"按钮
  → App.switchPage('addDrug')
    → PageAddDrug.render()
        - 服药人下拉（成员列表）
        - 药品名称输入（带搜索联想）
        - 规格/单位容量/厂商/数量/有效期/备注/图片
    → PageAddDrug.afterRender()
        → ImageUploader.init('drugImages')
    → 用户填写后点击"保存"
      → App.saveDrug()
        → Api.drugs.add({ elderId, name, drugCode, ... })  # POST /api/drugs
          后端 addDrug() 处理：
            - 校验必填项
            - 解析 drug_code（从药品库匹配或新建）
            - 查重：drug_code + expiry_date + elder_id 三维
            - 匹配则合并数量，不匹配则新建行
            - 保存关联图片
        → toast("添加成功") → goBack()
```

### 6.5 病历列表页（PageRecords）

```
底部导航点击"病历"
  → App.switchPage('records')
    → PageRecords.render()    # 渲染骨架
    → PageRecords.afterRender() → PageRecords.loadContent(memberId)
      → Api.records.getAll(memberId)  # GET /api/records?elderId=xxx
        后端 getRecords() 处理：
          - familyAccessFilter 权限过滤
          - 支持按 type 过滤（病历/检查报告/处方）
      - 渲染病历卡片列表（医院/科室/诊断/日期/备注）
      - 点击卡片 → App.viewRecord(id) → 病历详情页
```

### 6.6 添加病历页（PageAddRecord）

```
病历页右上角"+"按钮
  → App.switchPage('addRecord')
    → PageAddRecord.render()
        - 粘贴识别框（粘贴文字自动识别字段）
        - 关联成员下拉
        - 关联病历选择
        - 类型下拉（病历/检查报告/处方）
        - 就诊日期/医院/科室/诊断/主诉/医嘱
        - 指标表格（名称/数值/单位/参考范围/异常标记）
        - 关联用药区块（动态添加药品行）
        - 图片上传
    → PageAddRecord.afterRender()
        → ImageUploader.init、CalendarPicker 绑定、药品搜索联想绑定
    → 保存 → App.saveRecord()
      → Api.records.add(payload)  # POST /api/records
      → 同步创建 medications（关联用药）
```

### 6.7 用药计划页（PageAddMed）

```
首页用药安排区"编辑"按钮 / 病历页内用药区块
  → App.switchPage('addMed')
    → PageAddMed.render()
        - 成员下拉
        - 药品输入（搜索联想）
        - 剂量/频次/时间段/起止日期
        - 来源处方关联
    → PageAddMed.afterRender() → CalendarPicker 绑定
    → 保存 → App.saveMedication()
      → Api.medications.add(payload)  # POST /api/medications
      → 同步更新药箱库存（自动扣减或增加）
```

### 6.8 留言反馈页（PageFeedback）

```
顶栏留言图标（💬）
  → App.openFeedback()
    → App.state._feedbackFromPage = 当前页面名
    → App.switchPage('feedback')
      → PageFeedback.render()
          - 顶部链接"查看已有留言列表"
          - 当前页面（自动填充，只读）
          - 留言标题（输入时实时匹配已有留言）
          - 留言内容
          - 标题匹配结果展示（如有类似留言显示在下方）
      → PageFeedback.afterRender() → 初始化表单
      → 保存 → Api.feedback.save(data)  # POST /api/feedback/save
          payload: { page_key, page_name, title, content }
          后端：写入 feedback 表（含 user_id, user_name）
```

### 6.9 留言列表页（PageFeedbackList）

```
留言填写页顶部"查看已有留言列表"链接
  → App.switchPage('feedbackList')
    → PageFeedbackList.render()
    → PageFeedbackList.afterRender()
      → Api.feedback.list()  # GET /api/feedback/list
        后端：返回所有留言（含点赞数/评论数）
      - 渲染留言标题列表（简洁模式）
      - 点击标题 → App.viewFeedbackDetail(id) → 留言详情页
```

### 6.10 我的资料页（PageProfile）

```
底部导航"我的"
  → App.switchPage('profile')
    → PageProfile.render()
        - 个人信息（头像/姓名/性别/年龄/血型/过敏/病史）
        - 操作区：编辑资料、长期用药设置、家庭成员管理
    → PageProfile.afterRender() → 加载资料
    → 点击"长期用药设置" → switchPage('chronicMeds')
```

### 6.11 长期用药设置页（PageChronicMeds）

```
我的页 → "长期用药设置" / 首页"去设置"链接
  → App.switchPage('chronicMeds')
    → PageChronicMeds.render()
        - 药品列表（从药箱获取，支持搜索+全选/单选）
    → PageChronicMeds.afterRender()
      → Api.drugs.getAll()          # 获取药箱药品列表
      → Api.drugs.getChronic()      # 获取已设置的长期用药
      → 渲染药品列表（复选框模式）
    → 保存 → Api.drugs.saveChronic(ids, elderId)
          # POST /api/drugs/chronic/save
          后端：全量覆盖写入 chronic_medications 表
          - 删除旧记录，批量插入新记录
          - 关联 elder_id（当前成员）
```

---

## 七、数据库表结构（核心表）

### 7.1 users - 用户表
| 字段 | 说明 |
|------|------|
| id | 主键 UUID |
| phone | 手机号（登录） |
| name | 姓名 |
| password | 密码（Hash） |
| family_id | 默认家庭组 |

### 7.2 families - 家庭组表
| 字段 | 说明 |
|------|------|
| id | 主键 UUID |
| name | 家庭组名称 |
| invite_code | 邀请码 |
| owner_user_id | 创建者 |

### 7.3 user_families - 用户-家庭组关联
| 字段 | 说明 |
|------|------|
| user_id | 成员 ID |
| family_id | 家庭组 ID |

### 7.4 elders - 成员档案表
| 字段 | 说明 |
|------|------|
| id | 主键 UUID |
| family_id | 所属家庭 |
| user_id | 关联用户（self 档案） |
| name | 姓名 |
| gender | 性别 |
| birth_date | 出生日期 |
| relation | 关系（self/父亲/母亲/...） |
| blood_type | 血型 |
| allergies | 过敏史 |
| conditions | 病史 |

### 7.5 records - 病历/检查/处方表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| family_id | 所属家庭 |
| elder_id | 关联成员 |
| type | 类型（病历/检查报告/处方） |
| visit_date | 就诊日期 |
| hospital | 医院 |
| department | 科室 |
| diagnosis | 诊断 |
| chief_complaint | 主诉 |
| notes | 备注（JSON 数组） |

### 7.6 medications - 用药计划表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| family_id | 所属家庭 |
| elder_id | 关联成员 |
| name | 药品名称 |
| drug_code | 药品编码（关联 drugs 表） |
| dose | 用量文本 |
| times | 服药时间数组（JSON） |
| frequency | 频次 |
| start_date / end_date | 起止日期 |
| source_prescription_id | 来源处方 |
| status | active/ended |

### 7.7 drug_inventory - 药箱库存表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| family_id | 所属家庭 |
| elder_id | 服药人（关键：按人区分库存） |
| drug_code | 药品编码 |
| name | 药品名称 |
| specification | 规格 |
| manufacturer | 厂商 |
| quantity / quantity_unit | 数量+单位 |
| expiry_date | 有效期 |
| status | valid/expiring_soon/expired |
| source_prescription_id | 来源处方 |

### 7.8 chronic_medications - 长期用药设置表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| user_id | 操作员 |
| family_id | 所属家庭 |
| elder_id | 针对成员 |
| drug_inventory_id | 关联药箱记录 |
| drug_code / drug_name | 药品信息（冗余） |

### 7.9 drugs - 药品库（参考数据表）
| 字段 | 说明 |
|------|------|
| code | 药品编码（主键） |
| name | 药品名称 |
| spec_dosage / spec_dosage_unit | 规格 |
| unit_capacity / unit_capacity_unit | 单位容量 |
| manufacturer | 厂商 |
| category | 药理学分类 |
| type1 | 用户友好分类 |

### 7.10 feedback - 留言反馈表
| 字段 | 说明 |
|------|------|
| id | 主键 |
| user_id / user_name | 留言人（冗余姓名） |
| page_key / page_name | 所在页面 |
| title / content | 标题/内容 |

### 7.11 feedback_likes - 留言点赞表
| 字段 | 说明 |
|------|------|
| feedback_id | 留言 ID |
| user_id | 点赞人 |
| UNIQUE KEY | (feedback_id, user_id) |

### 7.12 feedback_comments - 留言评论表
| 字段 | 说明 |
|------|------|
| feedback_id | 留言 ID |
| user_id / user_name | 评论人 |
| content | 评论内容 |

---

## 八、开发速查

### 8.1 启动后端

```bash
cd backend
npm install
npm run dev          # 开发模式（带热重载）
node src/index.js --init     # 首次初始化数据库
node src/index.js --mock     # Mock 模式（无需 MySQL）
node src/index.js --rebuild  # 重建数据库（清空数据）
```

### 8.2 添加新页面

1. 在 `js/pages.js` 中创建 `PageXxx` 对象：
   ```javascript
   const PageXxx = {
       render() { return `<div>...</div>`; },
       async afterRender() { /* 加载数据 */ }
   };
   ```

2. 在 `js/app.js` 的 `_getPageObj()` 和 `renderPage()` 映射中注册：
   ```javascript
   _getPageObj(page) {
       const map = { ..., xxx: PageXxx };
   }
   renderPage(page) {
       const pages = { ..., xxx: () => PageXxx.render() };
   }
   ```

3. 添加底部导航或入口按钮指向 `App.switchPage('xxx')`

### 8.3 添加新 API

1. 在 `backend/src/routes/xxx.js` 中定义路由
2. 在 `backend/src/controllers/xxxController.js` 中实现处理函数
3. 在 `backend/src/index.js` 中注册路由：`app.use('/api/xxx', xxxRoutes)`
4. 在 `js/api.js` 中添加前端调用方法

### 8.4 调试技巧

- **Mock 模式**：`node src/index.js --mock` 启动，使用内存数据库，无需 MySQL
- **SQL 调试**：在 controller 中 `console.log(sql, params)` 查看实际 SQL
- **前端调试**：浏览器 DevTools Network 面板查看 API 请求/响应
- **家庭组切换**：请求头 `family-id` 控制当前查询的家庭组
- **文件上传**：文件 ID 存储在 `drug_inventory.files`/`records.files` JSON 字段中
