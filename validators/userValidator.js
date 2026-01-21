// User validation schemas using Joi
const Joi = require('joi');

/**
 * Validation schema for creating/updating user profile
 */
const createUserSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least 1 character long',
            'string.max': 'Name must not exceed 100 characters',
        }),

    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Invalid email format',
            'string.empty': 'Email is required',
        }),

    role: Joi.string()
        .valid('student', 'supervisor')
        .optional()
        .messages({
            'any.only': 'Role must be either "student" or "supervisor"',
        }),

    photoURL: Joi.string()
        .uri()
        .max(500)
        .allow('', null)
        .optional()
        .messages({
            'string.uri': 'Invalid photo URL format',
            'string.max': 'Photo URL must not exceed 500 characters',
        }),
});

/**
 * Validation schema for updating user profile
 */
const updateUserProfileSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(1)
        .max(100)
        .optional()
        .messages({
            'string.min': 'Name must be at least 1 character long',
            'string.max': 'Name must not exceed 100 characters',
        }),

    photoURL: Joi.string()
        .uri()
        .max(500)
        .allow('', null)
        .optional()
        .messages({
            'string.uri': 'Invalid photo URL format',
            'string.max': 'Photo URL must not exceed 500 characters',
        }),

    bio: Joi.string()
        .trim()
        .max(500)
        .allow('')
        .optional()
        .messages({
            'string.max': 'Bio must not exceed 500 characters',
        }),

    location: Joi.string()
        .trim()
        .max(100)
        .allow('')
        .optional()
        .messages({
            'string.max': 'Location must not exceed 100 characters',
        }),

    website: Joi.string()
        .uri()
        .max(200)
        .allow('', null)
        .optional()
        .messages({
            'string.uri': 'Invalid website URL format',
            'string.max': 'Website URL must not exceed 200 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

module.exports = {
    createUserSchema,
    updateUserProfileSchema,
};
