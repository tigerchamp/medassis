const express = require('express');
const router = express.Router();
const recordController = require('../controllers/recordController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', recordController.getRecords);
router.get('/:id', recordController.getRecord);
router.post('/', recordController.addRecord);
router.put('/:id', recordController.updateRecord);
router.delete('/:id', recordController.deleteRecord);
router.post('/:id/notes', recordController.addNote);

module.exports = router;
