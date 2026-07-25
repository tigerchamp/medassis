const express = require('express');
const router = express.Router();
const drugLibraryController = require('../controllers/drugLibraryController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// 搜索药品库（支持拼音首字母缩写与名称）
router.get('/search', drugLibraryController.search);
// 按编码获取药品
router.get('/:code', drugLibraryController.getDrug);

module.exports = router;
