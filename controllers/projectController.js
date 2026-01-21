// Project Controller
// Handles all project-related business logic
const { getProjectsCollection, getUsersCollection, getNotificationsCollection, getActivitiesCollection, ObjectId } = require('../config/database');
const Project = require('../models/Project');
const logger = require('../config/logger');
const { stripHtml, getPlainTextLength } = require('../utils/htmlStrip');
const {
    createNotification,
    createProjectSubmissionNotification,
    createProjectStatusUpdateNotification
} = require('../utils/notificationHelper');

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
                logger.error('Error checking admin status in getAllProjects:', { error: error.message, uid: req.user.uid });
            }
        }

        // Filter by status (default to approved for non-authenticated users)
        let statusFilter = null;
        if (isAdmin) {
            // Admins can see all projects - no status filter
            logger.debug('Admin user fetching all projects');
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

        logger.debug('Fetching projects', { query });
        const projects = await projectsCollection.find(query).sort({ createdAt: -1 }).toArray();
        logger.info(`Found ${projects.length} projects`);

        // Log status distribution for debugging (especially for admins)
        if (isAdmin) {
            const statusCounts = {
                pending: projects.filter(p => p.status === 'pending').length,
                approved: projects.filter(p => p.status === 'approved').length,
                rejected: projects.filter(p => p.status === 'rejected').length,
            };
            logger.debug('Admin view project status distribution', statusCounts);
        }

        res.json(projects.map(p => new Project(p).toJSON()));
    } catch (error) {
        logger.error('Error fetching all projects:', { error: error.message });
        res.status(500).json({
            message: 'Error fetching projects',
            code: 'FETCH_PROJECTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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
            return res.status(404).json({
                message: 'Project not found',
                code: 'PROJECT_NOT_FOUND'
            });
        }

        // Only show approved projects to non-authenticated users
        if (!req.user && project.status !== 'approved') {
            return res.status(403).json({
                message: 'Project not available',
                code: 'ACCESS_DENIED'
            });
        }

        res.json(new Project(project).toJSON());
    } catch (error) {
        logger.error('Error fetching project by ID:', { error: error.message, id: req.params.id });
        res.status(500).json({
            message: 'Error fetching project',
            code: 'FETCH_PROJECT_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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
        logger.error('Error fetching user projects:', { error: error.message, userId: req.params.userId });
        res.status(500).json({
            message: 'Error fetching user projects',
            code: 'FETCH_USER_PROJECTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Create a new project
 */
exports.createProject = async (req, res) => {
    try {
        logger.info('Project submission attempt', { uid: req.user.uid, hasFile: !!req.file });

        const projectsCollection = await getProjectsCollection();

        // Basic input validation
        if (!req.body.title || typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
            return res.status(400).json({ message: 'Project title is required', code: 'VALIDATION_ERROR' });
        }
        if (req.body.title.length > 200) {
            return res.status(400).json({ message: 'Project title must be less than 200 characters', code: 'VALIDATION_ERROR' });
        }

        if (!req.body.abstract || typeof req.body.abstract !== 'string' || req.body.abstract.trim().length === 0) {
            return res.status(400).json({ message: 'Project abstract is required', code: 'VALIDATION_ERROR' });
        }

        // Strip HTML tags and validate plain text length
        const plainTextAbstract = stripHtml(req.body.abstract);
        if (plainTextAbstract.length < 100) {
            return res.status(400).json({
                message: `Abstract must be at least 100 characters long. Current length: ${plainTextAbstract.length} characters`,
                code: 'VALIDATION_ERROR'
            });
        }

        if (plainTextAbstract.length > 5000) {
            return res.status(400).json({ message: 'Project abstract must be less than 5000 characters', code: 'VALIDATION_ERROR' });
        }

        let pdfUrl = '';
        if (req.file) {
            try {
                const { uploadToCloudinary } = require('../utils/cloudinary');
                pdfUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname);
                if (!pdfUrl) {
                    return res.status(500).json({ message: 'Failed to upload PDF file. Please try again.', code: 'UPLOAD_ERROR' });
                }
            } catch (uploadError) {
                logger.error('PDF upload error during project creation:', { error: uploadError.message, uid: req.user.uid });
                return res.status(500).json({ message: 'Failed to upload PDF file. Please try again.', code: 'UPLOAD_ERROR' });
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

        // Handle supervisor - support both old (text) and new (ID) formats
        let supervisor = '';
        let supervisorId = '';
        let supervisorDepartment = '';

        if (req.body.supervisorId) {
            // New format: supervisorId provided
            supervisorId = String(req.body.supervisorId).trim();

            // Validate supervisor exists and has supervisor role
            const usersCollection = await getUsersCollection();
            const supervisorUser = await usersCollection.findOne({
                uid: supervisorId,
                role: 'supervisor'
            });

            if (!supervisorUser) {
                return res.status(400).json({
                    message: 'Selected supervisor not found or invalid role',
                    code: 'INVALID_SUPERVISOR'
                });
            }

            // Store supervisor details for denormalization (performance)
            supervisor = supervisorUser.name;
            supervisorDepartment = supervisorUser.department || '';

            logger.info('Supervisor validated for project', { supervisor, supervisorId });
        } else if (req.body.supervisor) {
            // Legacy format: supervisor name only (for backward compatibility)
            supervisor = String(req.body.supervisor).trim().substring(0, 100);
            supervisorId = ''; // No ID in legacy mode
            logger.warn('Legacy supervisor mode used', { supervisor, uid: req.user.uid });
        }

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
                        return res.status(400).json({ message: 'Invalid GitHub URL. Must be a github.com link.', code: 'VALIDATION_ERROR' });
                    }
                } catch {
                    return res.status(400).json({ message: 'Invalid GitHub URL format.', code: 'VALIDATION_ERROR' });
                }
            }
        }

        const projectData = {
            title,
            abstract,
            techStack,
            author,
            authorId: req.user.uid,
            supervisor, // Denormalized name for display
            supervisorId, // Reference to supervisor
            supervisorDepartment, // Denormalized for filtering
            year: validatedYear,
            githubLink,
            pdfUrl,
            tags,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Verify database connection before insert
        const { isConnected } = require('../config/database');
        if (!isConnected()) {
            return res.status(500).json({ message: 'Database connection error. Please try again.', code: 'DB_CONNECTION_ERROR' });
        }

        const result = await projectsCollection.insertOne(projectData);

        if (!result.acknowledged) {
            return res.status(500).json({ message: 'Failed to save project to database', code: 'DB_WRITE_ERROR' });
        }

        const project = await projectsCollection.findOne({ _id: result.insertedId });

        if (!project) {
            return res.status(500).json({ message: 'Project created but could not be retrieved', code: 'DB_RETRIEVAL_ERROR' });
        }

        // Create notification for admin
        try {
            await createProjectSubmissionNotification(
                req.user.uid,
                project.author || req.user.name || req.user.displayName || 'A student',
                project.title,
                project._id
            );
        } catch (notifError) {
            logger.warn('Could not send admin notification for new project:', { error: notifError.message, projectId: project._id });
        }

        res.status(201).json({ message: 'Project submitted successfully', project: new Project(project).toJSON() });
    } catch (error) {
        logger.error('Error creating project:', { error: error.message, uid: req.user.uid });
        res.status(500).json({
            message: 'Error creating project',
            code: 'CREATE_PROJECT_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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

        // Create notification for student
        if (status !== 'pending') { // Only notify if status changed to approved/rejected
            try {
                await createProjectStatusUpdateNotification(
                    project.authorId,
                    project.title,
                    status,
                    project._id
                );
            } catch (notifError) {
                logger.warn('Could not send student notification for status update:', { error: notifError.message, projectId: project._id });
            }
        }

        res.json({ message: 'Project status updated', project: new Project(updatedProject).toJSON() });
    } catch (error) {
        logger.error('Error updating project status:', { error: error.message, projectId: req.params.id });
        res.status(500).json({ message: 'Error updating project status' });
    }
};

/**
 * Update project details (owner or admin)
 */
exports.updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const projectsCollection = await getProjectsCollection();
        const usersCollection = await getUsersCollection();

        // Check if user is admin
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const isAdmin = user?.isAdmin || false;

        let project;
        if (ObjectId.isValid(id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(id) });
        } else {
            project = await projectsCollection.findOne({ _id: id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Check if user is admin or project owner
        if (!isAdmin && project.authorId !== req.user.uid) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Sanitize and validate input
        const updateData = { updatedAt: new Date() };

        if (req.body.title) updateData.title = String(req.body.title).trim().substring(0, 200);
        if (req.body.abstract) updateData.abstract = String(req.body.abstract).trim().substring(0, 5000);
        if (req.body.techStack) {
            let techStack = req.body.techStack;
            if (typeof techStack === 'string') {
                try { techStack = JSON.parse(techStack); }
                catch { techStack = techStack.split(',').map(t => t.trim()); }
            }
            if (Array.isArray(techStack)) updateData.techStack = techStack.slice(0, 20);
        }
        if (req.body.tags) {
            let tags = req.body.tags;
            if (typeof tags === 'string') {
                try { tags = JSON.parse(tags); }
                catch { tags = tags.split(',').map(t => t.trim()); }
            }
            if (Array.isArray(tags)) updateData.tags = tags.slice(0, 10);
        }
        if (req.body.year) {
            const year = parseInt(req.body.year);
            if (!isNaN(year)) updateData.year = year;
        }
        if (req.body.githubLink) updateData.githubLink = String(req.body.githubLink).trim().substring(0, 500);

        // Enhance updateProject to handle supervisorId
        if (req.body.supervisorId) {
            const supervisorId = String(req.body.supervisorId).trim();
            const supervisorUser = await usersCollection.findOne({ uid: supervisorId, role: 'supervisor' });
            if (supervisorUser) {
                updateData.supervisorId = supervisorId;
                updateData.supervisor = supervisorUser.name;
                updateData.supervisorDepartment = supervisorUser.department || '';
                logger.info('Supervisor updated for project via ID', { projectId: id, supervisorId });
            }
        } else if (req.body.supervisor) {
            const newSupervisorName = String(req.body.supervisor).trim().substring(0, 100);
            // Only update/clear if the name actually changed from what's currently stored
            if (newSupervisorName !== project.supervisor) {
                updateData.supervisor = newSupervisorName;
                updateData.supervisorId = ''; // Clear ID if name changed and no new ID provided
                updateData.supervisorDepartment = '';
                logger.info('Supervisor name updated for project (ID cleared)', { projectId: id, newName: newSupervisorName });
            }
        }

        await projectsCollection.updateOne(
            { _id: project._id },
            { $set: updateData }
        );

        const updatedProject = await projectsCollection.findOne({ _id: project._id });
        res.json({ message: 'Project updated successfully', project: new Project(updatedProject).toJSON() });
    } catch (error) {
        logger.error('Error updating project:', { error: error.message, projectId: req.params.id });
        res.status(500).json({
            message: 'Error updating project details',
            code: 'UPDATE_PROJECT_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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
        logger.error('Error deleting project:', { error: error.message, projectId: req.params.id });
        res.status(500).json({ message: 'Error deleting project' });
    }
};

/**
 * Toggle like on a project
 * POST /api/projects/:id/like
 */
exports.toggleLike = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const likes = project.likes || [];
        const hasLiked = likes.includes(userId);

        let updateOperation;
        if (hasLiked) {
            // Unlike
            updateOperation = {
                $pull: { likes: userId },
                $inc: { likeCount: -1 },
                $set: { updatedAt: new Date() }
            };
        } else {
            // Like
            updateOperation = {
                $addToSet: { likes: userId },
                $inc: { likeCount: 1 },
                $set: { updatedAt: new Date() }
            };

            // Create notification for project author (if not self-like)
            if (project.authorId && project.authorId !== userId) {
                await createNotification({
                    recipientId: project.authorId,
                    type: 'like',
                    senderId: userId,
                    projectId: project._id,
                    projectTitle: project.title,
                    message: 'liked your project'
                });
            }
        }

        await projectsCollection.updateOne({ _id: project._id }, updateOperation);
        const updatedProject = await projectsCollection.findOne({ _id: project._id });

        res.json({
            message: hasLiked ? 'Project unliked' : 'Project liked',
            project: new Project(updatedProject).toJSON()
        });
    } catch (error) {
        logger.error('Error toggling like:', { error: error.message, projectId: req.params.id, uid: req.user.uid });
        res.status(500).json({ message: 'Error toggling like' });
    }
};

/**
 * Toggle bookmark on a project
 * POST /api/projects/:id/bookmark
 */
exports.toggleBookmark = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const activitiesCollection = await getActivitiesCollection();
        const userId = req.user.uid;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Update or create activity record
        const activity = await activitiesCollection.findOne({ userId });
        const bookmarkedProjects = activity?.bookmarkedProjects || [];
        const isBookmarked = bookmarkedProjects.some(bp => bp.projectId.toString() === project._id.toString());

        if (isBookmarked) {
            // Remove bookmark
            await activitiesCollection.updateOne(
                { userId },
                { $pull: { bookmarkedProjects: { projectId: project._id } } },
                { upsert: true }
            );
        } else {
            // Add bookmark
            await activitiesCollection.updateOne(
                { userId },
                {
                    $push: {
                        bookmarkedProjects: {
                            projectId: project._id,
                            bookmarkedAt: new Date()
                        }
                    }
                },
                { upsert: true }
            );
        }

        // Update project bookmarks array
        const projectBookmarks = project.bookmarks || [];
        const projectUpdateOp = projectBookmarks.includes(userId)
            ? { $pull: { bookmarks: userId } }
            : { $addToSet: { bookmarks: userId } };

        await projectsCollection.updateOne({ _id: project._id }, projectUpdateOp);

        res.json({
            message: isBookmarked ? 'Bookmark removed' : 'Project bookmarked',
            isBookmarked: !isBookmarked
        });
    } catch (error) {
        logger.error('Error toggling bookmark:', { error: error.message, projectId: req.params.id, uid: req.user.uid });
        res.status(500).json({ message: 'Error toggling bookmark' });
    }
};

/**
 * Track project view
 * POST /api/projects/:id/view
 */
exports.trackView = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const activitiesCollection = await getActivitiesCollection();
        const userId = req.user?.uid;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Increment view count
        await projectsCollection.updateOne(
            { _id: project._id },
            { $inc: { views: 1 } }
        );

        // Track in user's recent projects (if authenticated)
        if (userId) {
            await activitiesCollection.updateOne(
                { userId },
                {
                    $pull: { recentProjects: { projectId: project._id } } // Remove if exists
                },
                { upsert: true }
            );

            await activitiesCollection.updateOne(
                { userId },
                {
                    $push: {
                        recentProjects: {
                            $each: [{
                                projectId: project._id,
                                projectTitle: project.title,
                                viewedAt: new Date()
                            }],
                            $position: 0,
                            $slice: 20 // Keep only 20 most recent
                        }
                    }
                },
                { upsert: true }
            );
        }

        res.json({ message: 'View tracked' });
    } catch (error) {
        logger.error('Error tracking project view:', { error: error.message, projectId: req.params.id });
        res.status(500).json({ message: 'Error tracking view' });
    }
};

/**
 * Add comment to project
 * POST /api/projects/:id/comments
 */
exports.addComment = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;
        const usersCollection = await getUsersCollection();

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const user = await usersCollection.findOne({ uid: userId });
        const comment = {
            _id: new ObjectId(),
            userId,
            userName: user?.name || user?.displayName || 'Anonymous',
            userPhotoURL: user?.photoURL || '',
            content: req.body.content,
            createdAt: new Date(),
            updatedAt: new Date(),
            replies: []
        };

        await projectsCollection.updateOne(
            { _id: project._id },
            {
                $push: { comments: comment },
                $inc: { commentCount: 1 },
                $set: { updatedAt: new Date() }
            }
        );

        // Create notification for project author (if not self-comment)
        if (project.authorId && project.authorId !== userId) {
            await createNotification({
                recipientId: project.authorId,
                type: 'comment',
                senderId: userId,
                projectId: project._id,
                projectTitle: project.title,
                commentId: comment._id,
                message: 'commented on your project'
            });
        }

        res.status(201).json({ message: 'Comment added', comment });
    } catch (error) {
        logger.error('Error adding comment:', { error: error.message, projectId: req.params.id });
        res.status(500).json({ message: 'Error adding comment' });
    }
};

