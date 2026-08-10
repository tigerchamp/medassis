# 处方保存为记录 + 关联病历 + 详情联动显示

## Context

当前处方（无论 OCR 扫描还是手动添加）只写入 `medications` 表，不创建 `records` 记录，导致无法在病历列表中查看历史处方。同时处方和检查报告无法关联到已有病历，病历详情也看不到关联的处方/报告。

目标：
1. 处方保存时同时创建 `records` 记录（type='药方'），可在列表中查看
2. 处方/检查报告表单增加"关联病历"下拉选择
3. 病历详情页展示关联的处方和检查报告

## 数据库

**`backend/src/config/database.js`** — 在 initDatabase 末尾加 ALTER TABLE：
```sql
ALTER TABLE records ADD COLUMN IF NOT EXISTS related_record_id VARCHAR(36) NULL;
```
- `records.type` ENUM 已含 `'药方'`，无需改
- `medications.source_prescription_id` 已存在，只需写入

## 后端

### 1. `backend/src/controllers/recordController.js`

- **addRecord** (L100)：body 解构加 `relatedRecordId`；INSERT 加 `related_record_id` 列
- **getRecord** (L54)：
  - 返回字段加 `relatedRecordId: r.related_record_id`
  - 若 `type='病历'`：查 `SELECT * FROM records WHERE related_record_id=? AND family_id=?`，对每条 type='药方' 的关联记录再查 `medications WHERE source_prescription_id=?`，组装为 `relatedRecords` 返回
  - 若 `type='药方'`：查 `medications WHERE source_prescription_id=?`，作为 `medications` 返回
- **listRecords** (L8)：format 函数加 `relatedRecordId`（SELECT * 已含此列）
- **updateRecord** (L160)：body 解构加 `relatedRecordId`，UPDATE 加此列

### 2. `backend/src/controllers/medicationController.js`

- **addMedication** (L88)：body 解构加 `sourcePrescriptionId`；INSERT 语句加 `source_prescription_id` 列和值

### 3. `backend/src/routes/records.js`

- 无需新路由，关联数据在 getRecord 响应中一并返回

## 前端

### 4. `js/api.js`

- `Api.records.add`：传 `relatedRecordId`
- `Api.medications.add`：传 `sourcePrescriptionId`

### 5. `js/app.js` — saveOcrMeds() (L894)

改为"先建记录再建用药"：
1. 上传图片拿 fileIds
2. 调 `Api.records.add({ type:'药方', elderId, visitDate, hospital, department, doctor, diagnosis, relatedRecordId, fileIds })` → 拿 `prescriptionId`
3. 循环调 `Api.medications.add({ ..., sourcePrescriptionId: prescriptionId })`

OCR 处方表单需增加 hospital/department/doctor 输入框 + "关联病历"下拉（在 `${medBlocks}` 之前）

### 6. `js/app.js` — saveRecord() isPrescription 分支 (L1124)

同样改为"先建记录再建用药"：
1. 调 `Api.records.add({ type:'药方', ... })` → 拿 `prescriptionId`
2. 调 `Api.medications.add({ ..., sourcePrescriptionId: prescriptionId })`

### 7. `js/app.js` — saveRecord() isReport 分支 (L1153)

`Api.records.add` 调用加 `relatedRecordId` 参数

### 8. `js/app.js` — OCR 病历/报告表单 (startScan)

- 报告表单末尾加"关联病历"下拉
- 新增辅助方法 `_loadRelatedRecords(elderId, selectId)`：调 `Api.records.getAll(elderId)` 过滤 `type==='病历'` 填充 select

### 9. `js/pages.js` — PageAddRecord 表单

- 处方区域 (`recordFieldsPrescription`, L599) 顶部加 hospital/department/diagnosis/doctor 字段
- 处方区域 + 报告区域 (`recordFieldsReport`) 末尾各加"关联病历"下拉 `<select id="recordRelatedRecord">` / `<select id="recordRelatedRecord2">`
- `onTypeChange` 和 elder 切换时调 `_loadRelatedRecords`

### 10. `js/pages.js` — PageRecords 列表 (L106)

- 病历过滤改为 `r.type === '病历'`（原 `!== '检查报告'` 会含药方）
- 新增处方过滤 `r.type === '药方'`
- HTML 加第三个 card "处方记录"，点击调 `App.viewRecord(id)`

### 11. `js/pages.js` — PageRecordDetail (L186)

- **type='药方'**：显示 hospital/department/doctor/date + 用药明细表（从 `r.medications` 渲染药品名/规格/剂量/频次）+ 图片 + 删除按钮
- **type='病历'**：在现有内容后追加"关联处方"和"关联报告"区块（从 `r.relatedRecords` 渲染，点击可跳转详情）
- **type='检查报告'**：保持现有逻辑

## 验证

1. 手动添加处方 → 确认 records 表有 type='药方' 记录 + medications 有 source_prescription_id
2. 扫描处方 → 同上
3. 手动添加检查报告时选择关联病历 → 确认 related_record_id 有值
4. 打开病历详情 → 确认显示关联的处方和报告
5. 病历列表页三个分区正确显示
6. `node --check` 校验所有修改的 .js 文件
