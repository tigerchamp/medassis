const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/search', departmentController.search);
// 校验科室是否存在（不存在返回相似项）
router.get('/check', departmentController.check);
// 添加新科室（自动生成拼音首字母）
router.post('/add', departmentController.add);

module.exports = router;
