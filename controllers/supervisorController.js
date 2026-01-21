// Supervisor Request Controller
// Handles student-supervisor collaboration requests

const {
    getUsersCollection,
    getProjectsCollection,
    getSupervisorRequestsCollection,
    ObjectId
} = require('../config/database');
const logger = require('../config/logger');
const { supervisorRequestSchema, supervisorResponseSchema } = require('../validators/thesisSchemas');
const SupervisorRequest = require('../models/SupervisorRequest');
const {
    createSupervisorRequestNotification,
    createSupervisorResponseNotification
} = require('../utils/notificationHelper');

/**
 * Browse available supervisors with their research areas and projects
 * GET /api/supervisors/browse
 */
const browseSupervisors = async (req, res) => {
    try {
        const { department, researchArea, page = 1, limit = 20 } = req.query;

        const usersCollection = await getUsersCollection();

        // Build filter for supervisors
        const filter = {
            role: 'supervisor'
        };

        if (department) {
            filter.department = department;
        }

        if (researchArea) {
            filter.researchAreas = { $in: [researchArea] };
        }

        // Get supervisors with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const supervisors = await usersCollection
            .find(filter)
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();

        // Get projects for each supervisor
        const projectsCollection = await getProjectsCollection();
        const enrichedSupervisors = await Promise.all(
            supervisors.map(async (supervisor) => {
                const projects = await projectsCollection
                    .find({
                        supervisorId: supervisor.uid,
                        visibility: 'public',
                        status: { $in: ['completed', 'archived'] }
                    })
                    .sort({ year: -1 })
                    .limit(5)
                    .project({ _id: 1, title: 1, year: 1, abstract: 1, tags: 1 })
                    .toArray();

                return {
                    uid: supervisor.uid,
                    name: supervisor.name || supervisor.displayName,
                    email: supervisor.email,
                    department: supervisor.department,
                    researchAreas: supervisor.researchAreas || [],
                    bio: supervisor.bio || '',
                    photoURL: supervisor.photoURL,
                    recentProjects: projects,
                    projectCount: supervisor.supervisedProjects?.length || 0
                };
            })
        );

        const totalCount = await usersCollection.countDocuments(filter);

        res.json({
            success: true,
            supervisors: enrichedSupervisors,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('Error browsing supervisors:', { error: error.message });
        res.status(500).json({
            message: 'Error fetching supervisors',
            code: 'FETCH_SUPERVISORS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Send collaboration request to supervisor
 * POST /api/supervisors/request
 */
const sendRequest = async (req, res) => {
    try {
        const studentUid = req.user.uid;

        // Validate request body
        const { error, value } = supervisorRequestSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                message: 'Invalid request data',
                errors: error.details.map(d => d.message)
            });
        }

        const { supervisorId, projectId, message } = value;

        // Verify supervisor exists and has supervisor role
        const usersCollection = await getUsersCollection();
        const supervisor = await usersCollection.findOne({ uid: supervisorId });

        if (!supervisor) {
            return res.status(404).json({ message: 'Supervisor not found' });
        }

        if (supervisor.role !== 'supervisor') {
            return res.status(400).json({ message: 'User is not a supervisor' });
        }

        // If projectId is provided, verify project exists and belongs to student
        if (projectId) {
            if (!ObjectId.isValid(projectId)) {
                return res.status(400).json({ message: 'Invalid project ID' });
            }

            const projectsCollection = await getProjectsCollection();
            const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });

            if (!project) {
                return res.status(404).json({ message: 'Project not found' });
            }

            if (project.authorId !== studentUid) {
                return res.status(403).json({ message: 'Project does not belong to you' });
            }

            // Check if project already has supervisor
            if (project.supervisorId) {
                return res.status(400).json({
                    message: 'Project already has a supervisor assigned'
                });
            }
        }

        // Check for existing pending request
        const requestsCollection = await getSupervisorRequestsCollection();
        const existingRequest = await requestsCollection.findOne({
            studentId: studentUid,
            supervisorId,
            projectId: projectId || null,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                message: 'You already have a pending request to this supervisor for this project'
            });
        }

        // Create new request
        const request = new SupervisorRequest({
            studentId: studentUid,
            supervisorId,
            projectId: projectId || null,
            message,
            createdAt: new Date()
        });

        const result = await requestsCollection.insertOne(request.toJSON());

        // Send notification to supervisor
        try {
            const student = await usersCollection.findOne({ uid: studentUid });
            let projectTitle = null;
            if (projectId) {
                const projectsCollection = await getProjectsCollection();
                const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });
                projectTitle = project?.title;
            }

            await createSupervisorRequestNotification(
                supervisorId,
                studentUid,
                student?.name || student?.displayName || 'A student',
                projectTitle,
                projectId
            );
        } catch (notifError) {
            logger.warn('Could not send supervisor notification:', { error: notifError.message });
        }

        res.json({
            success: true,
            message: 'Request sent successfully',
            request: {
                ...request.toJSON(),
                _id: result.insertedId
            }
        });
    } catch (error) {
        logger.error('Error sending supervisor request:', { error: error.message, studentId: req.user?.uid });
        res.status(500).json({
            message: 'Error sending collaboration request',
            code: 'SEND_REQUEST_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get student's sent requests
 * GET /api/supervisors/my-requests
 */
const getMyRequests = async (req, res) => {
    try {
        const studentUid = req.user.uid;

        const requestsCollection = await getSupervisorRequestsCollection();
        const requests = await requestsCollection
            .find({ studentId: studentUid })
            .sort({ createdAt: -1 })
            .toArray();

        // Get supervisor details for each request
        const usersCollection = await getUsersCollection();
        const supervisorIds = [...new Set(requests.map(r => r.supervisorId))];
        const supervisors = await usersCollection
            .find({ uid: { $in: supervisorIds } })
            .project({ uid: 1, name: 1, displayName: 1, email: 1, department: 1 })
            .toArray();

        const supervisorMap = supervisors.reduce((acc, sup) => {
            acc[sup.uid] = {
                name: sup.name || sup.displayName,
                email: sup.email,
                department: sup.department
            };
            return acc;
        }, {});

        const enrichedRequests = requests.map(req => ({
            ...req,
            supervisor: supervisorMap[req.supervisorId]
        }));

        res.json({
            success: true,
            count: enrichedRequests.length,
            requests: enrichedRequests
        });
    } catch (error) {
        logger.error('Error fetching my requests:', { error: error.message, uid: req.user?.uid });
        res.status(500).json({
            message: 'Error fetching your requests',
            code: 'FETCH_MY_REQUESTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get supervisor's pending requests
 * GET /api/supervisors/pending-requests
 */
const getPendingRequests = async (req, res) => {
    try {
        const supervisorUid = req.user.uid;

        const requestsCollection = await getSupervisorRequestsCollection();
        const requests = await requestsCollection
            .find({
                supervisorId: supervisorUid,
                status: 'pending'
            })
            .sort({ createdAt: 1 }) // Oldest first
            .toArray();

        // Get student details for each request
        const usersCollection = await getUsersCollection();
        const studentIds = [...new Set(requests.map(r => r.studentId))];
        const students = await usersCollection
            .find({ uid: { $in: studentIds } })
            .project({ uid: 1, name: 1, displayName: 1, email: 1, department: 1, skills: 1 })
            .toArray();

        const studentMap = students.reduce((acc, student) => {
            acc[student.uid] = {
                name: student.name || student.displayName,
                email: student.email,
                department: student.department,
                skills: student.skills || []
            };
            return acc;
        }, {});

        // Get project details if projectId exists
        const projectsCollection = await getProjectsCollection();
        const projectIds = requests
            .filter(r => r.projectId)
            .map(r => new ObjectId(r.projectId));

        const projects = projectIds.length > 0
            ? await projectsCollection
                .find({ _id: { $in: projectIds } })
                .project({ _id: 1, title: 1, abstract: 1, requiredSkills: 1 })
                .toArray()
            : [];

        const projectMap = projects.reduce((acc, project) => {
            acc[project._id.toString()] = project;
            return acc;
        }, {});

        const enrichedRequests = requests.map(req => ({
            ...req,
            student: studentMap[req.studentId],
            project: req.projectId ? projectMap[req.projectId] : null
        }));

        res.json({
            success: true,
            count: enrichedRequests.length,
            requests: enrichedRequests
        });
    } catch (error) {
        logger.error('Error fetching pending requests:', { error: error.message, uid: req.user?.uid });
        res.status(500).json({
            message: 'Error fetching pending requests',
            code: 'FETCH_PENDING_REQUESTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Respond to collaboration request (approve/reject)
 * PATCH /api/supervisors/request/:id/respond
 */
const respondToRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const supervisorUid = req.user.uid;

        // Validate request body
        const { error, value } = supervisorResponseSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                message: 'Invalid response data',
                errors: error.details.map(d => d.message)
            });
        }

        const { action, response } = value;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid request ID' });
        }

        const requestsCollection = await getSupervisorRequestsCollection();
        const request = await requestsCollection.findOne({ _id: new ObjectId(id) });

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // Verify this request is for the current supervisor
        if (request.supervisorId !== supervisorUid) {
            return res.status(403).json({ message: 'This request is not for you' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Request has already been responded to' });
        }

        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        // Update request status
        await requestsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: newStatus,
                    supervisorResponse: response || '',
                    respondedAt: new Date()
                }
            }
        );

        // If approved and projectId exists, assign supervisor to project
        if (action === 'approve' && request.projectId) {
            const projectsCollection = await getProjectsCollection();
            const usersCollection = await getUsersCollection();
            const supervisor = await usersCollection.findOne({ uid: supervisorUid });

            await projectsCollection.updateOne(
                { _id: new ObjectId(request.projectId) },
                {
                    $set: {
                        supervisorId: supervisorUid,
                        supervisor: supervisor?.name || '',
                        supervisorDepartment: supervisor?.department || '',
                        updatedAt: new Date()
                    }
                }
            );

            // Add project to supervisor's supervisedProjects
            await usersCollection.updateOne(
                { uid: supervisorUid },
                {
                    $addToSet: { supervisedProjects: request.projectId }
                }
            );
        }

        // Send notification to student
        try {
            const usersCollection = await getUsersCollection();
            const supervisor = await usersCollection.findOne({ uid: supervisorUid });
            let projectTitle = null;
            if (request.projectId) {
                const projectsCollection = await getProjectsCollection();
                const project = await projectsCollection.findOne({ _id: new ObjectId(request.projectId) });
                projectTitle = project?.title;
            }

            await createSupervisorResponseNotification(
                request.studentId,
                supervisorUid,
                supervisor?.name || supervisor?.displayName || 'Supervisor',
                newStatus,
                projectTitle,
                request.projectId
            );
        } catch (notifError) {
            logger.warn('Could not send student notification:', { error: notifError.message });
        }

        res.json({
            success: true,
            message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
            newStatus
        });
    } catch (error) {
        logger.error('Error responding to request:', { error: error.message, requestId: req.params.id });
        res.status(500).json({
            message: 'Error responding to collaboration request',
            code: 'RESPOND_REQUEST_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};



/**
 * Get all supervisors (for dropdown selector)
 * GET /api/supervisors
 */
const getAllSupervisors = async (req, res) => {
    try {
        const usersCollection = await getUsersCollection();
        const projectsCollection = await getProjectsCollection();

        // Get all users with supervisor role
        const supervisors = await usersCollection
            .find({ role: 'supervisor' })
            .sort({ name: 1 })
            .toArray();

        // Get project counts for each supervisor
        const supervisorsWithCounts = await Promise.all(
            supervisors.map(async (supervisor) => {
                const projectCount = await projectsCollection.countDocuments({
                    supervisorId: supervisor.uid
                });

                const availableSlots = supervisor.maxStudents
                    ? Math.max(0, supervisor.maxStudents - projectCount)
                    : null;

                return {
                    uid: supervisor.uid,
                    name: supervisor.name,
                    email: supervisor.email,
                    department: supervisor.department,
                    designation: supervisor.designation,
                    researchAreas: supervisor.researchAreas || [],
                    photoURL: supervisor.photoURL,
                    supervisedCount: projectCount,
                    maxStudents: supervisor.maxStudents,
                    availableSlots: availableSlots,
                    officeHours: supervisor.officeHours
                };
            })
        );

        res.json({
            success: true,
            supervisors: supervisorsWithCounts
        });
    } catch (error) {
        logger.error('Error fetching all supervisors:', { error: error.message });
        res.status(500).json({
            message: 'Error fetching supervisors',
            code: 'FETCH_ALL_SUPERVISORS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get supervisor profile with statistics
 * GET /api/supervisors/:id/profile
 */
const getSupervisorProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const usersCollection = await getUsersCollection();
        const projectsCollection = await getProjectsCollection();

        const supervisor = await usersCollection.findOne({
            uid: id,
            role: 'supervisor'
        });

        if (!supervisor) {
            return res.status(404).json({ message: 'Supervisor not found' });
        }

        // Get supervised projects with statistics
        const projects = await projectsCollection
            .find({ supervisorId: id })
            .sort({ createdAt: -1 })
            .toArray();

        const stats = {
            totalProjects: projects.length,
            activeProjects: projects.filter(p => ['pending', 'approved'].includes(p.status)).length,
            completedProjects: projects.filter(p => p.status === 'completed').length,
            projectsByStatus: {
                pending: projects.filter(p => p.status === 'pending').length,
                approved: projects.filter(p => p.status === 'approved').length,
                rejected: projects.filter(p => p.status === 'rejected').length,
                completed: projects.filter(p => p.status === 'completed').length
            },
            projectsByYear: {}
        };

        // Calculate projects by year
        projects.forEach(project => {
            const year = project.year || new Date(project.createdAt).getFullYear();
            stats.projectsByYear[year] = (stats.projectsByYear[year] || 0) + 1;
        });

        const Project = require('../models/Project');
        const profile = {
            uid: supervisor.uid,
            name: supervisor.name,
            email: supervisor.email,
            photoURL: supervisor.photoURL,
            department: supervisor.department,
            designation: supervisor.designation,
            bio: supervisor.bio,
            researchAreas: supervisor.researchAreas || [],
            officeHours: supervisor.officeHours,
            socialLinks: supervisor.socialLinks || {},
            stats: stats,
            recentProjects: projects.slice(0, 5).map(p => new Project(p).toJSON())
        };

        res.json({
            success: true,
            profile: profile
        });
    } catch (error) {
        logger.error('Error fetching supervisor profile:', { error: error.message, uid: req.params.id });
        res.status(500).json({
            message: 'Error fetching supervisor details',
            code: 'FETCH_SUPERVISOR_PROFILE_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get supervised students
 * GET /api/supervisors/:id/students
 */
const getStudents = async (req, res) => {
    try {
        const { id } = req.params;

        logger.debug(`getStudents called`, { supervisorId: id, userId: req.user?.uid, role: req.user?.role });

        // Verify supervisor exists and user has permission
        if (req.user.uid !== id && !req.user.isAdmin && req.user.role !== 'supervisor') {
            logger.warn('Access denied to getStudents', { requestedId: id, userId: req.user.uid });
            return res.status(403).json({ message: 'Access denied' });
        }

        const projectsCollection = await getProjectsCollection();
        const usersCollection = await getUsersCollection();

        // Get all projects supervised by this supervisor
        const projects = await projectsCollection
            .find({ supervisorId: id })
            .toArray();

        // Extract unique student IDs
        const studentIds = [...new Set(projects.map(p => p.authorId).filter(Boolean))];

        // Get student details
        const students = await usersCollection
            .find({ uid: { $in: studentIds } })
            .toArray();

        // Map students with their project counts
        const studentsWithProjects = students.map(student => {
            const studentProjects = projects.filter(p => p.authorId === student.uid);

            return {
                uid: student.uid,
                name: student.name,
                email: student.email,
                photoURL: student.photoURL,
                department: student.department,
                year: student.year,
                projectCount: studentProjects.length,
                projects: studentProjects.map(p => ({
                    _id: p._id,
                    title: p.title,
                    status: p.status,
                    year: p.year,
                    createdAt: p.createdAt
                }))
            };
        });

        logger.debug(`Returning ${studentsWithProjects.length} students with project details for supervisor ${id}`);

        res.json({
            success: true,
            students: studentsWithProjects
        });
    } catch (error) {
        logger.error('Error fetching students:', { error: error.message, uid: req.params.id });
        res.status(500).json({
            message: 'Error fetching students list',
            code: 'FETCH_STUDENTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get supervised projects
 * GET /api/supervisors/:id/projects  
 */
const getSupervisedProjects = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, year, page = 1, limit = 20 } = req.query;

        const projectsCollection = await getProjectsCollection();

        // Build query
        const query = { supervisorId: id };

        if (status) {
            query.status = status;
        }

        if (year) {
            query.year = parseInt(year);
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const projects = await projectsCollection
            .find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();

        const totalCount = await projectsCollection.countDocuments(query);

        const Project = require('../models/Project');
        res.json({
            success: true,
            projects: projects.map(p => new Project(p).toJSON()),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalCount,
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('Error fetching supervised projects:', { error: error.message, uid: req.params.id });
        res.status(500).json({
            message: 'Error fetching supervised projects',
            code: 'FETCH_SUPERVISED_PROJECTS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get supervisor dashboard statistics
 * GET /api/supervisors/:id/stats
 */
const getStats = async (req, res) => {
    try {
        const { id } = req.params;

        // Verify user has permission
        if (req.user.uid !== id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const projectsCollection = await getProjectsCollection();
        const usersCollection = await getUsersCollection();

        // Get all supervised projects
        const projects = await projectsCollection
            .find({ supervisorId: id })
            .toArray();

        // Get unique students
        const studentIds = [...new Set(projects.map(p => p.authorId).filter(Boolean))];

        // Calculate statistics
        const stats = {
            totalStudents: studentIds.length,
            totalProjects: projects.length,
            activeProjects: projects.filter(p => ['pending', 'approved'].includes(p.status)).length,
            completedProjects: projects.filter(p => p.status === 'completed').length,
            pendingReviews: projects.filter(p => p.status === 'pending').length,
            projectsByStatus: {
                pending: projects.filter(p => p.status === 'pending').length,
                approved: projects.filter(p => p.status === 'approved').length,
                rejected: projects.filter(p => p.status === 'rejected').length,
                completed: projects.filter(p => p.status === 'completed').length,
                archived: projects.filter(p => p.status === 'archived').length
            },
            projectsByYear: {},
            recentActivity: []
        };

        // Projects by year
        projects.forEach(project => {
            const year = project.year || new Date(project.createdAt).getFullYear();
            stats.projectsByYear[year] = (stats.projectsByYear[year] || 0) + 1;
        });

        // Recent activity (last 10 submissions)
        const recentProjects = projects
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        for (const project of recentProjects) {
            const student = await usersCollection.findOne({ uid: project.authorId });
            stats.recentActivity.push({
                type: 'submission',
                projectId: project._id,
                projectTitle: project.title,
                studentName: student?.name || project.author,
                status: project.status,
                timestamp: project.createdAt
            });
        }

        logger.debug(`Supervisor stats`, { supervisorId: id, totalStudents: stats.totalStudents, totalProjects: stats.totalProjects });

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        logger.error('Error fetching supervisor stats:', { error: error.message, supervisorId: req.params.id });
        res.status(500).json({
            message: 'Error fetching supervisor statistics',
            code: 'FETCH_SUPERVISOR_STATS_ERROR',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update supervisor profile
 * PATCH /api/supervisors/:id/profile
 */
const updateProfile = async (req, res) => {
    try {
        const { id } = req.params;

        // Verify user is updating their own profile or is admin
        if (req.user.uid !== id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const usersCollection = await getUsersCollection();

        const allowedFields = [
            'designation',
            'bio',
            'researchAreas',
            'officeHours',
            'maxStudents',
            'socialLinks',
            'photoURL'
        ];

        const updateData = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        });

        updateData.updatedAt = new Date();

        const result = await usersCollection.updateOne(
            { uid: id, role: 'supervisor' },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Supervisor not found' });
        }

        const updatedSupervisor = await usersCollection.findOne({ uid: id });

        const User = require('../models/User');
        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: new User(updatedSupervisor).toJSON()
        });
    } catch (error) {
        logger.error('Error updating supervisor profile:', { error: error.message, supervisorId: req.params.id });
        res.status(500).json({
            message: 'Error updating profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Export all functions at the end
module.exports = {
    browseSupervisors,
    sendRequest,
    getMyRequests,
    getPendingRequests,
    respondToRequest,
    getAllSupervisors,
    getSupervisorProfile,
    getStudents,
    getSupervisedProjects,
    getStats,
    updateProfile
};
