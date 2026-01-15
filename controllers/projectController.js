// Project Controller
// Handles all project-related business logic
const { getProjectsCollection, getUsersCollection, getNotificationsCollection, getActivitiesCollection, ObjectId } = require('../config/database');
const Project = require('../models/Project');
const { stripHtml, getPlainTextLength } = require('../utils/htmlStrip');

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

        // Strip HTML tags and validate plain text length
        const plainTextAbstract = stripHtml(req.body.abstract);
        if (plainTextAbstract.length < 50) {
            return res.status(400).json({
                message: `Abstract must be at least 50 characters long. Current length: ${plainTextAbstract.length} characters`
            });
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
                await exports.createNotification({
                    userId: project.authorId,
                    type: 'like',
                    relatedUserId: userId,
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
        console.error('Error toggling like:', error);
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
        console.error('Error toggling bookmark:', error);
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
        console.error('Error tracking view:', error);
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
            await exports.createNotification({
                userId: project.authorId,
                type: 'comment',
                relatedUserId: userId,
                projectId: project._id,
                projectTitle: project.title,
                commentId: comment._id,
                message: 'commented on your project'
            });
        }

        res.status(201).json({ message: 'Comment added', comment });
    } catch (error) {
        console.error('Error adding comment:', error);
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
        console.error('Error editing comment:', error);
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
        console.error('Error deleting comment:', error);
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
            await exports.createNotification({
                userId: comment.userId,
                type: 'reply',
                relatedUserId: userId,
                projectId: project._id,
                projectTitle: project.title,
                commentId: comment._id,
                message: 'replied to your comment'
            });
        }

        res.status(201).json({ message: 'Reply added', reply });
    } catch (error) {
        console.error('Error adding reply:', error);
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
        console.error('Error editing reply:', error);
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
        console.error('Error deleting reply:', error);
        res.status(500).json({ message: 'Error deleting reply' });
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
