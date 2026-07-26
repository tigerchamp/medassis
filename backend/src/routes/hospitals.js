const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// 搜索医院库（支持拼音首字母缩写与名称）
router.get('/search', hospitalController.search);

module.exports = router;
