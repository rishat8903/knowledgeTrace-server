/**
 * FormData Preprocessing Middleware
 * Converts FormData string values to proper types before validation
 */

const preprocessFormData = (req, res, next) => {
    // Only process if this is a multipart/form-data request
    if (!req.file && !req.files) {
        return next();
    }

    try {
        // Convert year from string to number
        if (req.body.year) {
            const yearValue = parseInt(req.body.year, 10);
            if (!isNaN(yearValue)) {
                req.body.year = yearValue;
            }
        }

        // Convert techStack from JSON string to array
        if (req.body.techStack && typeof req.body.techStack === 'string') {
            try {
                // Try parsing as JSON first
                req.body.techStack = JSON.parse(req.body.techStack);
            } catch (e) {
                // If not valid JSON, split by comma
                req.body.techStack = req.body.techStack
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0);
            }
            
            // Ensure it's an array
            if (!Array.isArray(req.body.techStack)) {
                req.body.techStack = [];
            }
        }

        // Convert tags from JSON string to array
        if (req.body.tags && typeof req.body.tags === 'string') {
            try {
                // Try parsing as JSON first
                req.body.tags = JSON.parse(req.body.tags);
            } catch (e) {
                // If not valid JSON, split by comma
                req.body.tags = req.body.tags
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0);
            }
            
            // Ensure it's an array
            if (!Array.isArray(req.body.tags)) {
                req.body.tags = [];
            }
        }

        // Ensure empty string fields are properly handled
        const stringFields = ['githubLink', 'supervisor', 'author'];
        stringFields.forEach(field => {
            if (req.body[field] === undefined || req.body[field] === null) {
                req.body[field] = '';
            }
        });

        console.log('📋 Preprocessed form data:', {
            title: req.body.title,
            abstractLength: req.body.abstract?.length,
            techStack: req.body.techStack,
            year: req.body.year,
            yearType: typeof req.body.year,
            tags: req.body.tags,
            supervisor: req.body.supervisor,
            githubLink: req.body.githubLink,
        });

        next();
    } catch (error) {
        console.error('Error preprocessing form data:', error);
        next(); // Continue even if preprocessing fails
    }
};

module.exports = { preprocessFormData };
