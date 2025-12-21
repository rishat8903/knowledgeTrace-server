// Project validation schemas using Joi
const Joi = require('joi');

/**
 * Validation schema for creating a new project
 */
const createProjectSchema = Joi.object({
    title: Joi.string()
        .trim()
        .min(3)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Project title is required',
            'string.min': 'Title must be at least 3 characters long',
            'string.max': 'Title must not exceed 200 characters',
        }),

    abstract: Joi.string()
        .trim()
        .min(50)
        .max(5000)
        .required()
        .messages({
            'string.empty': 'Project abstract is required',
            'string.min': 'Abstract must be at least 50 characters long',
            'string.max': 'Abstract must not exceed 5000 characters',
        }),

    techStack: Joi.array()
        .items(Joi.string().trim().max(50))
        .max(20)
        .default([])
        .messages({
            'array.max': 'Maximum 20 technologies allowed',
        }),

    tags: Joi.array()
        .items(Joi.string().trim().max(50))
        .max(10)
        .default([])
        .messages({
            'array.max': 'Maximum 10 tags allowed',
        }),

    author: Joi.string()
        .trim()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Author name must not exceed 100 characters',
        }),

    supervisor: Joi.string()
        .trim()
        .max(100)
        .allow('')
        .optional()
        .messages({
            'string.max': 'Supervisor name must not exceed 100 characters',
        }),

    year: Joi.number()
        .integer()
        .min(2000)
        .max(new Date().getFullYear() + 1)
        .default(new Date().getFullYear())
        .messages({
            'number.min': 'Year cannot be before 2000',
            'number.max': `Year cannot be after ${new Date().getFullYear() + 1}`,
        }),

    githubLink: Joi.string()
        .uri()
        .pattern(/^https?:\/\/(www\.)?github\.com\//)
        .max(500)
        .allow('')
        .optional()
        .messages({
            'string.uri': 'Invalid GitHub URL format',
            'string.pattern.base': 'Must be a valid GitHub repository URL',
            'string.max': 'GitHub link must not exceed 500 characters',
        }),

    pdfUrl: Joi.string()
        .uri()
        .max(500)
        .allow('')
        .optional(),
});

/**
 * Validation schema for updating project status
 */
const updateProjectStatusSchema = Joi.object({
    status: Joi.string()
        .valid('pending', 'approved', 'rejected')
        .required()
        .messages({
            'any.only': 'Status must be one of: pending, approved, rejected',
            'any.required': 'Status is required',
        }),
});

/**
 * Validation schema for project search/filter query
 */
const projectQuerySchema = Joi.object({
    techStack: Joi.string().trim().max(100).optional(),
    author: Joi.string().trim().max(100).optional(),
    year: Joi.number().integer().min(2000).max(new Date().getFullYear() + 1).optional(),
    supervisor: Joi.string().trim().max(100).optional(),
    keywords: Joi.string().trim().max(200).optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    sort: Joi.string().valid('date', 'title', 'views', 'downloads').optional(),
    limit: Joi.number().integer().min(1).max(100).default(20).optional(),
    page: Joi.number().integer().min(1).default(1).optional(),
});

module.exports = {
    createProjectSchema,
    updateProjectStatusSchema,
    projectQuerySchema,
};