/**
 * Edit comment
 * PUT /api/projects/:id/comments/:commentId
 */
exports.editComment = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const comments = project.comments || [];
        const commentIndex = comments.findIndex(c =>
            c._id.toString() === req.params.commentId
        );

        if (commentIndex === -1) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        // Check if user owns the comment
        if (comments[commentIndex].userId !== userId) {
            return res.status(403).json({ message: 'You can only edit your own comments' });
        }

        // Update comment
        comments[commentIndex].content = req.body.content;
        comments[commentIndex].updatedAt = new Date();

        await projectsCollection.updateOne(
            { _id: project._id },
            { $set: { comments, updatedAt: new Date() } }
        );

        res.json({ message: 'Comment updated', comment: comments[commentIndex] });
    } catch (error) {
        logger.error('Error editing comment:', { error: error.message, commentId: req.params.commentId });
        res.status(500).json({ message: 'Error editing comment' });
    }
};

/**
 * Delete comment
 * DELETE /api/projects/:id/comments/:commentId
 */
exports.deleteComment = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;
        const usersCollection = await getUsersCollection();

        // Check if user is admin
        const user = await usersCollection.findOne({ uid: userId });
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

        const comments = project.comments || [];
        const comment = comments.find(c => c._id.toString() === req.params.commentId);

        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        // Check if user owns the comment or is admin
        if (comment.userId !== userId && !isAdmin) {
            return res.status(403).json({ message: 'You can only delete your own comments' });
        }

        // Calculate total replies for commentCount adjustment
        const replyCount = comment.replies?.length || 0;

        await projectsCollection.updateOne(
            { _id: project._id },
            {
                $pull: { comments: { _id: new ObjectId(req.params.commentId) } },
                $inc: { commentCount: -(1 + replyCount) }, // Subtract comment + all its replies
                $set: { updatedAt: new Date() }
            }
        );

        res.json({ message: 'Comment deleted' });
    } catch (error) {
        logger.error('Error deleting comment:', { error: error.message, commentId: req.params.commentId });
        res.status(500).json({ message: 'Error deleting comment' });
    }
};

