// User Controller
// Handles all user-related business logic
const { getUsersCollection } = require('../config/database');
const User = require('../models/User');

/**
 * Get current user's profile
 */
exports.getUserProfile = async (req, res) => {
    try {
        const usersCollection = await getUsersCollection();
        const user = await usersCollection.findOne({ uid: req.user.uid });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(new User(user).toJSON());
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Error fetching user profile' });
    }
};

/**
 * Create or update user profile (used during registration/login)
 */
exports.createOrUpdateUser = async (req, res) => {
    try {
        const usersCollection = await getUsersCollection();

        // Validate and sanitize input
        const name = req.body.name || req.user.name || req.user.email?.split('@')[0] || 'User';
        if (name.length > 100) {
            return res.status(400).json({ message: 'Name must be less than 100 characters' });
        }

        const existingUser = await usersCollection.findOne({ uid: req.user.uid });

        // Validate email domain for NEW users only
        if (!existingUser) {
            const { validateUniversityEmail } = require('../utils/emailValidator');
            const validation = validateUniversityEmail(req.user.email);

            if (!validation.isValid) {
                console.warn(`⚠️ Signup blocked for non-university email: ${req.user.email}`);
                return res.status(403).json({
                    message: validation.message,
                    code: 'INVALID_EMAIL_DOMAIN'
                });
            }

            console.log(`✅ University email validated: ${req.user.email}`);
        }

        // Ensure required fields
        const userData = {
            name: String(name).trim().substring(0, 100),
            email: req.user.email,
            uid: req.user.uid,
            updatedAt: new Date(),
        };

        // Only include photoURL if provided and valid
        if (req.body.photoURL) {
            const photoURL = String(req.body.photoURL).trim();
            if (photoURL.length > 0 && photoURL.length <= 500) {
                try {
                    new URL(photoURL); // Validate URL format
                    userData.photoURL = photoURL;
                } catch {
                    return res.status(400).json({ message: 'Invalid photo URL format' });
                }
            }
        }

        if (existingUser) {
            // Update existing user
            await usersCollection.updateOne(
                { uid: req.user.uid },
                { $set: userData }
            );
            const updatedUser = await usersCollection.findOne({ uid: req.user.uid });
            res.json({ message: 'User profile updated', user: new User(updatedUser).toJSON() });
        } else {
            // Create new user
            userData.createdAt = new Date();
            userData.isAdmin = false; // Default to non-admin
            const result = await usersCollection.insertOne(userData);
            const newUser = await usersCollection.findOne({ _id: result.insertedId });
            res.status(201).json({ message: 'User profile created', user: new User(newUser).toJSON() });
        }
    } catch (error) {
        console.error('Error creating/updating user:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            message: 'Error creating/updating user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update user profile (for profile edits)
 */
exports.updateUserProfile = async (req, res) => {
    try {
        const usersCollection = await getUsersCollection();

        // Validate and sanitize allowed fields
        const allowedFields = ['name', 'photoURL', 'bio', 'location', 'website'];
        const updateData = {
            updatedAt: new Date(),
        };

        // Validate each allowed field
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                const value = String(req.body[field]).trim();

                switch (field) {
                    case 'name':
                        if (value.length === 0 || value.length > 100) {
                            return res.status(400).json({ message: 'Name must be between 1 and 100 characters' });
                        }
                        updateData.name = value;
                        break;
                    case 'photoURL':
                        if (value.length > 0) {
                            if (value.length > 500) {
                                return res.status(400).json({ message: 'Photo URL too long' });
                            }
                            try {
                                new URL(value); // Validate URL
                                updateData.photoURL = value;
                            } catch {
                                return res.status(400).json({ message: 'Invalid photo URL format' });
                            }
                        } else {
                            updateData.photoURL = null;
                        }
                        break;
                    case 'bio':
                        if (value.length > 500) {
                            return res.status(400).json({ message: 'Bio must be less than 500 characters' });
                        }
                        updateData.bio = value;
                        break;
                    case 'location':
                        if (value.length > 100) {
                            return res.status(400).json({ message: 'Location must be less than 100 characters' });
                        }
                        updateData.location = value;
                        break;
                    case 'website':
                        if (value.length > 0) {
                            if (value.length > 200) {
                                return res.status(400).json({ message: 'Website URL too long' });
                            }
                            try {
                                new URL(value); // Validate URL
                                updateData.website = value;
                            } catch {
                                return res.status(400).json({ message: 'Invalid website URL format' });
                            }
                        } else {
                            updateData.website = null;
                        }
                        break;
                }
            }
        }

        const result = await usersCollection.updateOne(
            { uid: req.user.uid },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updatedUser = await usersCollection.findOne({ uid: req.user.uid });
        res.json({ message: 'Profile updated successfully', user: new User(updatedUser).toJSON() });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Error updating profile' });
    }
};

/**
 * Get public user profile by ID (no authentication required)
 * GET /api/users/:id
 */
exports.getPublicUserProfile = async (req, res) => {
    try {
        const usersCollection = await getUsersCollection();
        const { id } = req.params;

        // Find user by uid
        const user = await usersCollection.findOne({ uid: id });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get user's approved projects (if needed later, for now just return user)
        // We'll fetch projects on the frontend via getUserProjects endpoint

        // Sanitize user data (exclude sensitive information)
        const publicUserData = {
            uid: user.uid,
            name: user.name || user.displayName,
            displayName: user.displayName || user.name,
            photoURL: user.photoURL,
            department: user.department,
            year: user.year,
            skills: Array.isArray(user.skills) ? user.skills : (user.skills ? user.skills.split(',').map(s => s.trim()) : []),
            bio: user.bio || '',
            headline: user.headline || '',
            socialLinks: user.socialLinks || {
                github: user.github || '',
                linkedin: user.linkedin || '',
                website: user.website || ''
            },
            github: user.github || '', // Keep for backward compatibility
            linkedin: user.linkedin || '', // Keep for backward compatibility
            createdAt: user.createdAt,
            // Explicitly exclude email, isAdmin, etc.
        };

        res.json({
            success: true,
            user: publicUserData,
        });
    } catch (error) {
        console.error('Error fetching public user profile:', error);
        res.status(500).json({ message: 'Error fetching user profile' });
    }
};

module.exports = {
    getUserProfile: exports.getUserProfile,
    createOrUpdateUser: exports.createOrUpdateUser,
    updateUserProfile: exports.updateUserProfile,
    getPublicUserProfile: exports.getPublicUserProfile,
};
