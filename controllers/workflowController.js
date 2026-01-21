// Module B: Workflow Controller
// Handles approval workflow, project state transitions, and milestone tracking

const {
    getProjectsCollection,
    getProjectMilestonesCollection,
    getProjectCommentsCollection,
    getUsersCollection,
    ObjectId
} = require('../config/database');
const { workflowReviewSchema, projectCommentSchema } = require('../validators/thesisSchemas');
const Project = require('../models/Project');
const ProjectMilestone = require('../models/ProjectMilestone');
const ProjectComment = require('../models/ProjectComment');
const logger = require('../config/logger');
const {
    createNotification,
    createProjectStatusUpdateNotification,
    createSupervisorRequestNotification
} = require('../utils/notificationHelper');

/**
 * Get all pending approvals for supervisor
 * GET /api/workflow/pending
 */
const getPendingApprovals = async (req, res) => {
    try {
        const supervisorUid = req.user.uid;

        const projectsCollection = await getProjectsCollection();

        // Find all projects assigned to this supervisor awaiting review
        const pendingProjects = await projectsCollection
            .find({
                supervisorId: supervisorUid,
                status: { $in: ['supervisor_review', 'mid_defense', 'final_submission'] }
            })
            .sort({ updatedAt: -1 })
            .toArray();

        // Get student details for each project
        const usersCollection = await getUsersCollection();
        const enrichedProjects = await Promise.all(
            pendingProjects.map(async (project) => {
                const students = await usersCollection
                    .find({ uid: { $in: project.studentIds || [project.authorId] } })
                    .project({ uid: 1, name: 1, email: 1, displayName: 1 })
                    .toArray();

                return {
                    ...new Project(project).toJSON(),
                    students: students.map(s => ({
                        uid: s.uid,
                        name: s.name || s.displayName,
                        email: s.email
                    }))
                };
            })
        );

        res.json({
            success: true,
            count: enrichedProjects.length,
            projects: enrichedProjects
        });
    } catch (error) {
        logger.error('Error fetching pending approvals:', { error: error.message, uid: req.user.uid });
        res.status(500).json({
            message: 'Error fetching pending approvals',
            code: 'FETCH_PENDING_APPROVALS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Submit project proposal for supervisor review
 * POST /api/workflow/submit-proposal
 */
const submitProposal = async (req, res) => {
    try {
        const { projectId } = req.body;
        const studentUid = req.user.uid;

        if (!ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const projectsCollection = await getProjectsCollection();
        const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Verify student is project owner
        if (project.authorId !== studentUid) {
            return res.status(403).json({ message: 'Only project owner can submit proposal' });
        }

        // Check if project has supervisor assigned
        if (!project.supervisorId) {
            return res.status(400).json({
                message: 'Project must have a supervisor assigned before submission'
            });
        }

        // Check current status
        if (project.status !== 'draft') {
            return res.status(400).json({
                message: `Cannot submit proposal from status: ${project.status}`
            });
        }

        // Update to pending_proposal, then auto-transition to supervisor_review
        await projectsCollection.updateOne(
            { _id: new ObjectId(projectId) },
            {
                $set: {
                    status: 'supervisor_review',
                    updatedAt: new Date()
                }
            }
        );

        // Create milestone for proposal phase
        const milestonesCollection = await getProjectMilestonesCollection();
        const milestone = new ProjectMilestone({
            projectId: projectId,
            phase: 'proposal',
            status: 'in_progress',
            createdAt: new Date()
        });

        await milestonesCollection.insertOne(milestone.toJSON());

        // Send notification to supervisor
        try {
            const usersCollection = await getUsersCollection();
            const student = await usersCollection.findOne({ uid: studentUid });

            await createSupervisorRequestNotification(
                project.supervisorId,
                studentUid,
                student?.name || student?.displayName || 'A student',
                project.title,
                project._id
            );
        } catch (notifError) {
            logger.warn('Could not send supervisor notification for proposal:', { error: notifError.message, supervisorId: project.supervisorId });
        }

        res.json({
            success: true,
            message: 'Proposal submitted successfully',
            newStatus: 'supervisor_review'
        });
    } catch (error) {
        logger.error('Error submitting proposal:', { error: error.message, projectId: req.body.projectId, uid: req.user.uid });
        res.status(500).json({
            message: 'Error submitting proposal',
            code: 'SUBMIT_PROPOSAL_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Supervisor reviews project (approve/reject/request changes)
 * PATCH /api/workflow/:projectId/review
 */
const reviewProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const supervisorUid = req.user.uid;

        // Validate request body
        const { error, value } = workflowReviewSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                message: 'Invalid review data',
                errors: error.details.map(d => d.message)
            });
        }

        const { action, feedback } = value;

        if (!ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const projectsCollection = await getProjectsCollection();
        const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Verify supervisor is assigned to this project
        if (project.supervisorId !== supervisorUid && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to review this project' });
        }

        // Determine new status based on action
        let newStatus;
        switch (action) {
            case 'approve':
                if (project.status === 'supervisor_review') {
                    newStatus = 'approved';
                } else {
                    return res.status(400).json({ message: 'Cannot approve project in current status' });
                }
                break;
            case 'request_changes':
                newStatus = 'changes_requested';
                break;
            case 'reject':
                newStatus = 'changes_requested'; // Student can revise and resubmit
                break;
            default:
                return res.status(400).json({ message: 'Invalid action' });
        }

        // Update project status
        await projectsCollection.updateOne(
            { _id: new ObjectId(projectId) },
            {
                $set: {
                    status: newStatus,
                    updatedAt: new Date()
                }
            }
        );

        // Update milestone
        const milestonesCollection = await getProjectMilestonesCollection();
        await milestonesCollection.updateOne(
            { projectId, phase: 'proposal' },
            {
                $set: {
                    status: action === 'approve' ? 'completed' : 'rejected',
                    reviewerId: supervisorUid,
                    feedback: feedback || '',
                    completedAt: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        // Send notification to student
        try {
            await createProjectStatusUpdateNotification(
                project.authorId,
                project.title,
                newStatus,
                project._id
            );
        } catch (notifError) {
            console.warn('Could not send student notification:', notifError.message);
        }

        res.json({
            success: true,
            message: `Project ${action === 'approve' ? 'approved' : 'sent back for revisions'}`,
            newStatus
        });
    } catch (error) {
        logger.error('Error reviewing project:', { error: error.message, projectId: req.params.projectId, uid: req.user.uid });
        res.status(500).json({
            message: 'Error reviewing project',
            code: 'REVIEW_PROJECT_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Add comment to specific project phase
 * POST /api/workflow/:projectId/comment
 */
const addComment = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.uid;

        // Validate request body
        const { error, value } = projectCommentSchema.validate({ ...req.body, projectId });
        if (error) {
            return res.status(400).json({
                message: 'Invalid comment data',
                errors: error.details.map(d => d.message)
            });
        }

        const { phase, comment } = value;

        const commentsCollection = await getProjectCommentsCollection();
        const newComment = new ProjectComment({
            projectId,
            userId,
            phase,
            comment,
            createdAt: new Date()
        });

        const result = await commentsCollection.insertOne(newComment.toJSON());

        // Get user details for response
        const usersCollection = await getUsersCollection();
        const user = await usersCollection.findOne({ uid: userId });

        res.json({
            success: true,
            comment: {
                ...newComment.toJSON(),
                _id: result.insertedId,
                user: {
                    uid: user.uid,
                    name: user.name || user.displayName,
                    role: user.role
                }
            }
        });
    } catch (error) {
        logger.error('Error adding workflow comment:', { error: error.message, projectId: req.params.projectId, uid: req.user.uid });
        res.status(500).json({
            message: 'Error adding comment',
            code: 'ADD_WORKFLOW_COMMENT_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get complete workflow timeline for project
 * GET /api/workflow/:projectId/timeline
 */
const getProjectTimeline = async (req, res) => {
    try {
        const { projectId } = req.params;

        const milestonesCollection = await getProjectMilestonesCollection();
        const commentsCollection = await getProjectCommentsCollection();

        // Get all milestones
        const milestones = await milestonesCollection
            .find({ projectId })
            .sort({ createdAt: 1 })
            .toArray();

        // Get all comments
        const comments = await commentsCollection
            .find({ projectId })
            .sort({ createdAt: 1 })
            .toArray();

        // Get user details for comments and reviews
        const userIds = [
            ...comments.map(c => c.userId),
            ...milestones.filter(m => m.reviewerId).map(m => m.reviewerId)
        ];

        const uniqueUserIds = [...new Set(userIds)];
        const usersCollection = await getUsersCollection();
        const users = await usersCollection
            .find({ uid: { $in: uniqueUserIds } })
            .project({ uid: 1, name: 1, displayName: 1, role: 1 })
            .toArray();

        const userMap = users.reduce((acc, user) => {
            acc[user.uid] = {
                name: user.name || user.displayName,
                role: user.role
            };
            return acc;
        }, {});

        res.json({
            success: true,
            timeline: {
                milestones: milestones.map(m => ({
                    ...m,
                    reviewer: m.reviewerId ? userMap[m.reviewerId] : null
                })),
                comments: comments.map(c => ({
                    ...c,
                    user: userMap[c.userId]
                }))
            }
        });
    } catch (error) {
        logger.error('Error fetching project timeline:', { error: error.message, projectId: req.params.projectId });
        res.status(500).json({
            message: 'Error fetching project timeline',
            code: 'FETCH_TIMELINE_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Advance project to next phase (mid_defense, final_submission, etc.)
 * PATCH /api/workflow/:projectId/advance
 */
const advancePhase = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { newPhase } = req.body;
        const supervisorUid = req.user.uid;

        if (!ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const projectsCollection = await getProjectsCollection();
        const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Verify authorization
        if (project.supervisorId !== supervisorUid && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Validate transition
        const projectModel = new Project(project);
        if (!projectModel.canTransitionTo(newPhase)) {
            return res.status(400).json({
                message: `Cannot transition from ${project.status} to ${newPhase}`,
                validTransitions: projectModel.getValidTransitions()
            });
        }

        // Update project status
        await projectsCollection.updateOne(
            { _id: new ObjectId(projectId) },
            {
                $set: {
                    status: newPhase,
                    updatedAt: new Date()
                }
            }
        );

        // Send notification to student
        try {
            await createProjectStatusUpdateNotification(
                project.authorId,
                project.title,
                newPhase,
                project._id
            );
        } catch (notifError) {
            logger.warn('Could not send student notification for phase advancement:', { error: notifError.message, authorId: project.authorId, projectId: project._id });
        }

        res.json({
            success: true,
            message: `Project advanced to ${newPhase}`,
            newStatus: newPhase
        });
    } catch (error) {
        logger.error('Error advancing project phase:', { error: error.message, projectId: req.params.projectId, uid: req.user.uid });
        res.status(500).json({
            message: 'Error advancing project phase',
            code: 'ADVANCE_PHASE_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getPendingApprovals,
    submitProposal,
    reviewProject,
    addComment,
    getProjectTimeline,
    advancePhase,
};
