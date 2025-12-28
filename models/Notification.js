// Notification model for user notifications
class Notification {
  constructor(data = {}) {
    this._id = data._id || null;
    this.userId = data.userId || ''; // Firebase UID - recipient
    this.type = data.type || ''; // 'comment', 'reply', 'like'
    this.relatedUserId = data.relatedUserId || ''; // User who triggered the notification
    this.relatedUserName = data.relatedUserName || '';
    this.relatedUserPhotoURL = data.relatedUserPhotoURL || '';
    this.projectId = data.projectId || null;
    this.projectTitle = data.projectTitle || '';
    this.commentId = data.commentId || null; // Optional, for replies
    this.relatedLink = data.relatedLink || ''; // Custom link for navigation
    this.message = data.message || ''; // Pre-formatted message
    this.read = data.read !== undefined ? data.read : false;
    this.createdAt = data.createdAt || new Date();
  }

  toJSON() {
    return {
      _id: this._id,
      userId: this.userId,
      type: this.type,
      relatedUserId: this.relatedUserId,
      relatedUserName: this.relatedUserName,
      relatedUserPhotoURL: this.relatedUserPhotoURL,
      projectId: this.projectId,
      projectTitle: this.projectTitle,
      commentId: this.commentId,
      relatedLink: this.relatedLink,
      message: this.message,
      read: this.read,
      createdAt: this.createdAt,
    };
  }
}

module.exports = Notification;

