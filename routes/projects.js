// Project routes - Refactored to use controllers
const express = require('express');
const router = express.Router();
const { verifyToken, optionalAuth } = require('../middleware/auth');
const projectController = require('../controllers/projectController');
const { validate } = require('../middleware/validate');
const { createProjectSchema, updateProjectStatusSchema, projectQuerySchema } = require('../validators/projectValidator');
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

// Project routes with validation
router.get('/', optionalAuth, validate(projectQuerySchema, 'query'), projectController.getAllProjects);
router.get('/user/:userId', verifyToken, projectController.getUserProjects);
router.get('/:id', optionalAuth, projectController.getProjectById);
router.post('/', verifyToken, upload.single('pdf'), validate(createProjectSchema), projectController.createProject);
router.patch('/:id/status', verifyToken, validate(updateProjectStatusSchema), projectController.updateProjectStatus);
router.delete('/:id', verifyToken, projectController.deleteProject);

module.exports = router;
