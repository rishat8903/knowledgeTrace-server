// Joi validation schemas for thesis management modules
const Joi = require('joi');

// ObjectId validation pattern
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

// User registration/update schemas
const userRegistrationSchema = Joi.object({
    uid: Joi.string().required(),
    email: Joi.string().email().required().custom((value, helpers) => {
        // Allow both student and supervisor domains
        const isStudent = value.endsWith('@ugrad.iiuc.ac.bd');
        const isSupervisor = value.endsWith('@iiuc.ac.bd');

        if (!isStudent && !isSupervisor) {
            return helpers.error('any.invalid', {
                message: 'Email must be from @ugrad.iiuc.ac.bd (students) or @iiuc.ac.bd (supervisors)'
            });
        }
        return value;
    }),
    name: Joi.string().min(2).max(100),
    displayName: Joi.string().min(2).max(100),
    department: Joi.string().allow(''),
    role: Joi.string().valid('student', 'supervisor', 'admin').default('student'),
    skills: Joi.array().items(Joi.string()).max(50),
    researchAreas: Joi.array().items(Joi.string()).max(20),
});

const userProfileUpdateSchema = Joi.object({
    name: Joi.string().min(2).max(100),
    displayName: Joi.string().min(2).max(100),
    department: Joi.string(),
    year: Joi.string(),
    skills: Joi.array().items(Joi.string()).max(50),
    bio: Joi.string().max(500),
    headline: Joi.string().max(200),
    github: Joi.string().uri().allow(''),
    linkedin: Joi.string().uri().allow(''),
    researchAreas: Joi.array().items(Joi.string()).max(20),
}).min(1);

// Project schemas (Module A & B)
const projectSubmissionSchema = Joi.object({
    title: Joi.string().min(10).max(200).required(),
    abstract: Joi.string().min(100).max(2000).required(),
    description: Joi.string().min(50),
    tags: Joi.array().items(Joi.string()).min(1).max(10),
    techStack: Joi.array().items(Joi.string()).max(15),
    requiredSkills: Joi.array().items(Joi.string()).max(15),
    supervisorId: Joi.string().pattern(objectIdPattern),
    department: Joi.string().required(),
    year: Joi.number().integer().min(2000).max(2100),
    githubLink: Joi.string().uri().allow(''),
    visibility: Joi.string().valid('public', 'private').default('public'),
});

const projectUpdateSchema = Joi.object({
    title: Joi.string().min(10).max(200),
    abstract: Joi.string().min(100).max(2000),
    description: Joi.string().min(50),
    tags: Joi.array().items(Joi.string()).min(1).max(10),
    techStack: Joi.array().items(Joi.string()).max(15),
    requiredSkills: Joi.array().items(Joi.string()).max(15),
    department: Joi.string(),
    githubLink: Joi.string().uri().allow(''),
    visibility: Joi.string().valid('public', 'private'),
}).min(1);

// Workflow schemas (Module B)
const workflowReviewSchema = Joi.object({
    action: Joi.string().valid('approve', 'request_changes', 'reject').required(),
    feedback: Joi.string().when('action', {
        is: Joi.string().valid('request_changes', 'reject'),
        then: Joi.required(),
        otherwise: Joi.optional()
    }),
    newStatus: Joi.string().valid(
        'supervisor_review',
        'changes_requested',
        'approved',
        'mid_defense',
        'final_submission',
        'completed',
        'archived'
    )
});

const projectCommentSchema = Joi.object({
    projectId: Joi.string().pattern(objectIdPattern).required(),
    phase: Joi.string().valid('proposal', 'supervisor_review', 'mid_defense', 'final_submission').required(),
    comment: Joi.string().min(1).max(1000).required(),
});

// Supervisor request schemas
const supervisorRequestSchema = Joi.object({
    supervisorId: Joi.string().required(), // Firebase UID
    projectId: Joi.string().pattern(objectIdPattern).allow(null),
    message: Joi.string().min(20).max(500).required(),
});

const supervisorResponseSchema = Joi.object({
    action: Joi.string().valid('approve', 'reject').required(),
    response: Joi.string().max(500),
});

// Team formation schemas (Module C)
const teamInvitationSchema = Joi.object({
    projectId: Joi.string().pattern(objectIdPattern).required(),
    userId: Joi.string().required(), // Firebase UID of student to invite
    message: Joi.string().max(500),
});

const teamResponseSchema = Joi.object({
    action: Joi.string().valid('accept', 'reject').required(),
});

// Search and filter schemas
const thesisSearchSchema = Joi.object({
    query: Joi.string().allow(''),
    year: Joi.number().integer().min(2000).max(2100),
    department: Joi.string(),
    tags: Joi.array().items(Joi.string()),
    supervisor: Joi.string(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'year', 'views', 'likeCount').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

module.exports = {
    userRegistrationSchema,
    userProfileUpdateSchema,
    projectSubmissionSchema,
    projectUpdateSchema,
    workflowReviewSchema,
    projectCommentSchema,
    supervisorRequestSchema,
    supervisorResponseSchema,
    teamInvitationSchema,
    teamResponseSchema,
    thesisSearchSchema,
};
