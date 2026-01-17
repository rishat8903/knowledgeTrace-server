// Supervisor Routes
const express = require('express');
const router = express.Router();
const { verifyToken, checkRole, optionalAuth } = require('../middleware/auth');
const supervisorController = require('../controllers/supervisorController');

// Public: Get all supervisors (for dropdown selector in project submission)
router.get(
    '/',
    supervisorController.getAllSupervisors
);

// Public: Get supervisor profile with statistics
router.get(
    '/:id/profile',
    supervisorController.getSupervisorProfile
);

// Protected: Get supervised students (supervisor only or admin)
router.get(
    '/:id/students',
    verifyToken,
    supervisorController.getStudents
);

// Public: Get supervised projects (with filters)
router.get(
    '/:id/projects',
    supervisorController.getSupervisedProjects
);

// Protected: Get supervisor dashboard statistics
router.get(
    '/:id/stats',
    verifyToken,
    supervisorController.getStats
);

// Protected: Update supervisor profile
router.patch(
    '/:id/profile',
    verifyToken,
    supervisorController.updateProfile
);

// Student: Browse available supervisors with their work
router.get(
    '/browse',
    verifyToken,
    checkRole(['student']),
    supervisorController.browseSupervisors
);

// Student: Send collaboration request to supervisor
router.post(
    '/request',
    verifyToken,
    checkRole(['student']),
    supervisorController.sendRequest
);

// Student: Get their sent requests
router.get(
    '/my-requests',
    verifyToken,
    checkRole(['student']),
    supervisorController.getMyRequests
);

// Supervisor: Get pending requests sent to them
router.get(
    '/pending-requests',
    verifyToken,
    checkRole(['supervisor']),
    supervisorController.getPendingRequests
);

// Supervisor: Respond to collaboration request (approve/reject)
router.patch(
    '/request/:id/respond',
    verifyToken,
    checkRole(['supervisor']),
    supervisorController.respondToRequest
);

module.exports = router;

