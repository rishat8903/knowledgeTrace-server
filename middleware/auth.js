// Firebase token verification middleware
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      console.warn('Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT_KEY in .env');
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split('Bearer ')[1].trim();

    if (!token) {
      return res.status(401).json({
        message: 'Token is empty',
        code: 'EMPTY_TOKEN'
      });
    }

    if (!admin.apps.length) {
      // If Firebase Admin is not configured, skip verification (for development only)
      if (process.env.NODE_ENV === 'production') {
        console.error('Firebase Admin not configured in production!');
        return res.status(500).json({
          message: 'Server configuration error',
          code: 'CONFIG_ERROR'
        });
      }
      console.warn('Firebase Admin not configured, skipping token verification (DEV MODE)');
      req.user = { uid: 'dev-user', email: 'dev@example.com', name: 'Dev User' };
      return next();
    }

    // Verify the token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Ensure we have required fields
    if (!decodedToken.uid) {
      return res.status(401).json({
        message: 'Invalid token: missing user ID',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);

    // Provide specific error messages
    let message = 'Invalid or expired token';
    let code = 'TOKEN_ERROR';

    if (error.code === 'auth/id-token-expired') {
      message = 'Token has expired. Please login again.';
      code = 'TOKEN_EXPIRED';
    } else if (error.code === 'auth/id-token-revoked') {
      message = 'Token has been revoked. Please login again.';
      code = 'TOKEN_REVOKED';
    } else if (error.code === 'auth/argument-error') {
      message = 'Invalid token format.';
      code = 'INVALID_FORMAT';
    }

    return res.status(401).json({
      message,
      code
    });
  }
};

