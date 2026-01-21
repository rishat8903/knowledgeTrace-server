/**
 * Quick Check: Verify if user is admin in database
 * This is a diagnostic script to check the current state
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgetrace';
const CHECK_EMAIL = 'safin@ugrad.iiuc.ac.bd';

async function checkAdmin() {
    const client = new MongoClient(MONGODB_URI);

    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log('📍 URI:', MONGODB_URI.replace(/:[^:]*@/, ':****@')); // Hide password

        await client.connect();
        console.log('✅ Connected successfully\n');

        const db = client.db();
        const usersCollection = db.collection('users');

        const user = await usersCollection.findOne({ email: CHECK_EMAIL });

        if (!user) {
            console.log(`❌ User NOT FOUND: ${CHECK_EMAIL}`);
            console.log('\n💡 This user needs to REGISTER first before being made admin');
            console.log('   1. Go to your app');
            console.log('   2. Register with:', CHECK_EMAIL);
            console.log('   3. Then run the setAdmin script');
        } else {
            console.log(`✅ User FOUND: ${CHECK_EMAIL}`);
            console.log('\n📋 Current Status:');
            console.log('   Name:', user.name || user.displayName || 'Not set');
            console.log('   Role:', user.role || 'Not set');
            console.log('   isAdmin:', user.isAdmin || false);
            console.log('   UID:', user.uid);

            if (user.isAdmin === true) {
                console.log('\n✅ ✅ USER IS ADMIN - Should see admin dashboard!');
                console.log('\n🔍 If admin dashboard still not showing:');
                console.log('   1. Make sure backend is running (npm start)');
                console.log('   2. Check browser console (F12) for API errors');
                console.log('   3. Try in incognito window');
                console.log('   4. Check Network tab for /users/profile response');
            } else {
                console.log('\n❌ USER IS NOT ADMIN - Need to run setAdmin script');
                console.log('\n📝 To fix:');
                console.log('   cd knowledgeTrace-server');
                console.log('   node scripts/setAdmin.js');
            }
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Cannot connect to MongoDB');
            console.log('   - If using MongoDB Atlas: check MONGODB_URI in .env');
            console.log('   - If using local MongoDB: is it running?');
        }
    } finally {
        await client.close();
        console.log('\n🔌 Connection closed');
    }
}

checkAdmin();
