# 模块功能说明

> 这份文档记的是**每个模块的设计意图和易踩坑点**——就是那些时间久了会忘的"当初为什么这么做"。
> 代码怎么写的看源码；这里回答的是"为什么"和"改这里会炸什么"。
>
> **维护约定**
> 1. 改动任何模块前，先读对应章节（设计意图 / 关键约定 / 易踩坑）。
> 2. **新改动若与既有设计冲突：保留原设计，并提示用户确认。**
>    即便认为原设计不合理，也必须等用户同意后再改，不得擅自"优化"。
> 3. 改动后同步更新本文档；并跑 `TESTCASES.md` 里对应的用例。
>
> 用例索引见 `TESTCASES.md`，待办见 `TODO.md`，接口/表结构见 `TECHNICAL.md`。

---

## M0 · 前端框架（`js/app.js` + `js/pages.js`）

**职责**：SPA 路由、页面渲染、全局状态、模态框、表单草稿。

**设计意图**
- 页面是「返回 HTML 字符串的 `render()` + 异步加载数据的 `afterRender()`」，没有框架、没有虚拟 DOM。
  所以**每次 `switchPage` 都会重新拉接口**，列表页天然是最新数据，不需要手动刷新缓存。
- 返回栈 `state.pageHistory` 由 `switchPage` 维护，`goBack()` 弹栈。

**关键约定**
- `switchPage` 渲染后会调 `FormDraft.restore(main)`；`openModal` 渲染后会调 `FormDraft.restore(modalContent)`。
- 页面 id 白名单：`validPages`（`app.js:1637`）——刷新后恢复上次页面时只认这些。新增页面要加进去。

**易踩坑**
- `storage.js` 是早期无后端模式的遗留，现在数据一律走 `api.js`，不要再用它存业务数据。
- **前端是静态文件，手机浏览器/微信 webview 会长时间缓存。**
  `index.html` 里 `css/style.css` 与 `js/*.js` 都带 `?v=YYYYMMDD` 版本号，
  **改了前端必须把版本号 +1**，否则用户拿到的还是旧代码（典型症状：反馈"改了没生效"）。
  后端则相反，改动后需要 `pm2 restart medassis`。

---

## M0.1 · 附件上传（`ImageUploader`）

**职责**：给病历/药品/用药计划等记录附加图片（最多 9 张）。

**设计意图**
- 附件**只存图，不做 OCR 识别**（后端所有 controller 都没有调用 OCR 服务）。
  需要识别的走 M6 的 `startScan` → `_pickImages`，那里才是单张。

**易踩坑**
- 别把附件和 OCR 入口搞混：`_pickImages`（OCR，单张）vs `ImageUploader`（附件，多张）。
  限单张的约束只对 OCR 生效。

---

## M1 · 用户 / 家庭组 / 成员（`authController` / `elderController` / `utils/familyAccess.js`）

**职责**：登录注册、家庭组、成员档案、跨家庭数据可见性、成员间编辑授权。

**关键概念（最容易混）**
| 概念 | 含义 |
|---|---|
| `user_id` | **登录账号**。谁在操作。 |
| `elder_id` | **家庭成员/服药人**。家庭里每个人（含自己）都有一条 elder 记录。`App.state.currentMemberId` 就是这个。 |
| `family_id` | **家庭组**，数据隔离边界。一个家里可以有多个登录账号。 |

**设计意图**
- 数据隔离用 `familyAccessFilter(familyId, 表前缀)` 生成 SQL 片段，而不是各处手写 WHERE。
- 查看家人资料时**按 `elder_id`（服药人）过滤，不按设置人过滤**——所以 `getChronicMeds` 不按 `user_id` 过滤。

**易踩坑**
- `_canModifyMember()`：自己的 `self` 档案恒可改；改别人的档案需要对方授权（`canModifyHim`）。
  新增写操作必须走 `canModifyElder()` 校验。
- 移除成员是**软解绑**（解除关联 + 数据回退到缺省家庭组），不删任何资料。别改成硬删除。

---

## M2 · 药箱库存（`drugController` / `drug_inventory` 表）

**职责**：药品入库、按人拆分库存、余量消耗、过期状态。