/**
 * Add reply to comment
 * POST /api/projects/:id/comments/:commentId/replies
 */
exports.addReply = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;
        const usersCollection = await getUsersCollection();

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const comments = project.comments || [];
        const commentIndex = comments.findIndex(c =>
            c._id.toString() === req.params.commentId
        );

        if (commentIndex === -1) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        const user = await usersCollection.findOne({ uid: userId });
        const reply = {
            _id: new ObjectId(),
            userId,
            userName: user?.name || user?.displayName || 'Anonymous',
            userPhotoURL: user?.photoURL || '',
            content: req.body.content,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        comments[commentIndex].replies = comments[commentIndex].replies || [];
        comments[commentIndex].replies.push(reply);

        await projectsCollection.updateOne(
            { _id: project._id },
            {
                $set: { comments, updatedAt: new Date() },
                $inc: { commentCount: 1 } // Replies count towards total comment count
            }
        );

        // Create notification for comment author (if not self-reply)
        const comment = comments[commentIndex];
        if (comment.userId && comment.userId !== userId) {
            await createNotification({
                recipientId: comment.userId,
                type: 'reply',
                senderId: userId,
                projectId: project._id,
                projectTitle: project.title,
                commentId: comment._id,
                message: 'replied to your comment'
            });
        }

        res.status(201).json({ message: 'Reply added', reply });
    } catch (error) {
        logger.error('Error adding reply:', { error: error.message, commentId: req.params.commentId });
        res.status(500).json({ message: 'Error adding reply' });
    }
};

