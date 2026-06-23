const express = require('express');
const router = express.Router();
const medicationController = require('../controllers/medicationController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', medicationController.getMedications);
router.get('/logs', medicationController.getMedLogs);
router.get('/:id', medicationController.getMedication);
router.post('/', medicationController.addMedication);
router.put('/:id', medicationController.updateMedication);
router.delete('/:id', medicationController.deleteMedication);
router.post('/logs', medicationController.logMedication);

module.exports = router;
