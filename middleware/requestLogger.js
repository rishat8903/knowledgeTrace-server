const logger = require('../config/logger');

/**
 * Request logging middleware
 * Logs all incoming HTTP requests with method, URL, status, and response time
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Log request
    logger.info(`${req.method} ${req.originalUrl}`, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Log response
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'error' : 'info';

        logger[logLevel](`${req.method} ${req.originalUrl} ${res.statusCode}`, {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip
        });
    });

    next();
};

module.exports = requestLogger;
