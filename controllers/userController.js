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

        // Auto-fix role if it's missing or incorrect based on email domain
        const facultyDomain = '@iiuc.ac.bd';
        const studentDomain = '@ugrad.iiuc.ac.bd';
        const isFacultyEmail = user.email?.endsWith(facultyDomain) && !user.email?.endsWith(studentDomain);

        if (!user.role || (user.role === 'student' && isFacultyEmail)) {
            const updatedRole = isFacultyEmail ? 'supervisor' : 'student';
            await usersCollection.updateOne(
                { uid: req.user.uid },
                { $set: { role: updatedRole, updatedAt: new Date() } }
            );
            user.role = updatedRole; // Update local object for response
            console.log(`✅ Corrected role for user ${user.email} to ${updatedRole}`);
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

        // Determine role: prioritize request body, then automatic detection from email
        // ALWAYS set a role - no user should be created without one
        if (req.body.role) {
            console.log(`✅ Role provided in request body: ${req.body.role}`);
            userData.role = req.body.role;
        } else if (!existingUser) {
            // Auto-assign role for new users based on email domain
            if (req.user.email?.endsWith('@ugrad.iiuc.ac.bd')) {
                userData.role = 'student';
                console.log(`✅ Auto-assigned role 'student' for @ugrad.iiuc.ac.bd email`);
            } else if (req.user.email?.endsWith('@iiuc.ac.bd')) {
                userData.role = 'supervisor';
                console.log(`✅ Auto-assigned role 'supervisor' for @iiuc.ac.bd email`);
            } else {
                userData.role = 'student'; // Fallback
                console.log(`⚠️  Fallback role 'student' assigned for non-university email`);
            }
        } else {
            // For existing users, correct role if needed
            const isFacultyEmail = req.user.email?.endsWith('@iiuc.ac.bd')
                && !req.user.email?.endsWith('@ugrad.iiuc.ac.bd');

            if (existingUser.isAdmin === true) {
                userData.role = 'admin';
                console.log(`✅ User is admin, setting role to 'admin'`);
            } else if (!existingUser.role) {
                // User has no role - assign based on email
                userData.role = isFacultyEmail ? 'supervisor' : 'student';
                console.log(`✅ Assigning role '${userData.role}' based on email`);
            } else if (existingUser.role === 'student' && isFacultyEmail) {
                // Supervisor email stuck as student - correct it
                userData.role = 'supervisor';
                console.log(`✅ Correcting student role to supervisor for faculty email`);
            } else {
                // Keep existing role
                userData.role = existingUser.role;
            }
        }

        console.log(`📝 Final user data for ${existingUser ? 'UPDATE' : 'CREATE'}:`, {
            email: userData.email,
            role: userData.role,
            name: userData.name
        });

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
            console.log(`🔄 Updating user ${userData.email} with role: ${userData.role}`);
            await usersCollection.updateOne(
                { uid: req.user.uid },
                { $set: userData }
            );
            const updatedUser = await usersCollection.findOne({ uid: req.user.uid });
            console.log(`✅ User updated. Current role in DB: ${updatedUser.role}`);
            res.json({ message: 'User profile updated', user: new User(updatedUser).toJSON() });
        } else {
            // Create new user
            userData.createdAt = new Date();
            userData.isAdmin = false; // Default to non-admin
            console.log(`➕ Creating new user ${userData.email} with role: ${userData.role}`);
            const result = await usersCollection.insertOne(userData);
            const newUser = await usersCollection.findOne({ _id: result.insertedId });
            console.log(`✅ User created. Role in DB: ${newUser.role}`);
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
 * Enhanced version with statistics and role-specific data
 */
exports.getPublicUserProfile = async (req, res) => {
    try {
        const { getProjectsCollection } = require('../config/database');
        const Project = require('../models/Project');

        const usersCollection = await getUsersCollection();
        const projectsCollection = await getProjectsCollection();
        const { id } = req.params;

        // Find user by uid
        const user = await usersCollection.findOne({ uid: id });

        if (!user) {
            console.log(`⚠️ Profile request for non-existent user: ${id}`);
            return res.status(404).json({
                message: 'User profile not found',
                suggestion: 'This user may not have created an account yet'
            });
        }

        // Get user's projects based on role
        const projectQuery = user.role === 'supervisor'
            ? { supervisorId: id }
            : { authorId: id };

        const projects = await projectsCollection
            .find(projectQuery)
            .sort({ createdAt: -1 })
            .toArray();

        // Calculate statistics
        const totalViews = projects.reduce((sum, p) => sum + (p.views || 0), 0);
        const totalLikes = projects.reduce((sum, p) => sum + (p.likeCount || 0), 0);

        // Build public profile (hide sensitive data like phone, address, etc.)
        const publicUserData = {
            uid: user.uid,
            name: user.name || user.displayName,
            displayName: user.displayName || user.name,
            email: user.email, // Email is public in academic context
            photoURL: user.photoURL,
            department: user.department,
            role: user.role,
            bio: user.bio || '',
            headline: user.headline || '',
            socialLinks: user.socialLinks || {
                github: user.github || '',
                linkedin: user.linkedin || '',
                website: user.website || ''
            },
            createdAt: user.createdAt
        };

        // Add role-specific fields
        if (user.role === 'student') {
            publicUserData.year = user.year;
            publicUserData.skills = Array.isArray(user.skills)
                ? user.skills
                : (user.skills ? user.skills.split(',').map(s => s.trim()) : []);
            publicUserData.stats = {
                projectCount: projects.length,
                totalViews: totalViews,
                totalLikes: totalLikes
            };
            publicUserData.projects = projects.map(p => new Project(p).toJSON());
        } else if (user.role === 'supervisor') {
            publicUserData.designation = user.designation;
            publicUserData.researchAreas = user.researchAreas || [];
            publicUserData.officeHours = user.officeHours;
            publicUserData.stats = {
                supervisedCount: projects.length,
                activeProjects: projects.filter(p => ['pending', 'approved'].includes(p.status)).length,
                completedProjects: projects.filter(p => p.status === 'completed').length
            };
            publicUserData.recentProjects = projects.slice(0, 10).map(p => new Project(p).toJSON());
        }

        res.json({
            success: true,
            user: publicUserData,
        });
    } catch (error) {
        console.error('Error fetching public user profile:', error);
        res.status(500).json({
            message: 'Error fetching user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getUserProfile: exports.getUserProfile,
    createOrUpdateUser: exports.createOrUpdateUser,
    updateUserProfile: exports.updateUserProfile,
    getPublicUserProfile: exports.getPublicUserProfile,
};
