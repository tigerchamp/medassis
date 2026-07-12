const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// 公开路由
router.post('/register', authController.register);
router.post('/login', authController.login);

// 需要认证的路由
router.get('/profile', authMiddleware, authController.getProfile);
router.put('/profile', authMiddleware, authController.updateProfile);
router.post('/join-family', authMiddleware, authController.joinFamily);
router.get('/family-members', authMiddleware, authController.getFamilyMembers);
router.put('/family', authMiddleware, authController.updateFamily);
router.put('/authorize/:userId', authMiddleware, authController.toggleAuthorization);

module.exports = router;
