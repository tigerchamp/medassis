const express = require('express');
const router = express.Router();
const elderController = require('../controllers/elderController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', elderController.getElders);
router.get('/:id', elderController.getElder);
router.post('/', elderController.addElder);
router.put('/:id', elderController.updateElder);
router.delete('/:id', elderController.deleteElder);

module.exports = router;
