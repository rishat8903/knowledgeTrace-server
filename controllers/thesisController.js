// Module A: Thesis Vault Controller
// Handles thesis archive, search, and duplicate detection

const {
    getProjectsCollection,
    getUsersCollection,
    ObjectId
} = require('../config/database');
const { checkDuplicate } = require('../utils/duplicateDetection');
const { thesisSearchSchema } = require('../validators/thesisSchemas');
const Project = require('../models/Project');

/**
 * Search theses with advanced filters
 * GET /api/thesis/search
 */
const searchTheses = async (req, res) => {
    try {
        // Validate query parameters
        const { error, value } = thesisSearchSchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                message: 'Invalid search parameters',
                errors: error.details.map(d => d.message)
            });
        }

        const {
            query,
            year,
            department,
            tags,
            supervisor,
            page,
            limit,
            sortBy,
            sortOrder
        } = value;

        const projectsCollection = await getProjectsCollection();

        // Build search filter
        const filter = {
            // Show public and finished/approved theses in vault
            visibility: 'public',
            status: { $in: ['approved', 'completed', 'archived'] }
        };

        // Text search on title, abstract, tags
        if (query) {
            filter.$text = { $search: query };
        }

        if (year) {
            filter.year = year;
        }

        if (department) {
            filter.department = department;
        }

        if (tags && tags.length > 0) {
            filter.tags = { $in: tags };
        }

        if (supervisor) {
            filter.supervisor = { $regex: supervisor, $options: 'i' };
        }

        // Calculate pagination
        const skip = (page - 1) * limit;
        const sortOptions = {
            [sortBy]: sortOrder === 'asc' ? 1 : -1
        };

        // Execute query with pagination
        const projects = await projectsCollection
            .find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .toArray();

        const totalCount = await projectsCollection.countDocuments(filter);

        res.json({
            success: true,
            projects: projects.map(p => new Project(p).toJSON()),
            pagination: {
                page,
                limit,
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        console.error('Error searching theses:', error);
        res.status(500).json({
            message: 'Error searching theses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get thesis details by ID
 * GET /api/thesis/:id
 */
const getThesisById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid thesis ID' });
        }

        const projectsCollection = await getProjectsCollection();
        const project = await projectsCollection.findOne({ _id: new ObjectId(id) });

        if (!project) {
            return res.status(404).json({ message: 'Thesis not found' });
        }

        // Increment view count
        await projectsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { views: 1 } }
        );

        // Get supervisor details
        let supervisorDetails = null;
        if (project.supervisorId) {
            const usersCollection = await getUsersCollection();
            const supervisor = await usersCollection.findOne({ uid: project.supervisorId });
            if (supervisor) {
                supervisorDetails = {
                    uid: supervisor.uid,
                    name: supervisor.name || supervisor.displayName,
                    email: supervisor.email,
                    department: supervisor.department,
                    researchAreas: supervisor.researchAreas || []
                };
            }
        }

        res.json({
            success: true,
            project: new Project({ ...project, views: (project.views || 0) + 1 }).toJSON(),
            supervisor: supervisorDetails
        });
    } catch (error) {
        console.error('Error fetching thesis:', error);
        res.status(500).json({
            message: 'Error fetching thesis details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Check for duplicate theses based on abstract
 * POST /api/thesis/check-duplicate
 */
const checkDuplicateThesis = async (req, res) => {
    try {
        const { abstract } = req.body;

        if (!abstract || abstract.length < 100) {
            return res.status(400).json({
                message: 'Abstract must be at least 100 characters'
            });
        }

        const projectsCollection = await getProjectsCollection();

        // Get all existing project abstracts
        const existingProjects = await projectsCollection
            .find(
                { abstract: { $exists: true, $ne: '' } },
                { projection: { _id: 1, title: 1, abstract: 1, year: 1 } }
            )
            .toArray();

        // Check for duplicates using 60% threshold (from user requirement)
        const duplicateCheck = checkDuplicate(abstract, existingProjects, 60);

        res.json({
            success: true,
            isDuplicate: duplicateCheck.isDuplicate,
            matches: duplicateCheck.matches,
            highestMatch: duplicateCheck.highestMatch,
            warning: duplicateCheck.isDuplicate
                ? 'Potential duplicate thesis detected. Please review similar projects before proceeding.'
                : null
        });
    } catch (error) {
        console.error('Error checking duplicate:', error);
        res.status(500).json({
            message: 'Error checking for duplicates',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get thesis repository statistics (Admin only)
 * GET /api/thesis/stats
 */
const getThesisStats = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();

        const stats = await projectsCollection.aggregate([
            {
                $facet: {
                    totalCount: [{ $count: 'count' }],
                    byYear: [
                        { $group: { _id: '$year', count: { $sum: 1 } } },
                        { $sort: { _id: -1 } }
                    ],
                    byDepartment: [
                        { $group: { _id: '$department', count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ],
                    byStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } }
                    ]
                }
            }
        ]).toArray();

        const result = stats[0];

        res.json({
            success: true,
            stats: {
                total: result.totalCount[0]?.count || 0,
                byYear: result.byYear,
                byDepartment: result.byDepartment,
                byStatus: result.byStatus
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            message: 'Error fetching repository statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    searchTheses,
    getThesisById,
    checkDuplicateThesis,
    getThesisStats,
};
