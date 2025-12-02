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

module.exports = {
  verifyToken,
  optionalAuth,
  requireAdmin,
};

