// Project routes - Refactored to use controllers
const express = require('express');
const router = express.Router();
const { verifyToken, optionalAuth } = require('../middleware/auth');
const projectController = require('../controllers/projectController');
const { validate } = require('../middleware/validate');
const { preprocessFormData } = require('../middleware/preprocessFormData');
const { createProjectSchema, updateProjectStatusSchema, projectQuerySchema, commentContentSchema } = require('../validators/projectValidator');
const multer = require('multer');

// Configure multer for file uploads (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// Basic Project CRUD routes with validation
router.get('/', optionalAuth, validate(projectQuerySchema, 'query'), projectController.getAllProjects);
router.get('/user/:userId', verifyToken, projectController.getUserProjects);
router.get('/:id', optionalAuth, projectController.getProjectById);
router.post('/', verifyToken, upload.single('pdf'), preprocessFormData, validate(createProjectSchema), projectController.createProject);
router.patch('/:id/status', verifyToken, validate(updateProjectStatusSchema), projectController.updateProjectStatus);
router.delete('/:id', verifyToken, projectController.deleteProject);

// Engagement routes
router.post('/:id/like', verifyToken, projectController.toggleLike);
router.post('/:id/bookmark', verifyToken, projectController.toggleBookmark);
router.post('/:id/view', optionalAuth, projectController.trackView); // Allow unauthenticated views

// Comment routes
router.post('/:id/comments', verifyToken, validate(commentContentSchema), projectController.addComment);
router.put('/:id/comments/:commentId', verifyToken, validate(commentContentSchema), projectController.editComment);
router.delete('/:id/comments/:commentId', verifyToken, projectController.deleteComment);

// Reply routes (nested under comments)
router.post('/:id/comments/:commentId/replies', verifyToken, validate(commentContentSchema), projectController.addReply);
router.put('/:id/comments/:commentId/replies/:replyId', verifyToken, validate(commentContentSchema), projectController.editReply);
router.delete('/:id/comments/:commentId/replies/:replyId', verifyToken, projectController.deleteReply);

module.exports = router;