/**
 * Edit reply
 * PUT /api/projects/:id/comments/:commentId/replies/:replyId
 */
exports.editReply = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;

        let project;
        if (ObjectId.isValid(req.params.id)) {
            project = await projectsCollection.findOne({ _id: new ObjectId(req.params.id) });
        } else {
            project = await projectsCollection.findOne({ _id: req.params.id });
        }

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const comments = project.comments || [];
        const commentIndex = comments.findIndex(c =>
            c._id.toString() === req.params.commentId
        );

        if (commentIndex === -1) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        const replies = comments[commentIndex].replies || [];
        const replyIndex = replies.findIndex(r =>
            r._id.toString() === req.params.replyId
        );

        if (replyIndex === -1) {
            return res.status(404).json({ message: 'Reply not found' });
        }

        // Check if user owns the reply
        if (replies[replyIndex].userId !== userId) {
            return res.status(403).json({ message: 'You can only edit your own replies' });
        }

        // Update reply
        replies[replyIndex].content = req.body.content;
        replies[replyIndex].updatedAt = new Date();
        comments[commentIndex].replies = replies;

        await projectsCollection.updateOne(
            { _id: project._id },
            { $set: { comments, updatedAt: new Date() } }
        );

        res.json({ message: 'Reply updated', reply: replies[replyIndex] });
    } catch (error) {
        logger.error('Error editing reply:', { error: error.message, replyId: req.params.replyId });
        res.status(500).json({ message: 'Error editing reply' });
    }
};

