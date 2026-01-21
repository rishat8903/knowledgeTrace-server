// Database connection and collection access
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

// URL encode username and password to handle special characters
const encodeMongoCredentials = (str) => {
  if (!str) return '';
  // URL encode special characters that might be in username/password
  return encodeURIComponent(str);
};

// Build connection string with proper formatting
const buildConnectionString = () => {
  const username = encodeMongoCredentials(process.env.DB_USERNAME);
  const password = encodeMongoCredentials(process.env.DB_PASSWORD);
  const clusterUrl = 'cluster0.nbmsclf.mongodb.net';
  const dbName = process.env.DB_NAME || 'knowledgeTrace';

  // Proper MongoDB Atlas connection string format:
  // mongodb+srv://<username>:<password>@<cluster-url>/<dbname>?retryWrites=true&w=majority
  const uri = `mongodb+srv://${username}:${password}@${clusterUrl}/${dbName}?retryWrites=true&w=majority&appName=Cluster0`;

  return uri;
};

const uri = buildConnectionString();

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  }
});

let db = null;
let isConnected = false;

async function connectDB() {
  if (isConnected && db) {
    // Verify connection is still alive
    try {
      await db.admin().ping();
      return db;
    } catch (error) {
      console.warn('⚠️  Connection lost, reconnecting...');
      isConnected = false;
      db = null;
    }
  }

  try {
    // Log connection attempt details (without sensitive data)
    const dbName = process.env.DB_NAME || 'knowledgeTrace';
    console.log(`🔌 Connecting to MongoDB...`);
    console.log(`📦 Database name: ${dbName}`);
    console.log(`👤 Username: ${process.env.DB_USERNAME ? 'SET' : 'NOT SET'}`);
    console.log(`🔑 Password: ${process.env.DB_PASSWORD ? 'SET' : 'NOT SET'}`);

    // Validate required environment variables
    if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
      throw new Error('DB_USERNAME and DB_PASSWORD must be set in .env file');
    }

    await client.connect();
    console.log('✅ MongoDB client connected successfully!');

    db = client.db(dbName);

    // Verify connection with a ping
    try {
      await db.admin().ping();
      console.log('✅ Connection verified with ping');
    } catch (pingError) {
      console.warn('⚠️  Ping failed, but continuing:', pingError.message);
    }

    isConnected = true;
    console.log(`✅ Successfully connected to MongoDB database: ${dbName}`);

    // Verify connection by listing collections
    try {
      const collections = await db.listCollections().toArray();
      console.log(`📊 Available collections: ${collections.map(c => c.name).join(', ') || 'None (will be created on first use)'}`);
    } catch (listError) {
      console.warn('Could not list collections:', listError.message);
    }

    // Create indexes for better query performance
    try {
      const usersCollection = db.collection('users');
      const projectsCollection = db.collection('projects');
      const activitiesCollection = db.collection('activities');
      const notificationsCollection = db.collection('notifications');

      // Indexes for users collection
      await usersCollection.createIndex({ uid: 1 }, { unique: true });
      await usersCollection.createIndex({ email: 1 });
      await usersCollection.createIndex({ isAdmin: 1 });

      // Indexes for projects collection
      await projectsCollection.createIndex({ authorId: 1 });
      await projectsCollection.createIndex({ status: 1 });
      await projectsCollection.createIndex({ year: 1 });
      await projectsCollection.createIndex({ createdAt: -1 });
      await projectsCollection.createIndex({ 'likes.userId': 1 });
      await projectsCollection.createIndex({ 'bookmarks.userId': 1 });
      await projectsCollection.createIndex({ likeCount: -1 });
      await projectsCollection.createIndex({ commentCount: -1 });
      await projectsCollection.createIndex({ title: 'text', abstract: 'text', tags: 'text' }); // Text search index

      // Indexes for activities collection
      await activitiesCollection.createIndex({ userId: 1 }, { unique: true });
      await activitiesCollection.createIndex({ 'recentProjects.viewedAt': -1 });
      await activitiesCollection.createIndex({ 'bookmarkedProjects.bookmarkedAt': -1 });

      // Indexes for notifications collection
      await notificationsCollection.createIndex({ userId: 1, read: 1, createdAt: -1 });
      await notificationsCollection.createIndex({ userId: 1, createdAt: -1 });
      await notificationsCollection.createIndex({ projectId: 1 });

      // Indexes for thesis management collections
      const milestonesCollection = db.collection('project_milestones');
      const teamMembersCollection = db.collection('team_members');
      const projectCommentsCollection = db.collection('project_comments');
      const supervisorRequestsCollection = db.collection('supervisor_requests');
      const teamMatchSuggestionsCollection = db.collection('team_match_suggestions');

      // ProjectMilestones indexes
      await milestonesCollection.createIndex({ projectId: 1, phase: 1 });
      await milestonesCollection.createIndex({ status: 1 });
      await milestonesCollection.createIndex({ reviewerId: 1 });

      // TeamMembers indexes
      await teamMembersCollection.createIndex({ projectId: 1 });
      await teamMembersCollection.createIndex({ userId: 1, status: 1 });

      // ProjectComments indexes
      await projectCommentsCollection.createIndex({ projectId: 1, phase: 1 });
      await projectCommentsCollection.createIndex({ userId: 1 });
      await projectCommentsCollection.createIndex({ isResolved: 1 });

      // SupervisorRequests indexes
      await supervisorRequestsCollection.createIndex({ studentId: 1, status: 1 });
      await supervisorRequestsCollection.createIndex({ supervisorId: 1, status: 1 });
      await supervisorRequestsCollection.createIndex({ createdAt: -1 });

      // TeamMatchSuggestions indexes
      await teamMatchSuggestionsCollection.createIndex({ projectId: 1, matchScore: -1 });
      await teamMatchSuggestionsCollection.createIndex({ studentId: 1 });

      console.log('✅ Database indexes created/verified successfully!');
    } catch (indexError) {
      console.warn('⚠️  Error creating indexes (may already exist):', indexError.message);
    }

    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      codeName: error.codeName
    });

    // Provide helpful error messages
    if (error.message.includes('authentication failed')) {
      console.error('💡 Tip: Check your DB_USERNAME and DB_PASSWORD in .env file');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('💡 Tip: Check your MongoDB cluster URL and network access');
    } else if (error.message.includes('different case')) {
      console.error('💡 Tip: Database name case mismatch. Ensure DB_NAME in .env matches your MongoDB database name exactly');
    }

    throw error;
  }
}

