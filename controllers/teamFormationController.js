// Module C: Team Formation Controller
// Handles skill-based team matching and team management

const {
    getUsersCollection,
    getProjectsCollection,
    getTeamMembersCollection,
    getTeamMatchSuggestionsCollection,
    ObjectId
} = require('../config/database');
const { findMatchingStudents, groupByMatchLevel } = require('../utils/teamMatching');
const { teamInvitationSchema, teamResponseSchema } = require('../validators/thesisSchemas');
const TeamMember = require('../models/TeamMember');
const logger = require('../config/logger');
const TeamMatchSuggestion = require('../models/TeamMatchSuggestion');
const { createTeamInvitationNotification } = require('../utils/notificationHelper');

/**
 * Find matching students for a project based on required skills
 * GET /api/teams/find-matches/:projectId
 */
const findMatchingStudentsForProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { minScore = 0, limit = 20 } = req.query;

        if (!ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const projectsCollection = await getProjectsCollection();
        const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const requiredSkills = project.requiredSkills || [];

        if (requiredSkills.length === 0) {
            return res.json({
                success: true,
                message: 'Project has no required skills specified',
                matches: []
            });
        }

        // Get all students (exclude current team members)
        const usersCollection = await getUsersCollection();
        const currentTeamMemberIds = project.studentIds || [project.authorId];

        const students = await usersCollection
            .find({
                role: 'student',
                uid: { $nin: currentTeamMemberIds }
            })
            .toArray();

        // Calculate match scores
        const matches = findMatchingStudents(students, requiredSkills, parseInt(minScore));

        // Limit results
        const limitedMatches = matches.slice(0, parseInt(limit));

        // Group by match level
        const groupedMatches = groupByMatchLevel(limitedMatches);

        // Save suggestions to database for caching
        const suggestionsCollection = await getTeamMatchSuggestionsCollection();

        // Clear old suggestions for this project
        await suggestionsCollection.deleteMany({ projectId });

        // Insert new suggestions
        if (limitedMatches.length > 0) {
            const suggestions = limitedMatches.map(match => {
                const suggestion = new TeamMatchSuggestion({
                    projectId,
                    studentId: match.studentId,
                    matchScore: match.score,
                    matchedSkills: match.matchedSkills,
                    missingSkills: match.missingSkills,
                    createdAt: new Date()
                });
                return suggestion.toJSON();
            });

            await suggestionsCollection.insertMany(suggestions);
        }

        res.json({
            success: true,
            totalMatches: matches.length,
            matches: limitedMatches,
            groupedByLevel: groupedMatches
        });
    } catch (error) {
        logger.error('Error finding matching students:', { error: error.message, projectId: req.params.projectId });
        res.status(500).json({
            message: 'Error finding matching students',
            code: 'MATCH_STUDENTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Invite student to join project team
 * POST /api/teams/invite
 */
const inviteToTeam = async (req, res) => {
    try {
        const inviterUid = req.user.uid;

        // Validate request body
        const { error, value } = teamInvitationSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                message: 'Invalid invitation data',
                errors: error.details.map(d => d.message)
            });
        }

        const { projectId, userId, message } = value;

        if (!ObjectId.isValid(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        // Verify project exists and inviter is team leader
        const projectsCollection = await getProjectsCollection();
        const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });

        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        if (project.authorId !== inviterUid) {
            return res.status(403).json({ message: 'Only project leader can invite team members' });
        }

        // Check if user is already a team member
        if (project.studentIds && project.studentIds.includes(userId)) {
            return res.status(400).json({ message: 'User is already a team member' });
        }

        // Create team member invitation
        const teamMembersCollection = await getTeamMembersCollection();
        const teamMember = new TeamMember({
            projectId,
            userId,
            role: 'member',
            status: 'invited',
            createdAt: new Date()
        });

        const result = await teamMembersCollection.insertOne(teamMember.toJSON());

        // Send notification to invited user
        try {
            const usersCollection = await getUsersCollection();
            const inviter = await usersCollection.findOne({ uid: inviterUid });

            await createTeamInvitationNotification(
                userId,
                inviterUid,
                inviter?.name || inviter?.displayName || 'A student',
                project.title,
                project._id
            );
        } catch (notifError) {
            logger.warn('Could not send team invitation notification:', { error: notifError.message, userId, projectId });
        }

        res.json({
            success: true,
            message: 'Team invitation sent successfully',
            invitation: {
                ...teamMember.toJSON(),
                _id: result.insertedId
            }
        });
    } catch (error) {
        logger.error('Error sending team invitation:', { error: error.message, uid: req.user.uid });
        res.status(500).json({
            message: 'Error sending team invitation',
            code: 'SEND_INVITATION_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Respond to team invitation (accept/reject)
 * PATCH /api/teams/respond/:inviteId
 */
const respondToInvitation = async (req, res) => {
    try {
        const { inviteId } = req.params;
        const studentUid = req.user.uid;

        // Validate request body
        const { error, value } = teamResponseSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                message: 'Invalid response data',
                errors: error.details.map(d => d.message)
            });
        }

        const { action } = value;

        if (!ObjectId.isValid(inviteId)) {
            return res.status(400).json({ message: 'Invalid invitation ID' });
        }

        const teamMembersCollection = await getTeamMembersCollection();
        const invitation = await teamMembersCollection.findOne({ _id: new ObjectId(inviteId) });

        if (!invitation) {
            return res.status(404).json({ message: 'Invitation not found' });
        }

        // Verify this invitation is for the current user
        if (invitation.userId !== studentUid) {
            return res.status(403).json({ message: 'This invitation is not for you' });
        }

        if (invitation.status !== 'invited') {
            return res.status(400).json({ message: 'Invitation has already been responded to' });
        }

        if (action === 'accept') {
            // Update team member status
            await teamMembersCollection.updateOne(
                { _id: new ObjectId(inviteId) },
                {
                    $set: {
                        status: 'active',
                        joinedAt: new Date()
                    }
                }
            );

            // Add student to project's studentIds array
            const projectsCollection = await getProjectsCollection();
            await projectsCollection.updateOne(
                { _id: new ObjectId(invitation.projectId) },
                {
                    $addToSet: { studentIds: studentUid },
                    $set: { updatedAt: new Date() }
                }
            );

            res.json({
                success: true,
                message: 'Invitation accepted. You are now part of the team!'
            });
        } else {
            // Reject invitation - delete the team member record
            await teamMembersCollection.deleteOne({ _id: new ObjectId(inviteId) });

            res.json({
                success: true,
                message: 'Invitation declined'
            });
        }
    } catch (error) {
        logger.error('Error responding to invitation:', { error: error.message, inviteId: req.params.inviteId });
        res.status(500).json({
            message: 'Error responding to invitation',
            code: 'RESPOND_INVITATION_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get all teams the user is part of
 * GET /api/teams/my-teams
 */
const getMyTeams = async (req, res) => {
    try {
        const userUid = req.user.uid;

        const teamMembersCollection = await getTeamMembersCollection();
        const projectsCollection = await getProjectsCollection();

        // Find all team memberships for this user
        const memberships = await teamMembersCollection
            .find({ userId: userUid })
            .toArray();

        // Get project details for each team
        const projectIds = memberships.map(m => new ObjectId(m.projectId));
        const projects = await projectsCollection
            .find({ _id: { $in: projectIds } })
            .toArray();

        const teams = memberships.map(membership => {
            const project = projects.find(p => p._id.toString() === membership.projectId);
            return {
                membership: membership,
                project: project ? {
                    _id: project._id,
                    title: project.title,
                    status: project.status,
                    supervisor: project.supervisor
                } : null
            };
        });

        res.json({
            success: true,
            count: teams.length,
            teams
        });
    } catch (error) {
        logger.error('Error fetching user teams:', { error: error.message, uid: req.user.uid });
        res.status(500).json({
            message: 'Error fetching your teams',
            code: 'FETCH_TEAMS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Leave a team
 * DELETE /api/teams/:teamId/leave
 */
const leaveTeam = async (req, res) => {
    try {
        const { teamId } = req.params;
        const userUid = req.user.uid;

        if (!ObjectId.isValid(teamId)) {
            return res.status(400).json({ message: 'Invalid team ID' });
        }

        const teamMembersCollection = await getTeamMembersCollection();
        const membership = await teamMembersCollection.findOne({
            _id: new ObjectId(teamId),
            userId: userUid
        });

        if (!membership) {
            return res.status(404).json({ message: 'Team membership not found' });
        }

        // Cannot leave if you're the team leader (project author)
        if (membership.role === 'leader') {
            return res.status(400).json({
                message: 'Project leader cannot leave the team'
            });
        }

        // Update status to 'left'
        await teamMembersCollection.updateOne(
            { _id: new ObjectId(teamId) },
            {
                $set: {
                    status: 'left'
                }
            }
        );

        // Remove from project's studentIds
        const projectsCollection = await getProjectsCollection();
        await projectsCollection.updateOne(
            { _id: new ObjectId(membership.projectId) },
            {
                $pull: { studentIds: userUid },
                $set: { updatedAt: new Date() }
            }
        );

        res.json({
            success: true,
            message: 'You have left the team'
        });
    } catch (error) {
        logger.error('Error leaving team:', { error: error.message, teamId: req.params.teamId, uid: req.user.uid });
        res.status(500).json({
            message: 'Error leaving team',
            code: 'LEAVE_TEAM_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    findMatchingStudentsForProject,
    inviteToTeam,
    respondToInvitation,
    getMyTeams,
    leaveTeam,
};