/**
 * Delete reply
 * DELETE /api/projects/:id/comments/:commentId/replies/:replyId
 */
exports.deleteReply = async (req, res) => {
    try {
        const projectsCollection = await getProjectsCollection();
        const userId = req.user.uid;
        const usersCollection = await getUsersCollection();

        // Check if user is admin
        const user = await usersCollection.findOne({ uid: userId });
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

        const comments = project.comments || [];
        const commentIndex = comments.findIndex(c =>
            c._id.toString() === req.params.commentId
        );

        if (commentIndex === -1) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        const replies = comments[commentIndex].replies || [];
        const reply = replies.find(r => r._id.toString() === req.params.replyId);

        if (!reply) {
            return res.status(404).json({ message: 'Reply not found' });
        }

        // Check if user owns the reply or is admin
        if (reply.userId !== userId && !isAdmin) {
            return res.status(403).json({ message: 'You can only delete your own replies' });
        }

        // Remove reply
        comments[commentIndex].replies = replies.filter(r =>
            r._id.toString() !== req.params.replyId
        );

        await projectsCollection.updateOne(
            { _id: project._id },
            {
                $set: { comments, updatedAt: new Date() },
                $inc: { commentCount: -1 } // Decrement total comment count
            }
        );

        res.json({ message: 'Reply deleted' });
    } catch (error) {
        logger.error('Error deleting reply:', { error: error.message, replyId: req.params.replyId });
        res.status(500).json({ message: 'Error deleting reply' });
    }
};



