// Notification Helper Utility
// Provides reusable functions for creating notifications across the application

const { getNotificationsCollection, getUsersCollection } = require('../config/database');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

/**
 * Create a notification for a user
 * @param {Object} params - Notification parameters
 * @param {string} params.recipientId - User ID of notification recipient (Firebase UID)
 * @param {string} params.senderId - User ID of notification sender (Firebase UID)
 * @param {string} params.senderName - Display name of sender (optional if sender info fetched)
 * @param {string} params.senderPhotoURL - Photo URL of sender (optional)
 * @param {string} params.type - Notification type (e.g., 'collab_request', 'project_status', 'admin_alert', etc.)
 * @param {string} params.message - Notification message text
 * @param {string} params.relatedLink - Link to relevant resource (optional)
 * @param {string} params.projectId - Related project ID (optional)
 * @param {string} params.projectTitle - Related project title (optional)
 * @param {string} params.commentId - Related comment ID (optional)
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
    projectTitle = '',
    commentId = null
}) {
    try {
        // Don't create notification if sender and recipient are the same
        if (recipientId === senderId && senderId !== 'system') {
            return { success: true, skipped: true };
        }

        const notificationsCollection = await getNotificationsCollection();
        const usersCollection = await getUsersCollection();

        // If sender details aren't provided fully, try to fetch from DB
        let finalSenderName = senderName;
        let finalSenderPhoto = senderPhotoURL;

        if (senderId && senderId !== 'system' && (!senderName || !senderPhotoURL)) {
            const senderUser = await usersCollection.findOne({ uid: senderId });
            if (senderUser) {
                finalSenderName = senderUser.name || senderUser.displayName || finalSenderName;
                finalSenderPhoto = senderUser.photoURL || finalSenderPhoto;
            }
        }

        const notification = new Notification({
            userId: recipientId,
            type: type,
            relatedUserId: senderId === 'system' ? null : senderId,
            relatedUserName: finalSenderName,
            relatedUserPhotoURL: finalSenderPhoto,
            projectId: projectId,
            projectTitle: projectTitle,
            commentId: commentId,
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
 * Notify all administrators
 */
async function notifyAdmins({ senderId, senderName, type, message, relatedLink, projectId, projectTitle }) {
    try {
        const usersCollection = await getUsersCollection();
        const admins = await usersCollection.find({ isAdmin: true }).toArray();

        const notifications = admins.map(admin => createNotification({
            recipientId: admin.uid,
            senderId,
            senderName,
            type,
            message,
            relatedLink,
            projectId,
            projectTitle
        }));

        await Promise.all(notifications);
        return { success: true, adminCount: admins.length };
    } catch (error) {
        logger.error('Error notifying admins:', error);
        return { success: false, error };
    }
}

/**
 * Create a notification for collaboration request
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

/**
 * Create a notification for project submission (to Admins and Student)
 */
async function createProjectSubmissionNotification(studentId, studentName, projectTitle, projectId) {
    // 1. Notify Admins
    await notifyAdmins({
        senderId: studentId,
        senderName: studentName,
        type: 'project_submission',
        message: `${studentName} submitted a new project: "${projectTitle}"`,
        relatedLink: `/admin`,
        projectId: projectId,
        projectTitle: projectTitle
    });

    // 2. Notify Student (Confirmation)
    return createNotification({
        recipientId: studentId,
        senderId: 'system',
        senderName: 'System',
        type: 'project_status',
        message: `Your project "${projectTitle}" has been submitted and is pending admin approval.`,
        relatedLink: `/my-work`,
        projectId: projectId,
        projectTitle: projectTitle
    });
}

/**
 * Create a notification for project status update (to Student)
 */
async function createProjectStatusUpdateNotification(studentId, projectTitle, status, projectId) {
    const message = status === 'approved'
        ? `Your project "${projectTitle}" has been approved!`
        : `Your project "${projectTitle}" was not approved. Please check the feedback.`;

    return createNotification({
        recipientId: studentId,
        senderId: 'system',
        senderName: 'System',
        type: 'project_status',
        message: message,
        relatedLink: `/project/${projectId}`,
        projectId: projectId,
        projectTitle: projectTitle
    });
}

/**
 * Create a notification for supervisor request (to Supervisor)
 */
async function createSupervisorRequestNotification(supervisorId, studentId, studentName, projectTitle = null, projectId = null) {
    return createNotification({
        recipientId: supervisorId,
        senderId: studentId,
        senderName: studentName,
        type: 'supervisor_request',
        message: `${studentName} sent you a supervision request${projectTitle ? ` for "${projectTitle}"` : ''}.`,
        relatedLink: `/supervisor/dashboard`,
        projectId: projectId,
        projectTitle: projectTitle || 'Project Request'
    });
}

/**
 * Create a notification for supervisor response (to Student)
 */
async function createSupervisorResponseNotification(studentId, supervisorId, supervisorName, status, projectTitle = null, projectId = null) {
    const statusText = status === 'approved' ? 'accepted' : 'declined';
    return createNotification({
        recipientId: studentId,
        senderId: supervisorId,
        senderName: supervisorName,
        type: 'supervisor_response',
        message: `Supervisor ${supervisorName} ${statusText} your request${projectTitle ? ` for "${projectTitle}"` : ''}.`,
        relatedLink: projectId ? `/project/${projectId}` : `/dashboard`,
        projectId: projectId,
        projectTitle: projectTitle || 'Supervision Response'
    });
}

/**
 * Create a notification for team invitation (to Invited Student)
 */
async function createTeamInvitationNotification(invitedId, inviterId, inviterName, projectTitle, projectId) {
    return createNotification({
        recipientId: invitedId,
        senderId: inviterId,
        senderName: inviterName,
        type: 'team_invitation',
        message: `${inviterName} invited you to join their project: "${projectTitle}"`,
        relatedLink: `/student/workflow`,
        projectId: projectId,
        projectTitle: projectTitle
    });
}

module.exports = {
    createNotification,
    notifyAdmins,
    createCollabRequestNotification,
    createProjectSubmissionNotification,
    createProjectStatusUpdateNotification,
    createSupervisorRequestNotification,
    createSupervisorResponseNotification,
    createTeamInvitationNotification
};
