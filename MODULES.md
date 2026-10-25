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
- **保存类函数的「防重复提交」标志（`_saving` / `_ocrMedsSaving` / `_ocrDrugSaving`）必须由 `finally` 解锁，
  且所有 `return` 都要在 `try` 之内。**
  `saveOcrMeds` 曾把校验写在 `try` 外面：任何一次校验失败都 early return 且永不解锁 →
  之后再点保存永远只提示「正在保存，请稍候…」、不保存也不退出（2026-10-21 修）。
  改这类函数时先确认：校验是否在 `try` 内、有没有 `finally`。
  （`saveOcrDrug` / `saveMed` / `saveDrug` 另有 15 秒 `setTimeout` 兜底解锁，属于历史补丁，不是范例。）
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

### M1.1 · 记住账号密码（多账号，`RememberCreds` / `PageLogin`）

**设计意图**
- 手机上是**安卓 WebView** 打开本应用，用户要的是「装到手机上以后不用每次输密码」。
- **一台手机可能登录多个账号**（家里几个人轮流用），所以存的是**账号列表**不是单个账号：
  `fh_remember` → `{ accounts: [{ phone, password, name, lastAt }], autoLogin }`，`list()[0]` 是最近登录的。
  旧格式 `{ phone, password }` 读的时候自动兼容，不用迁移。
- 凭据**双写**：`localStorage['fh_remember']` + 同名 cookie（有效期 1 年），读取 localStorage 优先、cookie 兜底。
  双写的原因：WebView 若没调用 `setDomStorageEnabled(true)`，localStorage 只活在内存里，**APP 一重启就清空**，
  那样「记住密码」等于没做；cookie 在 WebView 里默认开启且会落盘，所以拿它兜底。
- 勾选「记住密码」才存；**取消勾选只不记这一个账号**（`remove(phone)`），不牵连其他已记住的账号。
- **记住 2 个以上账号时，登录页列出「选择账号登录」**：点某个账号直接用它登录，右侧 × 单独忘记该账号。
- **主动退出登录 ≠ 忘记账号**：`logout()` 只调 `pauseAutoLogin()`（账号全留着），之后打开 APP **不再自动登录**，
  停在登录页让用户自己选账号；等某次手动登录成功（`save()`）才恢复自动登录。
  这是用户明确选的行为：退出多半是为了换号，若重启后又自动登回原账号，等于白退出。
- `autoLogin()`：有记住的账号且上次不是主动退出时，自动登录最近那个；失败（密码改过/断网）就停在已回填的登录页，
  **不清除**记住的密码（网络抖动不该让用户重输）。

**易踩坑**
- **401 过期 ≠ 主动退出**：`api.js` 里 401 走 `App.onSessionExpired()`，不能调 `logout()`，
  否则「服务端判过期」会被当成「用户主动退出」，把自动登录停掉。两处共用 `_clearSession()`。
- `save()` 的 `lastAt` 严格递增（取 `max(现有)+1`）：同一毫秒内连续登录两个账号时 `list()` 排序不会并列，
  「最近登录的」不会飘。
- 密码是**明文**存在 localStorage / cookie 里的，且 cookie 里的密码会随每个请求头带到服务端。
  这是用户明确要求的取舍（个人家庭应用、手机专属）；若要更安全，应改成长效 refresh token，别只做「混淆加密」。
- 顺序：`switchPage('login')` 会走 `FormDraft.restore`，草稿只填空字段，不会覆盖回填的账号密码。
- 改登录页/登录流程后记得 `index.html` 的静态资源版本号 `?v=YYYYMMDD` +1，否则手机拿不到新代码。
- **安卓封装侧必须确认**：`WebSettings.setDomStorageEnabled(true)`（否则登录态 token 也保不住，
  每次开 APP 都得靠自动登录重新换取），以及 `setAcceptCookie(true)`（默认开，别关）。

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
- **日期输入一律用自研 `CalendarPicker`（`js/app.js`），不要用原生 `<input type="date">`。**
  原生控件在手机/微信 webview 里只能逐月翻，改年份极难（用户报过：药品详情改有效期改不动年份）。
  `CalendarPicker` 支持 ‹‹/›› 跳年、点标题切到月份/年份视图，与处方表单一致（2026-10-21 统一）。