/**
 * View PDF - Proxy endpoint to serve PDFs with inline disposition
 * GET /api/projects/:id/pdf/view
 * Cloudinary raw resources force download, so we proxy them to allow inline viewing
 */
exports.viewPdf = async (req, res) => {
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

        if (!project.pdfUrl) {
            return res.status(404).json({ message: 'PDF not found for this project' });
        }

        // Fetch PDF from Cloudinary
        const https = require('https');
        const http = require('http');
        const url = require('url');

        const pdfUrl = project.pdfUrl;
        const parsedUrl = url.parse(pdfUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        protocol.get(pdfUrl, (cloudinaryResponse) => {
            if (cloudinaryResponse.statusCode !== 200) {
                return res.status(cloudinaryResponse.statusCode).json({
                    message: 'Error fetching PDF from storage'
                });
            }

            // Set headers for inline PDF viewing
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');

            // Pipe the PDF stream to response
            cloudinaryResponse.pipe(res);
        }).on('error', (error) => {
            logger.error('HTTP Error fetching PDF from Cloudinary:', { error: error.message, projectId: req.params.id });
            res.status(500).json({ message: 'Error loading PDF' });
        });
    } catch (error) {
        logger.error('Error in viewPdf controller:', { error: error.message, projectId: req.params.id });
        res.status(500).json({ message: 'Error loading PDF' });
    }
};
