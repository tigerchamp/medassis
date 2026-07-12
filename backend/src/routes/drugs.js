const express = require('express');
const router = express.Router();
const drugController = require('../controllers/drugController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', drugController.getDrugs);
router.get('/:id', drugController.getDrug);
router.post('/', drugController.addDrug);
router.put('/:id', drugController.updateDrug);
router.delete('/:id', drugController.deleteDrug);

module.exports = router;