- **有效期只在「药箱录入」这条路上是必填**（药盒识别 `saveOcrDrug`、手工添加 `saveDrug`）。
  处方/用药计划表单（OCR 处方弹框、添加记录-处方）的**有效期是非必填**：label 不带 `*`，
  空值后端按 NULL 入库（`_syncToDrugInventory` 里 `if (expiryDate)` 才更新，否则沿用旧有效期）。
  别把处方表单的有效期加成必填——2026-10-21 修过一次（当时还会连带把保存按钮卡死，见 M0）。

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
- **结束用药要让用户填结束日期**（`PageMedEdit.endMed`，2026-10-25 加）：
  默认今天，弹自研日历（复用 `App.promptDate` + `CalendarPicker`），可选范围 **开始服药日期 ~ 今天**。
  原因：用户常常忘了及时点结束，若一律写 `CURDATE()`，历史记录里的停药日期就是错的。
  校验用纯函数 `validateMedEndDate(endDate, startDate, today)`（日期是 `YYYY-MM-DD`，直接字符串比较）。

**关键约定**
- `status`: `active` / `ended`。结束写 `end_date = CURDATE()`；恢复写 `end_date = NULL`。
- `frequency` 是**每日次数（整数）**，`times` 是 JSON 时间数组（如 `["08:00","18:00"]`）。
- **服药时间段的默认勾选不能按 `slots` 顺序取前 N 个**（`MedTimesUI.defaultKeys`）：
  1 次→早；**2 次→早 + 晚**；3 次→早/中/晚；4 次→全部。
  取前 N 个会把「一天两次」默认成 早/中（用户报的线上问题，2026-10-21 修）。
  新增「按频次初始化时间段」的地方都要调 `defaultKeys`，别再写 `slots.slice(0, n)`。

**易踩坑**
- `updateMedication` 用**字段白名单**：解构出来的字段才会进 `updates`。
  **新增可编辑字段必须同时改两处**（解构 + `updates.push`），否则前端传了也被静默丢弃、
  保存还提示成功 —— `doseAmount`/`doseUnit` 就是这样丢的（M4 回归点）。
- 列表显示的剂量是 `doseAmount + doseUnit`，不是 `dose` 字符串。两者都要维护一致。
- **结束日期的「不能晚于今天」只在前端校验**：「今天」是**客户端本地日期**（`_todayLocal()`），
  后端按 UTC 之类的时区算会得到不同的「今天」，跨零点时可能误拒。别把它搬到后端去校验。
  长期用药被移除时的自动结束（`drugController` 里 `end_date = CURDATE()`）不经用户，仍写当天，这是两套路径。
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
## M6.1 · 就诊记录与自动关联（`recordController` + `js/app.js` 关联逻辑）

**职责**：病历 / 检查报告 / 处方 / 药方 四类记录的存取，以及把报告、处方**自动挂到已有的同次就诊病历**上（`records.related_record_id`）。

**设计意图**
- 一次就诊会产生多份单据（病历 + 报告 + 处方）。用户只勾一次「关联病历」，后面的报告/处方按 就诊日期 + 医院 + 科室 + 医生 自动归到同一条病历下，病历详情里能一次看到当次就诊的全部单据。
- 匹配口径：**就诊日期 + 科室是必要条件**；医院 / 医生**允许缺失**（缺失则不参与比较）。这是为了防止 OCR 少解析出一个字段就让整个自动关联静默失效。
- 判定三步：先按 日期+科室(+医生) 缩小候选 → 再逐个做医院名归一比较（`_isSameHospital` 支持简称/别名）→ 最后候选唯一时兜底关联。

