# 家庭健康助手 - 部署说明

📦 目录结构（已就绪，可直接拖入 Netlify Drop）：

```
/
├── index.html          主页面（移动端 SPA）
├── netlify.toml        Netlify 部署配置（含安全 headers）
├── README.md           本说明文件
├── css/
│   └── style.css       移动端样式（绿色主题）
└── js/
    ├── storage.js      数据持久化（localStorage）
    ├── ocr.js          OCR 识别模块
    └── app.js          主应用逻辑（路由 + 页面）
```

## 🚀 部署方式

### 方式 1：Netlify Drop（最省事，零配置）
1. 把本文件夹在本地电脑上准备好
2. 用浏览器打开：https://app.netlify.com/drop
3. 把本文件夹整个拖进去
4. 几秒后获得一个形如 `https://xxx-xxx.netlify.app` 的网址
5. 用手机浏览器打开该网址即可

### 方式 2：Netlify CLI（适合会用命令行）
```bash
# 1. 安装 Netlify CLI
npm install -g netlify-cli

# 2. 登录（会跳浏览器授权）
netlify login

# 3. 在本目录执行
netlify deploy --prod

# 4. 生成的网址在输出的 "Website Draft URL" / "Unique Deploy URL" 中
```

### 方式 3：GitHub + Netlify 持续部署
1. 把本目录推送到 GitHub 仓库
2. 登录 https://app.netlify.com → "Add new site" → "Import an existing project"
3. 选择仓库，Build command 留空，Publish directory 填 `./`
4. 发布即可，之后每次 push 到 main 都会自动更新

## 📱 访问说明

- 手机/电脑浏览器均可访问
- 首次打开即自动载入示例数据（张爷爷/李奶奶，含病历与用药）
- 数据保存在**您的浏览器**（localStorage），不会上传到任何服务器
- 建议用 Chrome / Safari / 微信自带浏览器访问（iOS Safari 已测试兼容）

## 🔧 功能清单（对照 SRS）

| 模块 | 功能 | 状态 |
|------|------|------|
| 老人档案 | 姓名/年龄/性别/血型/过敏史/基础疾病/联系电话 | ✅ |
| 病历管理 | 就诊日期/医院/科室/诊断/主诉/检查指标/医嘱 | ✅ |
| OCR 识别 | 病历/药方/检查单三种类型智能识别 + 人工校对 | ✅ |
| 用药清单 | 药名/剂量/频次/时间/疗程 + 潜在冲突警告 + 过敏交叉检查 | ✅ |
| 健康趋势 | 血压/血糖自动折线图（Canvas 绘制） | ✅ |
| 服药提醒 | 时间列表 + 手动标记已服 + 浏览器 Notification 推送 | ✅ |
| 搜索 | 全文检索药名/诊断/老人 | ✅ |
| 导出 | 健康小结 TXT / 全部数据 JSON | ✅ |
| 家庭 | 成员管理（主管理员/成员/只读） | ✅ |
| 设置 | 大字体开关 / 数据清空 / 通知开关 | ✅ |
| 适老化 | 大按钮、高对比度、短操作路径 | ✅ |

## ⚠️ 注意事项

1. **数据同步**：本应用数据存储在单台设备的浏览器中。如需多设备共享，请接入后端（见 `js/ocr.js` 顶部注释中的接入建议）。
2. **OCR 说明**：当前 `js/ocr.js` 为演示版，使用模拟数据。如需真实识别，可接入百度/腾讯/阿里云的医疗 OCR API，并替换 `recognize()` 内部实现。
3. **HTTPS**：Netlify 默认提供 HTTPS，浏览器通知（Notification API）需要 HTTPS 环境才能启用（除了 localhost）。

## 🛠 本地开发

```bash
# 任意一个方式都行
python3 -m http.server 8080
# 或
npx http-server -p 8080
# 然后访问 http://localhost:8080
```
