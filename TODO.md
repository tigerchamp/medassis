# 待办清单

> 来源：2026-10-16 用户提出。状态流转：`待开始` → `进行中` → `已完成`。
>
> **改动前**：先读 `MODULES.md` 对应模块的「设计意图」与「易踩坑」——那些约束不是随便定的，
> 不确定是否有意为之时先问用户，别擅自"优化"。
>
> **改动后**：① 同步更新 `MODULES.md`（设计变了）/ `TECHNICAL.md`（结构变了）；
> ② 按 `TESTCASES.md` 的「改动 → 应跑用例 映射表」跑相关模块 `cd backend && npm test` 再汇报。
> 这是用户明确要求的，不要跳过。

---

## 1. 添加药品后开药倒计时不刷新（还显示 0 天）

**状态**：已完成

**现状**
- 首页倒计时计算在 `js/pages.js:292-334`（长期用药分支）：
  `daysLeft = Math.max(0, qty * packDays - daysUsed)`，其中 `qty = cm.drug.quantity`
- `cm.drug` 由 `getChronicMeds` 返回（`backend/src/controllers/drugController.js:450`），
  它 `LEFT JOIN drug_inventory di ON cm.drug_inventory_id = di.id`，**只取 chronic 记录指向的那一条库存行**

**根因（两层）**
1. `addDrug`（`drugController.js:280`）合并库存的条件是 `drug_code + expiry_date + elder_id` 三者全相同。
   买新药时有效期几乎必然不同 → **新建一条库存行**，而 `chronic_medications.drug_inventory_id`
   仍指向旧行 → 倒计时读到的还是旧行的数量，永远不涨。
2. 药箱列表用的 `getDrugs`（`drugController.js:139`）是**按 drug_code 聚合所有库存行求和**的，
   而 `getChronicMeds` 不聚合 —— 两处口径不一致，药箱显示 2 盒、倒计时仍按 1 盒算。

**已实施**
- 新增 `_aggregateInventory()`：按 `family + drug_code(或 name) + elder` 聚合所有入库行，
  口径与 `getDrugs` 一致（余量 = `remaining_quantity`，为 NULL 时退回 `quantity`；
  只统计余量 > 0 的记录来取最近有效期）
- `getChronicMeds` 用聚合值覆盖 `quantity` / `expiry_date` / `status`；同一药被勾选多条入库记录时去重
- SQL 里 `cm.elder_id` / `di.elder_id` 分别取别名（`di.*` 会覆盖同名字段）
- 倒计时基数按用户选择用**剩余余量**
- 前端无需改动（`PageHome` 每次 render 都会重新拉接口）

**验证**（真实库，端到端调 `getChronicMeds`）
```
匹伐他汀钙片   旧: 单行余量=1  ->  新: 聚合余量=3（2 条入库行）  expiry=2028-02-17
阿司匹林肠溶片  库存行属另一家庭，聚合查不到 -> 兜底沿用单行值（不跨家庭取数）
```

---

## 2. 拍照 OCR 限制每次只能上传一张图片

**状态**：已完成

**现状**
- `js/app.js:2045 _pickImages()`：`input.multiple = true`
- `backend/src/routes/ocr.js:45`：`upload.array('files', 9)`

**根因**：建的 file input 允许多选；OCR 分支按多张拼接文本，多选会让 OCR 文本串在一起导致误判。

**已实施**
- `_pickImages()` 去掉 `multiple`，并 `slice(0, 1)` 兜底（仍返回数组，下游不变）
- `ocr.js` 改为 `upload.array('files', 1)`
- **未动** `backend/src/routes/upload.js`（附件上传仍需多张）与
  `js/app.js:40` 的 `ImageUploader` file input

---

## 3. 手机滑动被识别为下拉刷新，丢失正在填写的表单数据

**状态**：已完成

**现状**：全局没有 `overscroll-behavior`，也没有 `beforeunload` 拦截 —— 已确认 `grep` 无命中。

**根因**：移动端浏览器的「下拉刷新」手势作用于 `<html>/<body>`，在 SPA 里向下滑动表单时会被触发，
整页重载 → 未提交的表单数据丢失。

**已实施**
- CSS（`css/style.css`）：`html,body{overscroll-behavior-y:none}` 关闭下拉刷新；
  `.main-content / .modal-content / .dropdown-menu / .scan-overlay` 加 `overscroll-behavior:contain`
- `App._hasBlockingOverlay()`：扫描所有 `[id$="Overlay"]`，有可见浮层即视为"有弹框"；
  `beforeunload` 时拦截（iOS Safari 不可靠，故再加第 3 层）