**易踩坑**
- **医生不能当硬条件**。处方笺「医师签名」通常只印姓氏（如「王」），而病历记录的 `doctor` 常常为空 —— 一旦要求两边相等，候选会被整条筛掉，表现为「明明有当天的病历却关联不上」，且不报错，静默新建出一条重复病历。现在是：任一方为空就不参与比较；两边都有值时允许「姓氏 与 全名」的包含关系。
- 报告 / 处方的 **OCR 弹框**与**页面粘贴识别**是两条不同入口，容易只改一处。两条都必须走同一个 `App._autoMatchRelated()`，否则会出现「粘贴识别能关联、拍照识别关联不上」。
- 弹框里 `_loadRelatedRecords()` 只负责**清空**（切成员时防止残留上一个成员的 ID），自动匹配要另行调用 `_autoMatchRelated()`，且必须排在 `HospitalSuggest/DeptSuggest.matchAndFill` 之后（用归一后的名称去比）。
- 表单打开时已自动关联 → 保存时 `relatedId` 非空 → 不会重复弹提示，保存时的 `_ensureRelatedRecord()` 也不会再新建病历。

**涉及文件**：`backend/src/controllers/recordController.js`、`js/app.js`（`filterRecordCandidates` / `_findMatchingRecord` / `_autoMatchRelated` / `_onOcrElderChange`）、`js/pages.js`（`_tryAutoMatchRelatedRecord`）。


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

## M11 · 环境与第三方服务配置（`backend/src/config/env.js`）

**职责**：启动时自检 `.env`，把「缺哪一项 → 哪个功能不可用」打进控制台与日志。

**设计意图**
- **第三方配置缺失必须显式告警，不能静默**。线上事故：服务器 `.env` 丢了 `SHOWAPI_KEY`，
  药品说明书一直取不到，但 `fetchInfo` 在打日志之前就 `return` 了 —— 日志里零线索，
  只能靠「库里最后一条说明书获取于 2026-08-15」反推（2026-10-21 才定位）。
- 现在三层暴露：① 启动自检（`logEnvStatus`）；② 接口返回 `note`（非静默）；③ 前端 toast 显示原因。

**关键约定**
- `checkEnv(env)` 是**纯函数**（env 从参数传入），可离线单测；`logEnvStatus()` 才碰 logger/console。
- 分组检查：数据库 / 登录鉴权 / MinIO / 百度OCR / ShowAPI，缺任一项 → 整组不可用。
- **占位符等同于没配**：空串、`your_xxx`、`请填写`、`todo`、`changeme` 都算缺失
  （`.env.example` 里的值被原样拷进 `.env` 是最常见的漏配方式）。
- **新增任何第三方服务配置项，必须同时**：① 加进 `GROUPS`；② 加进 `.env.example`。
  漏了第 ② 步，下次重新配环境还会再丢一次（SHOWAPI_KEY 就是这么丢的）。

**易踩坑**
- 自检必须放在 `startServer()` 最前面：放在 DB 连接检查之后的话，DB 连不上时根本轮不到它执行。
- 前端拿到 `{fetched:false, note}` 时一定要 toast 出来，否则用户只看到"暂无说明书数据"。

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
| `js/app.js` `MedTimesUI` / 服药时间段 | M4（2 次→早+晚） | M9 全部 |
| `js/app.js` 保存类函数（`save*`） | M0（`finally` 解锁） | M7-10 手工（校验失败后仍能保存） |
| `js/app.js` 自动关联病历 / `recordController.js` | M6.1（医生不能当硬条件、两条入口要共用） | M8 |
| `js/pages.js` 粘贴识别 | M6.1 | M8 |
| `js/app.js` 草稿/刷新 | M7 | M7 手工（自动化测不到） |
| `backend/src/config/env.js` / `.env.example` | M11（占位符算缺失、新增项要同步两处） | M10 全部 |