**设计意图**
- `getDrugs` **按 `drug_code`（无 code 时按 name）聚合同名药为一条**，返回总余量 + `byElder` 按人拆分。
  药箱列表看到的是"这一个药"，而不是每一条入库记录。
- 余量口径：`remaining_quantity`，为 NULL 时退回 `quantity`。`autoConsume` 会按用药计划扣减余量。
- 最近有效期只统计**余量 > 0** 的记录，已吃完的旧批次不该占用有效期。
- `status`（valid / expiring_soon / expired）由最近有效期重算，不存死值。

**关键约定**
- `addDrug` 的**合并条件**：`family_id + drug_code + expiry_date + elder_id` 三者全相同才合并数量；
  否则**新建一条库存记录**。买新药时有效期几乎必然不同 → 会新建行。这不是 bug，是设计。

**易踩坑**
- 任何"读库存数量"的地方都要用**聚合口径**，不能只读单条记录。
  `getChronicMeds` 曾经只读 chronic 指向的单条行，导致加药后开药倒计时不涨（已修，见 `_aggregateInventory`）。
- 库存行可能属于**别的家庭组**（历史数据），聚合时用 `familyAccessFilter` 过滤，查不到就兜底用单行值，不要跨家庭取数。

---

## M3 · 长期用药（`chronic_medications` 表）↔ 用药计划联动

**职责**：用户从药箱勾选长期服用的药品，首页开药倒计时基于它们计算；保存时自动联动用药计划。

**设计意图**
- 表的粒度是 `UNIQUE(user_id, drug_inventory_id)`：**设置人 + 库存条目**。
- `saveChronicMeds` 是**全量覆盖**：`DELETE` 后重新 `INSERT`。所以要先读出旧集合才能做差值。
- **联动规则**（用户明确要求）：
  - 新勾选 → 有 `ended` 计划就**恢复**，已有 `active` 就**不动**，都没有才按「早上一次、每次 1 个单位剂量」**新建**
  - 取消勾选 → 该成员名下的 `active` 计划改为 `ended`
  - 新建的计划 `note` 写「由长期用药自动生成，用法用量请自行核对修改」——因为系统不知道真实剂量

**关键约定（务必遵守）**
- **不能走 `addMedication`**。它内部会调 `_syncToDrugInventory()` 按 `drug_code` 给已有库存 **+1**，
  勾一盒药库存就凭空多一盒。联动必须直接写 `medications` 表。
- 联动严格限定在**当前 `elderId` 名下**；`elderId` 为空时整个跳过（不误伤其他成员）。

**易踩坑**
- `DELETE` 用的是 `user_id + family_id`（**跨 elder**），这是既有行为，不要在没想清楚前改它。
- 同一药被勾选了多条入库记录时，返回列表要**去重**，否则倒计时卡片重复且数量翻倍。

---

## M4 · 用药计划（`medicationController` / `medications` 表）

**职责**：用药安排（药名、剂量、频次、服药时间）、服药日志、结束/删除、历史归档。

**设计意图**
- 编辑保存时会**先写一条 `status=ended` 的快照**到历史记录，再更新当前记录——用药变更要留痕。
- **48 小时规则（用户确认的原设计，不要改）**：
  创建 **48 小时内**显示「删除」（录错的兜底，直接删掉）；
  **超过 48 小时**显示「结束」（只能归档，保留历史）。**二选一**，不是同时显示。

**关键约定**
- `status`: `active` / `ended`。结束写 `end_date = CURDATE()`；恢复写 `end_date = NULL`。
- `frequency` 是**每日次数（整数）**，`times` 是 JSON 时间数组（如 `["08:00","18:00"]`）。

**易踩坑**
- `updateMedication` 用**字段白名单**：解构出来的字段才会进 `updates`。
  **新增可编辑字段必须同时改两处**（解构 + `updates.push`），否则前端传了也被静默丢弃、
  保存还提示成功 —— `doseAmount`/`doseUnit` 就是这样丢的（M4 回归点）。
