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
    strict: true,
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
      
      // Indexes for users collection
      await usersCollection.createIndex({ uid: 1 }, { unique: true });
      await usersCollection.createIndex({ email: 1 });
      await usersCollection.createIndex({ isAdmin: 1 });
      
      // Indexes for projects collection
      await projectsCollection.createIndex({ authorId: 1 });
      await projectsCollection.createIndex({ status: 1 });
      await projectsCollection.createIndex({ year: 1 });
      await projectsCollection.createIndex({ createdAt: -1 });
      await projectsCollection.createIndex({ title: 'text', abstract: 'text', tags: 'text' }); // Text search index
      
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
    
    console.log('🔍 getUsersCollection: DB object type:', typeof db);
    console.log('🔍 getUsersCollection: DB has collection method?', typeof db.collection === 'function');
    
    const collection = db.collection('users');
    
    console.log('🔍 getUsersCollection: Collection type:', typeof collection);
    console.log('🔍 getUsersCollection: Collection constructor:', collection?.constructor?.name);
    console.log('🔍 getUsersCollection: Collection has findOne?', typeof collection?.findOne === 'function');
    
    if (!collection) {
      throw new Error('Users collection not available');
    }
    
    if (typeof collection.findOne !== 'function') {
      console.error('❌ getUsersCollection: Collection object is not valid');
      console.error('❌ getUsersCollection: Collection value:', collection);
      throw new Error('Collection object is not a valid MongoDB collection');
    }
    
    return collection;
  } catch (error) {
    console.error('❌ Error getting users collection:', error);
    console.error('Error stack:', error.stack);
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

module.exports = {
  connectDB,
  getDB,
  getUsersCollection,
  getProjectsCollection,
  ensureConnection,
  ObjectId,
  isConnected: () => isConnected,
};

