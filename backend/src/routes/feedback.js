const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/save', feedbackController.saveFeedback);
router.get('/list', feedbackController.listFeedback);
router.get('/search', feedbackController.searchFeedback);
router.get('/:id', feedbackController.getFeedbackDetail);
router.post('/:id/like', feedbackController.toggleLike);
router.post('/:id/comment', feedbackController.addComment);

module.exports = router;