- 列表显示的剂量是 `doseAmount + doseUnit`，不是 `dose` 字符串。两者都要维护一致。
- **「历史快照」不能用 `addMedication` 写，或者写了也必须让它不参与库存同步。**
  编辑用药计划保存时会写一条 `status=ended` 的快照做归档，而 `addMedication` 内部会调
  `_syncToDrugInventory()` 按 `drug_code` 命中已有库存并 **数量 +1** —— 每编辑一次药箱就多一盒。
  现在 `addMedication` 里已有守卫：`status === 'ended'` 时跳过同步（2026-10-17 修）。
  M3（长期用药联动）有同类陷阱，两处都别踩。

---

## M5 · 药品库（`drugs` 表 / `drugLibraryController` / `utils/drugLibrary.js`）

**职责**：12.9 万条国家药品参考数据 + 用户私有药品；名称/规格/容量/厂商综合匹配。

**设计意图**
- **同名药品极多**（"板蓝根颗粒" 上千条不同规格/厂家），所以匹配不能只看名字，
  要按 **名称 + 规格 + 单位容量 + 厂商** 综合评分（`scoreDrugMatch`）。
- `check` / `match` / `search` 三个端点共用 `_recallCandidates` + `_rankCandidates`：
  精确 + 模糊 + **2-gram 分词**三路召回，再综合评分排序。
- 跨单位等价：`0.25g == 250mg`（统一换算到 μg 比较）。
- 拼音首字母（`SHP` / `PFTTGP`）也要能召回——拼音与中文名没有字面相似度，
  `_rankCandidates` 里有专门的拼音兜底，否则会被 `nameScore > 0` 过滤掉。

**关键约定**
- 私有药品（`owner_user_id` 有值）只对创建者及其家庭组可见；共享数据 `owner_user_id IS NULL`。
- 下拉候选（`search`）也走综合评分排序，**不是** `ORDER BY name` —— 同名几十条时按 name 排序等于随机，
  正确那条会被 `LIMIT 20` 截断。

**易踩坑**
- 改评分逻辑后必须跑真实数据验证，纯逻辑单测看不出问题。
- 自动选中（`canAutoSelect`）要求**无冲突**：同名但规格不同时不能静默替用户决定，要弹候选给他选。

---

## M6 · OCR 识别（`backend/src/services/ocr.js`）

**职责**：拍照/粘贴文本的**类型判定**与**字段解析**。

**类型判定顺序（`detectType`，顺序本身就是设计）**
```
0. isDrugText()      ← 药品必须在最前
1. 病历（含"病历"）
2. 检查报告（报告/检验/化验/影像/超声…）
3. 处方（处方/Rp/R: 或 金额）
4. 默认 → 病历
```

**设计意图（两条互相拉扯的约束）**
- 药品判定**必须在处方之前**：处方药盒自身就印着「凭医师处方销售、购买和使用！」，
  若药品排在后面会被处方规则抢走，弹出处方表单而不是药品表单。
- 但药品在前又会把**真的处方笺**误判成药盒。解法：`isDrugText` 开头用
  `CLINICAL_MARKER_RE`（科别/费别/姓名/处方编号/临床诊断/医师签名…）先排除处方笺与病历。
- 列表里**不能放「医师」「医生」「处方」**——药盒自己就印着"凭医师处方销售…"和
  "请仔细阅读说明书并在医师指导下使用"，拿它们排除会把药盒本身排除掉。

**字段解析**
- 病历：靠 `SECTION_LABEL_RE`（主诉/现病史/体格检查/诊断/处理意见…）**遇到下一个段落标签就停**。
  之前只认【】标签和"医师签名"等页脚，而普通病历没有页脚 → 主诉会把整份病历吸收进来（曾达 548 字）。
- 诊断：起始行必须**以诊断标签开头**（不能只判断"包含诊断"，`辅助检查：详见诊断报告。` 会误判）；
  多个诊断常被挤在一行甚至**跨行断字**（"腰背" / "痛关节炎"），所以拼接后按疾病结尾词切分还原。
- 处方药品行有**两种写法**，都要支持：
  - `甲钴胺片[奇信][0.5mg*48]X1`（`specLineRe`，数字+单位\*数字）
  - `玻璃酸钠滴眼液(10ml:10mg/盒)x1盒/0.2ml滴眼`（`rxDrugLineRe`）
    注意规格里可能有**嵌套括号** `(20g:0.2g(1%)/盒)`，必须用 `.*` 而不是 `[^）)]*`
    （后者会停在 `(1%)` 的 `)` 上）。
