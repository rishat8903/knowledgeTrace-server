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

        const existingUser = await usersCollection.findOne({ uid: req.user.uid });

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

module.exports = {
    getUserProfile: exports.getUserProfile,
    createOrUpdateUser: exports.createOrUpdateUser,
    updateUserProfile: exports.updateUserProfile,
};
