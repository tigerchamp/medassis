# 家庭健康助手

面向家庭的移动端健康管理 Web 应用：**原生前端 SPA + Node/Express 后端 + MySQL + MinIO + 百度 OCR**。

## 📁 目录结构

```
/
├── index.html          前端入口（移动端 SPA）
├── netlify.toml        Netlify 部署配置
├── css/style.css       样式
├── js/
│   ├── app.js          应用主控制器（路由、状态、模态、表单草稿）
│   ├── pages.js        所有页面组件（render + afterRender）
│   ├── api.js          API 服务层（封装 fetch，自动带 JWT）
│   └── storage.js      本地存储兼容层（早期无后端模式遗留）
├── backend/
│   ├── src/
│   │   ├── index.js          Express 入口
│   │   ├── config/           数据库（MySQL 连接池 + 建表/迁移）
│   │   ├── controllers/      业务逻辑
│   │   ├── routes/           路由
│   │   ├── services/         MinIO / OCR / 药品说明书
│   │   ├── utils/            家庭组权限、实体文件、药品库、拼音
│   │   └── mock/             Mock 模式内存数据库
│   ├── test/                 回归测试（node --test）
│   ├── init.sql
│   └── .env                  （不入库，参考 .env.example）
├── MODULES.md          模块功能说明：设计意图 + 易踩坑（改动前必读）
├── TECHNICAL.md        技术文档：结构 / 接口 / 表结构
├── TESTCASES.md        测试用例 + 「改动 → 应跑用例」映射
├── SRS-家庭健康助手.md  原始需求
└── TODO.md             待办
```

## 🚀 启动

### 后端

```bash
cd backend
npm install
cp .env.example .env      # 填 DB_* / JWT / MinIO / 百度 OCR 密钥
npm run dev               # 开发模式（热重载），默认 :3000
```

可选参数：

```bash
node src/index.js --init      # 首次初始化数据库
node src/index.js --mock      # Mock 模式（内存数据库，无需 MySQL）
node src/index.js --rebuild   # 重建数据库（清空数据）
```

### 前端

前端通过 `js/api.js` 里的 `API_BASE` 访问后端。用静态服务器打开即可：

```bash
npx http-server -p 8080       # 然后访问 http://localhost:8080
```

## 🗄 数据库

MySQL 不在本机，在远程 `82.157.202.113`，需先开 SSH 隧道：

```bash
ssh -L 3306:127.0.0.1:3306 ubuntu@82.157.202.113 -N
```

## 🧪 测试

```bash
cd backend
npm test
```

- 用 Node 内置 `node:test`，**零依赖、离线可跑**
- 集成用例需要 MySQL；连不上时**自动 skip**，不会误报失败
- 改动后按 `TESTCASES.md` 的「改动 → 应跑用例映射表」跑相关模块

## 📱 功能

| 模块 | 说明 |
|------|------|
| 成员与家庭组 | 多成员、多家庭组切换、成员间编辑授权 |
| 病历 / 检查报告 / 处方 | 记录 CRUD、关联病历、附件 |
| 拍照 / 粘贴 OCR | 自动判定类型（病历/报告/处方/药品）并解析字段 |
| 用药计划 | 剂量 + 频次 + 服药时间、服药日志、结束/删除、历史归档 |
| 药箱 | 库存按药聚合 + 按服药人拆分、余量消耗、过期预警 |
| 长期用药 | 勾选后驱动首页开药倒计时，并自动联动用药计划 |
| 药品库 | 12.9 万条参考数据，按 名称+规格+容量+厂商 综合匹配 |
| 留言反馈 | Bug / 建议、点赞、评论 |

## ⚠️ 改动须知

**改任何模块前，先读 `MODULES.md` 对应章节**——里面记的是"当初为什么这么设计"
和"改这里会炸什么"。改完同步更新该文档，并跑 `TESTCASES.md` 里对应的用例。

自动化测不到的前端行为（拍照单张限制、下拉刷新手势、表单草稿回填）
需要手工验证，见 `TESTCASES.md` 的 M7 部分。