- 药盒：取**通用名**而非商品名。通用名含剂型词，商品名一般不含。
  剂型词表是与药品判定**共用的 `DOSAGE_FORM_RE`**，缺一个剂型（如"乳胶剂"）就会退化成取第一个候选 → 取到商品名。

**关键约定**
- 拍照识别**每次只 1 张**（多张 OCR 文本拼接会导致类型判定与字段解析错乱）；
  附件上传 `/api/upload` **不受此限制**，仍可多张。
- 剂量单位支持中文写法（克/毫克/毫升），药盒常印"20克装"。

---

## M7 · 前端表单防丢失（`FormDraft` + 刷新拦截）

**职责**：移动端误触下拉刷新时，不丢正在填写的表单。

**三层保护（缺一不可）**
1. CSS `overscroll-behavior-y: none`（+ 滚动容器 `contain`）——标准做法，但**微信内置 webview 不生效**
2. `_preventPullToRefresh()`：**手势层拦截**，有弹框且滚动容器已在顶部时阻止继续下拉
3. `beforeunload`：只在有浮层时拦截，兜住浏览器刷新按钮这类**非手势**触发

**设计意图**
- **不能只靠 `beforeunload` 拦下拉刷新**：Chrome 的刷新动图已经转起来了，被取消后会**卡住不消失**。
  所以下拉刷新必须在手势层拦掉，让 `beforeunload` 根本不触发。
- `FormDraft` 是最后兜底：草稿存 sessionStorage，
  - key 用**容器内字段 id 集合的指纹**（不同表单天然隔离，不用各处手写 key）
  - **只回填当前为空的字段**，服务端/OCR 预填的值不会被草稿覆盖
  - TTL 12 小时；保存成功后 `clearHere()` 清掉

**易踩坑**
- 测试文件里 require 顺序：`src/config/database.js` 在**模块加载时**就读 `process.env` 建连接池，
  必须先 `require('./helpers/db.js')` 加载 `.env`，否则空密码连库报 `ER_ACCESS_DENIED_ERROR`。

---

## M8 · 留言反馈（`feedbackController`）

**职责**：Bug/建议留言、列表、详情、点赞、评论。入口在顶栏消息图标。

---

## M9 · 文件存储（`services/minio.js` + `utils/entityFiles.js`）

**职责**：图片上传与实体（病历/药品/用药）关联。

**关键约定**：先传文件拿 `fileId`，保存实体时提交 `fileIds`，由 `setEntityFiles` 建立关联。
删除实体时 `deleteEntityFiles` 一起清理。

---

## M10 · 测试（`backend/test/`）

**职责**：回归保护，防止"修一个带出另一个"。

- 入口：`cd backend && npm test`（Node 内置 `node:test`，零依赖、离线）
- 集成用例需要 MySQL；**连不上时自动 skip**（不会误报失败）
- 远程 MySQL 走 SSH 隧道：`ssh -L 3306:127.0.0.1:3306 ubuntu@82.157.202.113 -N`
- 写操作全在事务里，末尾 `rollback`，不落盘

**易踩坑**
- 测试进程不退出 = 连接池没关。`after()` 钩子里要 `db.end()` + `db.closePool()`。
- 隧道在但远端 MySQL 不可达时，连接会**挂住而不是报错**，所以 `connect`/`initPool` 都加了硬超时。

---

## 改动速查：动这里 → 必须看那儿

| 要改的地方 | 必读章节 | 必跑用例（TESTCASES.md） |
|---|---|---|
| `services/ocr.js` | M6 | M1 类型判定 / M2 病历 / M3 药盒 + 处方解析 |
| `utils/drugLibrary.js` | M5 | M4 匹配 + M1（判定依赖评分） |
| `drugLibraryController.js` | M5 | M4 |
| `drugController.js` | M2、M3 | M5 联动 / M6 倒计时 |
| `medicationController.js` | M4 | M5；并确认没走 `addMedication` 同步库存 |
| `js/pages.js` 用药计划 | M4（48 小时规则） | M7 手工 |
| `js/app.js` 草稿/刷新 | M7 | M7 手工（自动化测不到） |
