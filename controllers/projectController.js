// Project Controller
// Handles all project-related business logic
const { getProjectsCollection, getUsersCollection, getNotificationsCollection, getActivitiesCollection, ObjectId } = require('../config/database');
const Project = require('../models/Project');

/**
 * Get all projects with optional filters
 * Handles admin/user/guest access control and search/filter functionality
 */
exports.getAllProjects = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const usersCollection = await getUsersCollection();
        const query = {};

        // Check if user is admin by querying database
        let isAdmin = false;
        if (req.user && req.user.uid) {
            try {
                const user = await usersCollection.findOne({ uid: req.user.uid });
                isAdmin = user?.isAdmin === true;
            } catch (error) {
                console.error('Error checking admin status:', error);
            }
        }

        // Filter by status (default to approved for non-authenticated users)
        let statusFilter = null;
        if (isAdmin) {
            // Admins can see all projects - no status filter
            console.log('👤 Admin user detected - returning all projects');
        } else if (req.user && req.user.uid) {
            // Authenticated users can see approved projects AND their own pending projects
            statusFilter = {
                $or: [
                    { status: 'approved' },
                    { status: 'pending', authorId: req.user.uid }
                ]
            };
        } else {
            // Non-authenticated users only see approved projects
            query.status = 'approved';
        }

        // Apply filters with sanitization to prevent NoSQL injection
        if (req.query.techStack) {
            const sanitizedTechStack = String(req.query.techStack)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .substring(0, 100);
            if (sanitizedTechStack.length > 0) {
                query.techStack = { $regex: sanitizedTechStack, $options: 'i' };
            }
        }

        if (req.query.author) {
            const sanitizedAuthor = String(req.query.author)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .substring(0, 100);
            if (sanitizedAuthor.length > 0) {
                query.author = { $regex: sanitizedAuthor, $options: 'i' };
            }
        }

        if (req.query.year) {
            const year = parseInt(req.query.year);
            if (!isNaN(year) && year >= 2000 && year <= new Date().getFullYear() + 1) {
                query.year = year;
            }
        }

        if (req.query.supervisor) {
            const sanitizedSupervisor = String(req.query.supervisor)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .substring(0, 100);
            if (sanitizedSupervisor.length > 0) {
                query.supervisor = { $regex: sanitizedSupervisor, $options: 'i' };
            }
        }

        // Handle keywords search - combine with status filter if needed
        if (req.query.keywords) {
            const sanitizedKeywords = String(req.query.keywords)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .substring(0, 200);
            if (sanitizedKeywords.length > 0) {
                const keywordFilter = {
                    $or: [
                        { title: { $regex: sanitizedKeywords, $options: 'i' } },
                        { abstract: { $regex: sanitizedKeywords, $options: 'i' } },
                        { tags: { $regex: sanitizedKeywords, $options: 'i' } },
                    ]
                };

                if (statusFilter) {
                    query.$and = [statusFilter, keywordFilter];
                } else {
                    query.$or = keywordFilter.$or;
                }
            } else if (statusFilter) {
                query.$and = [statusFilter];
            }
        } else if (statusFilter) {
            query.$and = [statusFilter];
        }

        console.log('🔍 Fetching projects with query:', JSON.stringify(query, null, 2));
        const projects = await projectsCollection.find(query).sort({ createdAt: -1 }).toArray();
        console.log(`✅ Found ${projects.length} projects`);

        // Log status distribution for debugging (especially for admins)
        if (isAdmin) {
            const statusCounts = {
                pending: projects.filter(p => p.status === 'pending').length,
                approved: projects.filter(p => p.status === 'approved').length,
                rejected: projects.filter(p => p.status === 'rejected').length,
            };
            console.log('📊 Admin view - Projects by status:', statusCounts);
        }

        res.json(projects.map(p => new Project(p).toJSON()));
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ message: 'Error fetching projects' });
    }
};

/**
 * Get a single project by ID
 */