// Optional middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];

      if (admin.apps.length) {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email?.split('@')[0],
        };
      } else {
        req.user = { uid: 'dev-user', email: 'dev@example.com' };
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Middleware to check if user is admin
// This MUST be used after verifyToken middleware
const requireAdmin = async (req, res, next) => {
  try {
    // Ensure user is authenticated first
    if (!req.user || !req.user.uid) {
      console.error('❌ requireAdmin: No user or uid in request');
      return res.status(401).json({
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    console.log(`🔍 requireAdmin: Checking admin status for user: ${req.user.uid}`);

    // Check database for admin status
    const { getUsersCollection } = require('../config/database');

    let usersCollection;
    try {
      usersCollection = await getUsersCollection();

      // Verify it's actually a collection
      if (!usersCollection || typeof usersCollection.findOne !== 'function') {
        console.error('❌ requireAdmin: Invalid collection object');
        console.error('❌ requireAdmin: Collection type:', typeof usersCollection);
        console.error('❌ requireAdmin: Collection value:', usersCollection);
        return res.status(500).json({
          message: 'Database collection not available or invalid',
          code: 'DB_ERROR',
          error: process.env.NODE_ENV === 'development' ? 'Collection object is not valid' : undefined
        });
      }

      console.log('✅ requireAdmin: Got valid users collection');
    } catch (dbError) {
      console.error('❌ requireAdmin: Error getting users collection:', dbError);
      console.error('Error stack:', dbError.stack);
      return res.status(500).json({
        message: 'Database connection error',
        code: 'DB_CONNECTION_ERROR',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    let user;
    try {
      user = await usersCollection.findOne({ uid: req.user.uid });
      console.log(`🔍 requireAdmin: Found user: ${user ? 'Yes' : 'No'}, isAdmin: ${user?.isAdmin}`);
    } catch (findError) {
      console.error('❌ requireAdmin: Error finding user:', findError);
      console.error('Error stack:', findError.stack);
      return res.status(500).json({
        message: 'Error querying user database',
        code: 'DB_QUERY_ERROR',
        error: process.env.NODE_ENV === 'development' ? findError.message : undefined
      });
    }

    if (!user) {
      console.warn(`⚠️ requireAdmin: User profile not found for uid: ${req.user.uid}`);
      return res.status(403).json({
        message: 'User profile not found. Please complete your profile.',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check admin status - must be explicitly true
    if (user.isAdmin !== true) {
      console.warn(`🚫 requireAdmin: User ${req.user.uid} is not admin (isAdmin: ${user.isAdmin})`);
      return res.status(403).json({
        message: 'Admin access required',
        code: 'FORBIDDEN'
      });
    }

    console.log(`✅ requireAdmin: User ${req.user.uid} is verified as admin`);
    // Attach admin status to request object
    req.user.isAdmin = true;
    req.user.adminVerified = true; // Flag that admin status was verified

    next();
  } catch (error) {
    console.error('❌ requireAdmin: Unexpected error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      message: 'Error checking admin status',
      code: 'ADMIN_CHECK_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Middleware to check if user has required role(s)
 * This is a more flexible alternative to requireAdmin
 * Usage: checkRole(['supervisor', 'admin'])
 * @param {string|string[]} allowedRoles - Role(s) that are allowed to access the route
 * @returns {Function} Express middleware function
 */
const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated first
      if (!req.user || !req.user.uid) {
        console.error(`❌ checkRole: No user or uid in request`);
        return res.status(401).json({
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      console.log(`🔍 checkRole: Checking if user ${req.user.uid} has one of roles: ${roles.join(', ')}`);

      // Get user from database to check role
      const { getUsersCollection } = require('../config/database');

      let usersCollection;
      try {
        usersCollection = await getUsersCollection();

        if (!usersCollection || typeof usersCollection.findOne !== 'function') {
          console.error('❌ checkRole: Invalid collection object');
          return res.status(500).json({
            message: 'Database collection not available',
            code: 'DB_ERROR'
          });
        }
      } catch (dbError) {
        console.error('❌ checkRole: Error getting users collection:', dbError);
        return res.status(500).json({
          message: 'Database connection error',
          code: 'DB_CONNECTION_ERROR'
        });
      }

      let user;
      try {
        user = await usersCollection.findOne({ uid: req.user.uid });
        console.log(`🔍 checkRole: Found user: ${user ? 'Yes' : 'No'}, role: ${user?.role}`);
      } catch (findError) {
        console.error('❌ checkRole: Error finding user:', findError);
        return res.status(500).json({
          message: 'Error querying user database',
          code: 'DB_QUERY_ERROR'
        });
      }

      if (!user) {
        console.warn(`⚠️ checkRole: User profile not found for uid: ${req.user.uid}`);
        return res.status(403).json({
          message: 'User profile not found. Please complete your profile.',
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if user has one of the allowed roles
      const userRole = user.role || 'student'; // Default to student if no role set

      if (!roles.includes(userRole)) {
        console.warn(`🚫 checkRole: User ${req.user.uid} has role '${userRole}', but needs one of: ${roles.join(', ')}`);
        return res.status(403).json({
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          required: roles,
          current: userRole
        });
      }

      console.log(`✅ checkRole: User ${req.user.uid} has valid role '${userRole}'`);
      // Attach role to request object
      req.user.role = userRole;
      req.user.roleVerified = true;

      next();
    } catch (error) {
      console.error('❌ checkRole: Unexpected error:', error);
      return res.status(500).json({
        message: 'Error checking user permissions',
        code: 'PERMISSION_CHECK_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Middleware to verify that the authenticated user has a university student email
 * This should be used AFTER verifyToken middleware
 * Usage: router.post('/route', verifyToken, verifyStudentEmail, controller)
 */
const verifyStudentEmail = async (req, res, next) => {
  try {
    // Ensure user is authenticated first
    if (!req.user || !req.user.email) {
      console.error('❌ verifyStudentEmail: No user or email in request');
      return res.status(401).json({
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const { validateUniversityEmail } = require('../utils/emailValidator');
    const validation = validateUniversityEmail(req.user.email);

    if (!validation.isValid) {
      console.warn(`⚠️ Access denied for non-university email: ${req.user.email}`);
      return res.status(403).json({
        message: validation.message,
        code: 'INVALID_EMAIL_DOMAIN'
      });
    }

    console.log(`✅ University email verified: ${req.user.email}`);
    next();
  } catch (error) {
    console.error('❌ verifyStudentEmail: Unexpected error:', error);
    return res.status(500).json({
      message: 'Error verifying email domain',
      code: 'EMAIL_VERIFICATION_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  verifyToken,
  optionalAuth,
  requireAdmin,
  checkRole,
  verifyStudentEmail,
};


