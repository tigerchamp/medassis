const express = require('express');
const router = express.Router();
const drugLibraryController = require('../controllers/drugLibraryController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// 搜索药品库（支持拼音首字母缩写与名称，双向LIKE模糊匹配）
router.get('/search', drugLibraryController.search);
// 校验药品是否存在（不存在返回相似项）
router.get('/check', drugLibraryController.check);
// 药品名称匹配（精确匹配+模糊双向LIKE+2-gram分词匹配，供OCR/粘贴填充时自动匹配）
router.get('/match', drugLibraryController.match);
// 添加新药品（自动生成拼音首字母，标记 owner_user_id 私有数据）
router.post('/add', drugLibraryController.add);
// 按编码获取药品
router.get('/:code', drugLibraryController.getDrug);

module.exports = router;