exports.getProjectById = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Only show approved projects to non-authenticated users
        if (!req.user && project.status !== 'approved') {
            return res.status(403).json({ message: 'Project not available' });
        }

        res.json(new Project(project).toJSON());
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ message: 'Error fetching project' });
    }
};

/**
 * Get projects by user ID
 */
exports.getUserProjects = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.params.userId === 'me' ? req.user.uid : req.params.userId;

        // Only allow users to see their own projects unless they're admin
        if (userId !== req.user.uid && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const projects = await projectsCollection
            .find({ authorId: userId })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(projects.map(p => new Project(p).toJSON()));
    } catch (error) {
        console.error('Error fetching user projects:', error);
        res.status(500).json({ message: 'Error fetching user projects' });
    }
};

/**
 * Create a new project
 */
exports.createProject = async (req, res) => {
    try {
        console.log('📥 Received project submission request');
        console.log('📋 Request body keys:', Object.keys(req.body));
        console.log('📄 File uploaded:', req.file ? 'Yes' : 'No');

        const projectsCollection = await getProjectsCollection();

        // Basic input validation
        if (!req.body.title || typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
            return res.status(400).json({ message: 'Project title is required' });
        }
        if (req.body.title.length > 200) {
            return res.status(400).json({ message: 'Project title must be less than 200 characters' });
        }

        if (!req.body.abstract || typeof req.body.abstract !== 'string' || req.body.abstract.trim().length === 0) {
            return res.status(400).json({ message: 'Project abstract is required' });
        }
        if (req.body.abstract.length > 5000) {
            return res.status(400).json({ message: 'Project abstract must be less than 5000 characters' });
        }

        let pdfUrl = '';
        if (req.file) {
            try {
                const { uploadToCloudinary } = require('../utils/cloudinary');
                pdfUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname);
                if (!pdfUrl) {
                    return res.status(500).json({ message: 'Failed to upload PDF file. Please try again.' });
                }
            } catch (uploadError) {
                console.error('PDF upload error:', uploadError);
                return res.status(500).json({ message: 'Failed to upload PDF file. Please try again.' });
            }
        }

        // Parse and sanitize techStack
        let techStack = req.body.techStack;
        if (typeof techStack === 'string') {
            try {
                techStack = JSON.parse(techStack);
            } catch {
                techStack = techStack.split(',').map(t => t.trim()).filter(t => t && t.length <= 50);
            }
        }
        if (!Array.isArray(techStack)) {
            techStack = [];
        }
        techStack = techStack.slice(0, 20).map(tech => String(tech).substring(0, 50));

        // Parse and sanitize tags
        let tags = req.body.tags;
        if (typeof tags === 'string') {
            try {
                tags = JSON.parse(tags);
            } catch {
                tags = tags.split(',').map(t => t.trim()).filter(t => t && t.length <= 50);
            }
        }
        if (!Array.isArray(tags)) {
            tags = [];
        }
        tags = tags.slice(0, 10).map(tag => String(tag).substring(0, 50));

        // Sanitize and validate other fields
        const title = String(req.body.title).trim().substring(0, 200);
        const abstract = String(req.body.abstract).trim().substring(0, 5000);
        const author = req.body.author ? String(req.body.author).trim().substring(0, 100) : req.user.name || 'Anonymous';
        const supervisor = req.body.supervisor ? String(req.body.supervisor).trim().substring(0, 100) : '';
        const year = parseInt(req.body.year);
        const validatedYear = (!isNaN(year) && year >= 2000 && year <= new Date().getFullYear() + 1)
            ? year
            : new Date().getFullYear();

        // Validate GitHub link format if provided
        let githubLink = '';
        if (req.body.githubLink) {
            const githubUrl = String(req.body.githubLink).trim();
            if (githubUrl.length > 0) {
                try {
                    const url = new URL(githubUrl);
                    if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
                        githubLink = githubUrl.substring(0, 500);
                    } else {
                        return res.status(400).json({ message: 'Invalid GitHub URL. Must be a github.com link.' });
                    }
                } catch {
                    return res.status(400).json({ message: 'Invalid GitHub URL format.' });
                }
            }
        }

        const projectData = {
            title,
            abstract,
            techStack,
            author,
            authorId: req.user.uid,
            supervisor,
            year: validatedYear,
            githubLink,
            pdfUrl,
            tags,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        console.log('📝 Submitting project:', {
            title: projectData.title,
            author: projectData.author,
            authorId: projectData.authorId,
            status: projectData.status
        });

        // Verify database connection before insert
        const { isConnected } = require('../config/database');
        if (!isConnected()) {
            console.error('❌ Database not connected!');
            return res.status(500).json({ message: 'Database connection error. Please try again.' });
        }

        console.log('💾 Inserting project into MongoDB...');
        const result = await projectsCollection.insertOne(projectData);
        console.log('✅ Insert result:', {
            acknowledged: result.acknowledged,
            insertedId: result.insertedId
        });

        if (!result.acknowledged) {
            console.error('❌ Insert was not acknowledged by MongoDB');
            return res.status(500).json({ message: 'Failed to save project to database' });
        }

        const project = await projectsCollection.findOne({ _id: result.insertedId });

        if (!project) {
            console.error('❌ Failed to retrieve inserted project');
            return res.status(500).json({ message: 'Project created but could not be retrieved' });
        }

        console.log('✅ Project created successfully:', {
            id: project._id,
            title: project.title,
            status: project.status
        });

        res.status(201).json({ message: 'Project submitted successfully', project: new Project(project).toJSON() });
    } catch (error) {
        console.error('Error submitting project:', error);
        res.status(500).json({ message: error.message || 'Error submitting project' });
    }
};

