// Collaboration Post Controller
const { getUsersCollection, ObjectId } = require('../config/database');
const logger = require('../config/logger');
const CollabPost = require('../models/CollabPost');
const catchAsync = require('../utils/catchAsync');
const { createCollabRequestNotification } = require('../utils/notificationHelper');

// Helper function to get collab posts collection
async function getCollabPostsCollection() {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    return db.collection('collabPosts');
}

/**
 * Create a new collaboration post
 * POST /api/collab
 */
exports.createCollabPost = catchAsync(async (req, res) => {
    const { title, description, skillsRequired, projectType } = req.body;
    const userId = req.user.uid;

    const collabPostsCollection = await getCollabPostsCollection();

    // Create new collab post
    const collabPost = new CollabPost({
        title,
        description,
        owner: userId,
        skillsRequired,
        projectType: projectType || 'Thesis',
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // Save to MongoDB
    const result = await collabPostsCollection.insertOne(collabPost.toJSON());
    const savedPost = await collabPostsCollection.findOne({ _id: result.insertedId });

    logger.info(`Collaboration post created: ${result.insertedId} by user: ${userId}`);

    res.status(201).json({
        success: true,
        message: 'Collaboration post created successfully',
        post: new CollabPost(savedPost).toJSON(),
    });
});

/**
 * Get all collaboration posts with optional filtering
 * GET /api/collab?projectType=Thesis&skill=Python&status=OPEN
 */
exports.getAllCollabPosts = catchAsync(async (req, res) => {
    const { projectType, skill, status = 'OPEN' } = req.query;

    const collabPostsCollection = await getCollabPostsCollection();
    const usersCollection = await getUsersCollection();

    let query = {};

    // Apply filters
    if (projectType && projectType !== 'All') {
        query.projectType = projectType;
    }

    if (status && status !== 'All') {
        query.status = status;
    }

    // Fetch posts sorted by creation date (newest first)
    const posts = await collabPostsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

    // Populate owner information for each post
    const populatedPosts = await Promise.all(
        posts.map(async (post) => {
            const postData = { ...post };

            // Populate owner information
            if (postData.owner) {
                try {
                    const user = await usersCollection.findOne({ uid: postData.owner });
                    if (user) {
                        postData.owner = {
                            uid: postData.owner,
                            name: user.name || user.displayName,
                            displayName: user.displayName || user.name,
                            photoURL: user.photoURL,
                        };
                    }
                } catch (err) {
                    logger.warn(`Could not populate owner for post ${post._id}:`, err);
                }
            }

            return postData;
        })
    );

    // Filter by skill if provided (client-side filtering)
    let filteredPosts = populatedPosts;
    if (skill) {
        const skillLower = skill.toLowerCase();
        filteredPosts = populatedPosts.filter(post =>
            post.skillsRequired?.some(s => s.toLowerCase().includes(skillLower))
        );
    }

    res.status(200).json({
        success: true,
        count: filteredPosts.length,
        posts: filteredPosts,
    });
});

/**
 * Get collaboration posts by specific user
 * GET /api/collab/user/:userId
 */
exports.getUserCollabPosts = catchAsync(async (req, res) => {
    const { userId } = req.params;

    const collabPostsCollection = await getCollabPostsCollection();
    const usersCollection = await getUsersCollection();

    const posts = await collabPostsCollection
        .find({ owner: userId })
        .sort({ createdAt: -1 })
        .toArray();

    // Populate owner info for all posts
    let ownerInfo = null;
    if (posts.length > 0) {
        try {
            const user = await usersCollection.findOne({ uid: userId });
            if (user) {
                ownerInfo = {
                    uid: userId,
                    name: user.name || user.displayName,
                    displayName: user.displayName || user.name,
                    photoURL: user.photoURL,
                };
            }
        } catch (err) {
            logger.warn(`Could not populate owner for user ${userId} posts:`, err);
        }
    }

    const populatedPosts = posts.map(post => ({
        ...post,
        owner: ownerInfo || post.owner,
    }));

    res.status(200).json({
        success: true,
        count: populatedPosts.length,
        posts: populatedPosts,
    });
});

/**
 * Update collaboration post status (OPEN/CLOSED)
 * PATCH /api/collab/:id/status
 */
exports.updateCollabStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.uid;

    const collabPostsCollection = await getCollabPostsCollection();

    // Get the post
    let post;
    if (ObjectId.isValid(id)) {
        post = await collabPostsCollection.findOne({ _id: new ObjectId(id) });
    } else {
        post = await collabPostsCollection.findOne({ _id: id });
    }

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Collaboration post not found',
        });
    }

    // Check ownership
    if (post.owner !== userId) {
        return res.status(403).json({
            success: false,
            message: 'You are not authorized to update this post',
        });
    }

    // Update status
    await collabPostsCollection.updateOne(
        { _id: post._id },
        { $set: { status, updatedAt: new Date() } }
    );

    const updatedPost = await collabPostsCollection.findOne({ _id: post._id });

    logger.info(`Collaboration post ${id} status updated to ${status} by user ${userId}`);

    res.status(200).json({
        success: true,
        message: 'Collaboration post status updated',
        post: new CollabPost(updatedPost).toJSON(),
    });
});

/**
 * Delete collaboration post
 * DELETE /api/collab/:id
 */
exports.deleteCollabPost = catchAsync(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.uid;

    const collabPostsCollection = await getCollabPostsCollection();

    // Get the post
    let post;
    if (ObjectId.isValid(id)) {
        post = await collabPostsCollection.findOne({ _id: new ObjectId(id) });
    } else {
        post = await collabPostsCollection.findOne({ _id: id });
    }

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Collaboration post not found',
        });
    }

    // Check ownership
    if (post.owner !== userId) {
        return res.status(403).json({
            success: false,
            message: 'You are not authorized to delete this post',
        });
    }

    // Delete the post
    await collabPostsCollection.deleteOne({ _id: post._id });

    logger.info(`Collaboration post ${id} deleted by user ${userId}`);

    res.status(200).json({
        success: true,
        message: 'Collaboration post deleted successfully',
    });
});

/**
 * Apply to collaboration post
 * POST /api/collab/:id/apply
 */
exports.applyToCollabPost = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user.uid;

    const collabPostsCollection = await getCollabPostsCollection();
    const usersCollection = await getUsersCollection();

    // Get the post
    let post;
    if (ObjectId.isValid(id)) {
        post = await collabPostsCollection.findOne({ _id: new ObjectId(id) });
    } else {
        post = await collabPostsCollection.findOne({ _id: id });
    }

    if (!post) {
        return res.status(404).json({
            success: false,
            message: 'Collaboration post not found',
        });
    }

    // Check if user is trying to apply to their own post
    if (post.owner === userId) {
        return res.status(400).json({
            success: false,
            message: 'You cannot apply to your own collaboration post',
        });
    }

    // Get applicant user info
    const applicant = await usersCollection.findOne({ uid: userId });

    // Create notification for post owner
    await createCollabRequestNotification(
        post.owner,
        userId,
        applicant?.displayName || applicant?.name || 'Someone',
        applicant?.photoURL || '',
        post.title,
        post._id.toString()
    );

    logger.info(`User ${userId} applied to collab post ${id}`);

    res.status(200).json({
        success: true,
        message: 'Application sent! The post owner will be notified.',
    });
});

