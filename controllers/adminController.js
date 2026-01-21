// Admin Controller
// Handles admin-only operations
const { getProjectsCollection } = require('../config/database');
const Project = require('../models/Project');
const logger = require('../config/logger');

/**
 * Get all projects (admin only)
 * Returns all projects regardless of status
 */
exports.getAllProjects = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const projects = await projectsCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.json(projects.map(p => new Project(p).toJSON()));
    } catch (error) {
        logger.error('Error fetching all projects (admin):', { error: error.message });
        res.status(500).json({
            message: 'Error fetching projects',
            code: 'FETCH_PROJECTS_ADMIN_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get pending projects (admin only)
 * Returns projects waiting for approval
 */
exports.getPendingProjects = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const projects = await projectsCollection
            .find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(projects.map(p => new Project(p).toJSON()));
    } catch (error) {
        logger.error('Error fetching pending projects (admin):', { error: error.message });
        res.status(500).json({
            message: 'Error fetching pending projects',
            code: 'FETCH_PENDING_PROJECTS_ADMIN_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getAllProjects: exports.getAllProjects,
    getPendingProjects: exports.getPendingProjects,
};