- 新增 `FormDraft`（`js/app.js`）：sessionStorage 草稿持久化
  - key 用**容器内字段 id 集合的指纹**，不同表单天然隔离，无需各处手写 key
  - 输入停顿 800ms 落盘；`switchPage` / `openModal` 时回填
  - **只回填当前为空的字段**，服务端/OCR 预填的值不会被草稿覆盖
  - TTL 12 小时自动失效；保存成功后 `FormDraft.clearHere()` 清掉（saveDrug / saveMed /
    saveRecord / saveOcrDrug / saveOcrMeds / saveOcrRecord）

**验证**（stub 单测）：存草稿 → 刷新后药名/规格恢复、`drugQty` 保持服务端值 1（未被覆盖）；
不同字段集的表单互不串味；清除生效；过期 13h 不回填并自动清理；disabled/hidden 字段被排除。

---

## 4. 药品添加表单顶部加「粘贴文本自动识别」

**状态**：已完成

**现状**
- 病历/处方页已有：`js/pages.js:2090-2094` 的 `#pasteRecognizeBox`，
  处理函数 `PageAddRecord.onPasteRecognize`（`pages.js:2446`）
- 药品添加表单 `PageAddDrug`（`js/pages.js:2684`）原本没有

**已实施**
- `PageAddDrug.render()` 顶部加同款粘贴识别区（文本框 + 识别按钮）
- 新增 `PageAddDrug.onPasteRecognize(event)`：
  先 `Api.ocr.parse('auto', text)`，判定为非药品时按 `drug` 再解析一次
  （在药品表单里粘贴，意图就是录药品）
- 回填 `drugName`（走 `DrugSuggest.matchAndFill`，与药品库精确匹配后自动补全并置灰规格/厂商）、
  `specDosage` / `specDosageUnit` / `unitCap` / `unitCapUnit` / `drugManu`

---

## 5. 病历 OCR 解析不准：「主诉」塞了几乎所有文字，医院/诊断有时不对

**状态**：已完成（2 份真实样本全部通过；如后续拿到更多样本，直接加到
`backend/test/ocr_samples.js` 再跑回归）

**现状**
- `chiefComplaint: extractBlock(text, ['主诉'])`（`parseRecord`，`ocr.js:361`）
- `extractBlock` 命中关键词后一路收集后续行，只在碰到下一个 `【标签】` 或
  `医师签名|签章|第N页|审核|调配|核对|发药` 时才停 —— **普通门诊病历没有这些页脚，
  于是主诉把现病史、查体、诊断、处置一路吸收到结尾**（实测 393 / 548 字）
- `extractDiagnosis` 用"包含诊断"找起始行，`辅助检查：详见诊断报告。` 会被误判为起点；
  候选过滤又限制长度 2-8 字，**"腰椎间盘突出伴神经根病"（11 字）被整条丢掉**

**已实施**
- 新增 `SECTION_LABEL_RE`：主诉/现病史/既往史/体格检查/辅助检查/诊断/处理意见/西药方/医生…
  等段落标签，`extractBlock` 与 `extractDiagnosis` 遇到即停止
- `extractBlock(text, keywords, {allowUsage})`：医嘱本身含"用法：…"，
  传 `allowUsage:true` 时不在用法处停止（其余字段照常停）
- `extractDiagnosis`：起始行改为要求**以诊断标签开头**（`初步诊断|临床诊断|诊断…`），
  找不到再退回"包含诊断"；候选不再限制长度，只保留纯中文+数字+连字符；
  拼接后交给 `splitDiseases()` 按疾病结尾词切分
- `splitDiseases()`：按 `综合征|狭窄|突出|增生|痛|炎|症|病|证…` 切分并补回顿号；
  切分点要求后紧跟另一个汉字且不是连接词（伴/合/并/或/与/型/性），
  避免把"腰椎间盘突出伴坐骨神经痛"切碎
  ——同时解决了 OCR 跨行断字（"腰背" / "痛关节炎" → "腰背痛、关节炎"）

**验证**：`node backend/test/ocr_regression.js` → **20 通过 / 0 失败**
```
航空总医院               主诉: 腰痛伴左下肢麻木3周
                        诊断: 腰椎间盘突出伴神经根病、腰椎管狭窄、膝关节痛
建外第二社区卫生服务中心   主诉: 腰背疼痛加重10天
                        诊断: 坐骨神经痛、腰椎间盘突出伴坐骨神经痛、腰痛-肾阳虚证、
                             冠状动脉粥样硬化性心脏病、高胆固醇血症、高脂血症、腰背痛、关节炎
                        医生: 何春
```
> 注：医院/科室/日期两份样本改前就已解析正确（本次未改动 `findHospital` / `findDepartment` / `findDate`）。
> 已知遗留：建外那份是 SOAP 格式，没有"医嘱"段落，药品清单在"西药方/中药方"下，`orders` 仍为空
> （属处方内容，不在本次改动范围）。
