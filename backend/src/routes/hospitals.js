const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// 搜索医院库（支持名称/简称/别名/拼音首字母，双向LIKE模糊匹配）
router.get('/search', hospitalController.search);
// 校验医院是否存在（不存在返回相似项）
router.get('/check', hospitalController.check);
// 医院名称匹配（精确匹配+模糊双向LIKE+2-gram分词匹配，供OCR/粘贴填充时自动匹配）
router.get('/match', hospitalController.match);
// 添加新医院（自动生成拼音首字母）
router.post('/add', hospitalController.add);

module.exports = router;