// Ensure database is connected before returning
async function ensureConnection() {
  if (!isConnected || !db) {
    await connectDB();
  }
  return db;
}

function getDB() {
  if (!db || !isConnected) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
}

async function getUsersCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }

    const collection = db.collection('users');

    if (!collection) {
      throw new Error('Users collection not available');
    }

    if (typeof collection.findOne !== 'function') {
      const error = new Error('Collection object is not a valid MongoDB collection');
      console.error('❌ getUsersCollection: Collection object is not valid:', collection);
      throw error;
    }

    return collection;
  } catch (error) {
    console.error('❌ Error getting users collection:', error);
    throw error;
  }
}

async function getProjectsCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('projects');
    if (!collection) {
      throw new Error('Projects collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting projects collection:', error);
    throw error;
  }
}

async function getActivitiesCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('activities');
    if (!collection) {
      throw new Error('Activities collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting activities collection:', error);
    throw error;
  }
}

async function getNotificationsCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('notifications');
    if (!collection) {
      throw new Error('Notifications collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting notifications collection:', error);
    throw error;
  }
}

async function getProjectMilestonesCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('project_milestones');
    if (!collection) {
      throw new Error('Project milestones collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting project milestones collection:', error);
    throw error;
  }
}

async function getTeamMembersCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('team_members');
    if (!collection) {
      throw new Error('Team members collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting team members collection:', error);
    throw error;
  }
}

async function getProjectCommentsCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('project_comments');
    if (!collection) {
      throw new Error('Project comments collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting project comments collection:', error);
    throw error;
  }
}

async function getSupervisorRequestsCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('supervisor_requests');
    if (!collection) {
      throw new Error('Supervisor requests collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting supervisor requests collection:', error);
    throw error;
  }
}

async function getTeamMatchSuggestionsCollection() {
  try {
    await ensureConnection();
    const db = getDB();
    if (!db) {
      throw new Error('Database not available');
    }
    const collection = db.collection('team_match_suggestions');
    if (!collection) {
      throw new Error('Team match suggestions collection not available');
    }
    return collection;
  } catch (error) {
    console.error('Error getting team match suggestions collection:', error);
    throw error;
  }
}

module.exports = {
  connectDB,
  getDB,
  getUsersCollection,
  getProjectsCollection,
  getActivitiesCollection,
  getNotificationsCollection,
  getProjectMilestonesCollection,
  getTeamMembersCollection,
  getProjectCommentsCollection,
  getSupervisorRequestsCollection,
  getTeamMatchSuggestionsCollection,
  ensureConnection,
  ObjectId,
  isConnected: () => isConnected,
};


