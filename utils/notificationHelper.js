// Notification Helper Utility
// Provides reusable functions for creating notifications across the application

const { getNotificationsCollection } = require('../config/database');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

/**
 * Create a notification for a user
 * @param {Object} params - Notification parameters
 * @param {string} params.recipientId - User ID of notification recipient (Firebase UID)
 * @param {string} params.senderId - User ID of notification sender (Firebase UID)
 * @param {string} params.senderName - Display name of sender
 * @param {string} params.senderPhotoURL - Photo URL of sender
 * @param {string} params.type - Notification type (e.g., 'collab_request', 'comment', 'reply', etc.)
 * @param {string} params.message - Notification message text
 * @param {string} params.relatedLink - Link to relevant resource (optional)
 * @param {string} params.projectId - Related project ID (optional)
 * @param {string} params.projectTitle - Related project title (optional)
 * @returns {Promise<Object>} Success status
 */
async function createNotification({
    recipientId,
    senderId,
    senderName = 'Someone',
    senderPhotoURL = '',
    type,
    message,
    relatedLink = '',
    projectId = null,
    projectTitle = ''
}) {
    try {
        // Don't create notification if sender and recipient are the same
        if (recipientId === senderId) {
            return { success: true, skipped: true };
        }

        const notificationsCollection = await getNotificationsCollection();

        const notification = new Notification({
            userId: recipientId,
            type: type,
            relatedUserId: senderId,
            relatedUserName: senderName,
            relatedUserPhotoURL: senderPhotoURL,
            projectId: projectId,
            projectTitle: projectTitle,
            message: message,
            relatedLink: relatedLink,
            read: false,
            createdAt: new Date()
        });

        await notificationsCollection.insertOne(notification.toJSON());

        logger.info(`Notification created for user ${recipientId}: ${type}`);
        return { success: true };
    } catch (error) {
        logger.error('Error creating notification:', error);
        return { success: false, error };
    }
}

/**
 * Create a notification for collaboration request
 * @param {string} postOwnerId - Owner of the collaboration post
 * @param {string} applicantId - User applying to the post
 * @param {string} applicantName - Name of applicant
 * @param {string} applicantPhotoURL - Photo of applicant
 * @param {string} postTitle - Title of the collaboration post
 * @param {string} postId - ID of the collaboration post
 */
async function createCollabRequestNotification(postOwnerId, applicantId, applicantName, applicantPhotoURL, postTitle, postId) {
    return createNotification({
        recipientId: postOwnerId,
        senderId: applicantId,
        senderName: applicantName,
        senderPhotoURL: applicantPhotoURL,
        type: 'collab_request',
        message: `${applicantName} is interested in your collaboration post: "${postTitle}"`,
        relatedLink: `/collaborate`,
        projectId: postId,
        projectTitle: postTitle
    });
}

module.exports = {
    createNotification,
    createCollabRequestNotification
};