/**
 * Update project status (admin or owner)
 */
exports.updateProjectStatus = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const usersCollection = await getUsersCollection();

        // Check if user is admin
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const isAdmin = user?.isAdmin || false;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user is admin or project owner
        if (!isAdmin && project.authorId !== req.user.uid) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { status } = req.body;
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        await projectsCollection.updateOne(
            { _id: project._id },
            { $set: { status, updatedAt: new Date() } }
        );

        const updatedProject = await projectsCollection.findOne({ _id: project._id });
        res.json({ message: 'Project status updated', project: new Project(updatedProject).toJSON() });
    } catch (error) {
        console.error('Error updating project status:', error);
        res.status(500).json({ message: 'Error updating project status' });
    }
};

/**
 * Delete a project (owner or admin only)
 */
exports.deleteProject = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const usersCollection = await getUsersCollection();

        // Check if user is admin
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const isAdmin = user?.isAdmin || false;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user is admin or project owner
        if (!isAdmin && project.authorId !== req.user.uid) {
            return res.status(403).json({ message: 'Access denied. Only project owners can delete projects.' });
        }

        // Delete project
        await projectsCollection.deleteOne({ _id: project._id });

        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ message: 'Error deleting project' });
    }
};

// Export helper function for creating notifications (used by other controllers)
exports.createNotification = async (notificationData) => {
    try {
        const notificationsCollection = await getNotificationsCollection();
        const usersCollection = await getUsersCollection();

        // Get user info for notification
        const relatedUser = await usersCollection.findOne({ uid: notificationData.relatedUserId });

        const notification = {
            userId: notificationData.userId,
            type: notificationData.type,
            relatedUserId: notificationData.relatedUserId,
            relatedUserName: relatedUser?.name || relatedUser?.displayName || 'Someone',
            relatedUserPhotoURL: relatedUser?.photoURL || '',
            projectId: notificationData.projectId,
            projectTitle: notificationData.projectTitle || '',
            commentId: notificationData.commentId || null,
            message: notificationData.message || '',
            read: false,
            createdAt: new Date(),
        };

        await notificationsCollection.insertOne(notification);
    } catch (error) {
        console.error('Error creating notification:', error);
        // Don't throw - notifications are non-critical
    }
};
