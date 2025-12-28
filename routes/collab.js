// Collaboration Post Routes
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const collabController = require('../controllers/collabController');
const { validate } = require('../middleware/validate');
const { createCollabPostSchema, updateCollabStatusSchema, collabQuerySchema } = require('../validators/collabValidator');

// Collaboration routes with validation
router.get('/', validate(collabQuerySchema, 'query'), collabController.getAllCollabPosts);
router.get('/user/:userId', collabController.getUserCollabPosts);
router.post('/', verifyToken, validate(createCollabPostSchema), collabController.createCollabPost);
router.post('/:id/apply', verifyToken, collabController.applyToCollabPost);
router.patch('/:id/status', verifyToken, validate(updateCollabStatusSchema), collabController.updateCollabStatus);
router.delete('/:id', verifyToken, collabController.deleteCollabPost);

module.exports = router;
