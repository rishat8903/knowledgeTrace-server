// Admin Controller
// Handles admin-only operations
const { getProjectsCollection } = require('../config/database');
const Project = require('../models/Project');

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
        console.error('Error fetching all projects:', error);
        res.status(500).json({ message: 'Error fetching projects' });
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
        console.error('Error fetching pending projects:', error);
        res.status(500).json({ message: 'Error fetching pending projects' });
    }
};

module.exports = {
    getAllProjects: exports.getAllProjects,
    getPendingProjects: exports.getPendingProjects,
};
