// Admin routes - Refactored to use controllers
const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Admin routes
router.get('/projects', verifyToken, requireAdmin, adminController.getAllProjects);
router.get('/projects/pending', verifyToken, requireAdmin, adminController.getPendingProjects);

module.exports = router;
