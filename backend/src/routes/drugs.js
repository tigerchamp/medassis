const express = require('express');
const router = express.Router();
const drugController = require('../controllers/drugController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', drugController.getDrugs);
router.get('/chronic/list', drugController.getChronicMeds);
router.post('/chronic/save', drugController.saveChronicMeds);
router.get('/:id', drugController.getDrug);
router.get('/:id/records', drugController.getDrugRecords);
router.post('/', drugController.addDrug);
router.put('/:id', drugController.updateDrug);
router.delete('/:id', drugController.deleteDrug);

module.exports = router;
