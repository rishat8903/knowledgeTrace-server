/**
 * Base error class for all operational errors
 * Operational errors are expected errors that we can handle gracefully
 */
class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Validation error - 400 Bad Request
 * Used when request data fails validation
 */
class ValidationError extends AppError {
    constructor(message = 'Validation failed') {
        super(message, 400);
    }
}

/**
 * Not Found error - 404 Not Found
 * Used when a requested resource doesn't exist
 */
class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

/**
 * Unauthorized error - 401 Unauthorized
 * Used when authentication is required but missing or invalid
 */
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401);
    }
}

/**
 * Forbidden error - 403 Forbidden
 * Used when user is authenticated but doesn't have permission
 */
class ForbiddenError extends AppError {
    constructor(message = 'Permission denied') {
        super(message, 403);
    }
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError
};
