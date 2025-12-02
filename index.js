const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./config/database');

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting middleware (simple in-memory implementation)
const rateLimitStore = new Map();
const rateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  return (req, res, next) => {
    // Skip rate limiting for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // Better IP detection - check various headers for proxy/load balancer scenarios
    const key = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
      || req.headers['x-real-ip'] 
      || req.connection.remoteAddress 
      || req.socket.remoteAddress
      || req.ip 
      || 'unknown';
    
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(key);
    
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    
    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ 
        message: 'Too many requests. Please try again later.',
        retryAfter: retryAfter
      });
    }
    
    record.count++;
    next();
  };
};

// Clear rate limit store on server start (useful for development)
if (process.env.NODE_ENV !== 'production') {
  rateLimitStore.clear();
  console.log('🔄 Rate limit store cleared for development');
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

// Middleware - CORS configuration (MUST be before rate limiting)
const corsOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow the configured client URL
    if (origin === corsOrigin) {
      return callback(null, true);
    }
    
    // In development, also allow localhost on different ports
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS before rate limiting
app.use(cors(corsOptions));

// Log CORS configuration on startup
console.log(`🌐 CORS configured for origin: ${corsOrigin}`);
if (process.env.NODE_ENV !== 'production') {
  console.log('🔓 Development mode: Allowing all localhost origins');
}

// Apply rate limiting (after CORS)
// More lenient rate limiting for development, stricter for production
const isDevelopment = process.env.NODE_ENV !== 'production';
const generalRateLimit = rateLimit(
  15 * 60 * 1000, 
  isDevelopment ? 1000 : 200 // Much higher limit in development
);

app.use((req, res, next) => {
  // Skip rate limiting for GET requests to /api/projects in development
  if (isDevelopment && req.method === 'GET' && req.path.startsWith('/api/projects')) {
    return next();
  }
  return generalRateLimit(req, res, next);
});

// Stricter rate limiting for auth endpoints
const authRateLimit = rateLimit(15 * 60 * 1000, isDevelopment ? 100 : 20);

// Add security headers to help with OAuth popups
app.use((req, res, next) => {
  // Allow popups for OAuth
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const adminRoutes = require('./routes/admin');

// Apply rate limiting to user routes, but exclude GET /profile from strict limiting
// (it's a read-only operation that's called frequently)
app.use('/api/users', (req, res, next) => {
  // GET /profile is less critical and called frequently, use general rate limit
  if (req.method === 'GET' && req.path === '/profile') {
    return next(); // Use general rate limit (200 requests per 15 min)
  }
  // Other user routes use stricter rate limiting
  return authRateLimit(req, res, next);
}, userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admin', authRateLimit, adminRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'KnowledgeTrace API is running!', status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start listening
    app.listen(port, () => {
      console.log(`🚀 KnowledgeTrace server is running on port ${port}`);
      console.log(`📡 API available at http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
