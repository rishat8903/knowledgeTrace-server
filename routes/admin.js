// Admin routes
const express = require('express');
const router = express.Router();
const { getProjectsCollection } = require('../config/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const Project = require('../models/Project');

// Get all projects (admin only)
router.get('/projects', verifyToken, requireAdmin, async (req, res) => {
  try {
    const projectsCollection = await getProjectsCollection();
    const projects = await projectsCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(projects.map(p => new Project(p).toJSON()));
  } catch (error) {
    console.error('Error fetching all projects:', error);
    res.status(500).json({ message: 'Error fetching projects' });
  }
});

// Get pending projects
router.get('/projects/pending', verifyToken, requireAdmin, async (req, res) => {
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
});

module.exports = router;

