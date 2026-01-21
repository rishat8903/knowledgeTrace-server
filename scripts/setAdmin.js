/**
 * Admin Setup Script
 * Sets a user as admin by marking isAdmin flag in the database
 * 
 * Usage:
 * 1. Make sure MongoDB is running
 * 2. Update ADMIN_EMAIL below with the faculty email
 * 3. Run: node scripts/setAdmin.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

// ============================================
// CONFIGURE ADMIN EMAIL HERE
// ============================================
const ADMIN_EMAIL = 'safin@ugrad.iiuc.ac.bd';  // Change this to the admin email
// ============================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgetrace';

async function setAdmin() {
    const client = new MongoClient(MONGODB_URI);

    try {
        console.log('🔌 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db();
        const usersCollection = db.collection('users');

        // Check if user exists
        const user = await usersCollection.findOne({ email: ADMIN_EMAIL });

        if (!user) {
            console.log(`❌ User with email ${ADMIN_EMAIL} not found!`);
            console.log('\n📝 INSTRUCTIONS:');
            console.log('1. First, register an account with this email in the application');
            console.log('2. Then run this script again to grant admin privileges');
            process.exit(1);
        }

        // Update user to admin
        const result = await usersCollection.updateOne(
            { email: ADMIN_EMAIL },
            {
                $set: {
                    isAdmin: true,
                    role: 'admin',
                    updatedAt: new Date()
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`✅ Successfully granted admin privileges to: ${ADMIN_EMAIL}`);
            console.log(`   Name: ${user.name || user.displayName || 'N/A'}`);
            console.log(`   UID: ${user.uid}`);
            console.log('\n🎉 Admin setup complete!');
            console.log('   The user can now access the admin dashboard at /admin');
        } else {
            console.log(`ℹ️  User ${ADMIN_EMAIL} is already an admin`);
        }

    } catch (error) {
        console.error('❌ Error setting admin:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('🔌 Database connection closed');
    }
}

// Run the script
setAdmin();
