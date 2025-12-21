/**
 * Async error wrapper utility
 * Eliminates the need for try-catch blocks in async controllers
 * 
 * Usage:
 * const catchAsync = require('../utils/catchAsync');
 * 
 * router.get('/projects', catchAsync(async (req, res) => {
 *   const projects = await Project.find();
 *   res.json(projects);
 * }));
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

module.exports = catchAsync;
