// Project validation schemas using Joi
const Joi = require('joi');

/**
 * Helper function to strip HTML tags for validation
 */
const stripHtml = (html) => {
    if (!html || typeof html !== 'string') {
        return '';
    }
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, '');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
    // Remove excessive whitespace and trim
    return text.replace(/\s+/g, ' ').trim();
};

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
        .required()
        .custom((value, helpers) => {
            // Strip HTML and validate plain text length
            const plainText = stripHtml(value);
            if (plainText.length < 50) {
                return helpers.error('string.min', { limit: 50, length: plainText.length });
            }
            if (value.length > 5000) {
                return helpers.error('string.max', { limit: 5000 });
            }
            return value;
        })
        .messages({
            'string.empty': 'Project abstract is required',
            'string.min': 'Abstract must be at least {#limit} characters long (currently {#length} characters)',
            'string.max': 'Abstract must not exceed {#limit} characters',
        }),

    techStack: Joi.alternatives()
        .try(
            Joi.array().items(Joi.string().trim().max(50)).max(20),
            Joi.string().custom((value, helpers) => {
                // Allow comma-separated string as fallback
                const array = value.split(',').map(t => t.trim()).filter(t => t);
                if (array.length > 20) {
                    return helpers.error('array.max');
                }
                return array;
            })
        )
        .default([])
        .messages({
            'array.max': 'Maximum 20 technologies allowed',
        }),

    tags: Joi.alternatives()
        .try(
            Joi.array().items(Joi.string().trim().max(50)).max(10),
            Joi.string().custom((value, helpers) => {
                // Allow comma-separated string as fallback
                const array = value.split(',').map(t => t.trim()).filter(t => t);
                if (array.length > 10) {
                    return helpers.error('array.max');
                }
                return array;
            })
        )
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

    year: Joi.alternatives()
        .try(
            Joi.number().integer().min(2000).max(new Date().getFullYear() + 1),
            Joi.string().custom((value, helpers) => {
                const year = parseInt(value, 10);
                if (isNaN(year)) {
                    return helpers.error('number.base');
                }
                if (year < 2000) {
                    return helpers.error('number.min', { limit: 2000 });
                }
                if (year > new Date().getFullYear() + 1) {
                    return helpers.error('number.max', { limit: new Date().getFullYear() + 1 });
                }
                return year;
            })
        )
        .default(new Date().getFullYear())
        .messages({
            'number.base': 'Year must be a valid number',
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

/**
 * Validation schema for comment/reply content
 */
const commentContentSchema = Joi.object({
    content: Joi.string()
        .trim()
        .min(1)
        .max(2000)
        .required()
        .messages({
            'string.empty': 'Comment content is required',
            'string.min': 'Comment must be at least 1 character long',
            'string.max': 'Comment must not exceed 2000 characters',
        }),
});

/**
 * Validation schema for MongoDB ObjectId parameters
 */
const objectIdSchema = Joi.object({
    id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'Invalid ID format',
            'any.required': 'ID is required',
        }),
});

module.exports = {
    createProjectSchema,
    updateProjectStatusSchema,
    projectQuerySchema,
    commentContentSchema,
    objectIdSchema,
};
