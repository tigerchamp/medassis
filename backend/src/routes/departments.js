const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/search', departmentController.search);

module.exports = router;
