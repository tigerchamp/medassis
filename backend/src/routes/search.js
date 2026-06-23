const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/stats', searchController.getStats);
router.get('/', searchController.search);

module.exports = router;
