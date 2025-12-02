// Script to set a user as admin in MongoDB
// Usage: node scripts/set-admin.js <email_or_uid>

require('dotenv').config();
const { connectDB, getUsersCollection } = require('../config/database');

async function setAdmin(emailOrUid) {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    
    const { getDB } = require('../config/database');
    const db = getDB();
    
    // Check both 'users' and 'user' collections (in case of naming inconsistency)
    const usersCollection = db.collection('users');
    const userCollection = db.collection('user');
    
    // Try to find user by email or uid in both collections
    const query = emailOrUid.includes('@') 
      ? { email: emailOrUid }
      : { uid: emailOrUid };
    
    console.log(`🔍 Looking for user with: ${JSON.stringify(query)}`);
    
    let user = await usersCollection.findOne(query);
    let collectionName = 'users';
    
    // If not found in 'users', try 'user' collection
    if (!user) {
      console.log('   Not found in "users" collection, checking "user" collection...');
      user = await userCollection.findOne(query);
      if (user) {
        collectionName = 'user';
      }
    }
    
    if (!user) {
      console.error('\n❌ User not found in either collection!');
      
      // List all users to help identify the correct one
      console.log('\n📋 Listing all users in database:');
      console.log('─'.repeat(60));
      
      const allUsersFromUsers = await usersCollection.find({}).toArray();
      const allUsersFromUser = await userCollection.find({}).toArray();
      
      if (allUsersFromUsers.length > 0) {
        console.log(`\n📦 Found ${allUsersFromUsers.length} user(s) in "users" collection:`);
        allUsersFromUsers.forEach((u, idx) => {
          console.log(`   ${idx + 1}. Email: ${u.email || 'N/A'}`);
          console.log(`      UID: ${u.uid || 'N/A'}`);
          console.log(`      Name: ${u.name || 'N/A'}`);
          console.log(`      Admin: ${u.isAdmin || false}`);
          console.log('');
        });
      }
      
      if (allUsersFromUser.length > 0) {
        console.log(`\n📦 Found ${allUsersFromUser.length} user(s) in "user" collection:`);
        allUsersFromUser.forEach((u, idx) => {
          console.log(`   ${idx + 1}. Email: ${u.email || 'N/A'}`);
          console.log(`      UID: ${u.uid || 'N/A'}`);
          console.log(`      Name: ${u.name || 'N/A'}`);
          console.log(`      Admin: ${u.isAdmin || false}`);
          console.log('');
        });
      }
      
      if (allUsersFromUsers.length === 0 && allUsersFromUser.length === 0) {
        console.log('   ⚠️  No users found in database!');
        console.log('   Make sure you have logged in at least once.');
      }
      
      console.log('─'.repeat(60));
      console.log('\n💡 Tips:');
      console.log('   1. Use the exact email or UID from the list above');
      console.log('   2. Make sure you have logged in at least once');
      console.log('   3. Check for typos in the email address');
      
      process.exit(1);
    }
    
    console.log(`✅ User found in "${collectionName}" collection:`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Current Admin Status: ${user.isAdmin || false}`);
    
    // Use the correct collection for update
    const targetCollection = collectionName === 'users' ? usersCollection : userCollection;
    
    // Update admin status
    const result = await targetCollection.updateOne(
      { _id: user._id },
      { $set: { isAdmin: true, updatedAt: new Date() } }
    );
    
    if (result.modifiedCount > 0) {
      console.log('\n✅ Successfully set user as admin!');
      console.log('\n📝 Next steps:');
      console.log('   1. Log out and log back in (or refresh the page)');
      console.log('   2. You should now see the "Admin" button in the navbar');
      console.log('   3. Click it to access the admin dashboard');
    } else if (result.matchedCount > 0) {
      console.log('\n⚠️  User was already an admin');
    } else {
      console.error('\n❌ Failed to update user');
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Function to list all users
async function listAllUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    
    const { getDB } = require('../config/database');
    const db = getDB();
    
    const usersCollection = db.collection('users');
    const userCollection = db.collection('user');
    
    console.log('\n📋 Listing all users in database:');
    console.log('═'.repeat(70));
    
    const allUsersFromUsers = await usersCollection.find({}).toArray();
    const allUsersFromUser = await userCollection.find({}).toArray();
    
    if (allUsersFromUsers.length > 0) {
      console.log(`\n📦 "users" collection (${allUsersFromUsers.length} user(s)):`);
      console.log('─'.repeat(70));
      allUsersFromUsers.forEach((u, idx) => {
        console.log(`\n   ${idx + 1}. Name: ${u.name || 'N/A'}`);
        console.log(`      Email: ${u.email || 'N/A'}`);
        console.log(`      UID: ${u.uid || 'N/A'}`);
        console.log(`      Admin: ${u.isAdmin === true ? '✅ YES' : '❌ NO'}`);
        console.log(`      Created: ${u.createdAt ? new Date(u.createdAt).toLocaleString() : 'N/A'}`);
      });
    }
    
    if (allUsersFromUser.length > 0) {
      console.log(`\n📦 "user" collection (${allUsersFromUser.length} user(s)):`);
      console.log('─'.repeat(70));
      allUsersFromUser.forEach((u, idx) => {
        console.log(`\n   ${idx + 1}. Name: ${u.name || 'N/A'}`);
        console.log(`      Email: ${u.email || 'N/A'}`);
        console.log(`      UID: ${u.uid || 'N/A'}`);
        console.log(`      Admin: ${u.isAdmin === true ? '✅ YES' : '❌ NO'}`);
        console.log(`      Created: ${u.createdAt ? new Date(u.createdAt).toLocaleString() : 'N/A'}`);
      });
    }
    
    if (allUsersFromUsers.length === 0 && allUsersFromUser.length === 0) {
      console.log('\n   ⚠️  No users found in database!');
      console.log('   Make sure you have logged in at least once.');
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('\n💡 To set admin, use:');
    console.log('   node scripts/set-admin.js <email>');
    console.log('   node scripts/set-admin.js <uid>');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Get command line argument
const emailOrUid = process.argv[2];

// If "list" command, show all users
if (emailOrUid === 'list' || emailOrUid === '--list' || emailOrUid === '-l') {
  listAllUsers();
} else if (!emailOrUid) {
  console.error('❌ Please provide an email, UID, or use "list" command');
  console.log('\n📖 Usage:');
  console.log('   node scripts/set-admin.js <email>');
  console.log('   node scripts/set-admin.js <firebase_uid>');
  console.log('   node scripts/set-admin.js list          # List all users');
  console.log('\n📝 Examples:');
  console.log('   node scripts/set-admin.js admin@example.com');
  console.log('   node scripts/set-admin.js abc123xyz789');
  console.log('   node scripts/set-admin.js list');
  process.exit(1);
} else {
  setAdmin(emailOrUid);
}

