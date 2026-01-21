/**
 * Fix Missing Supervisor IDs
 * 
 * This script finds projects that have a supervisor name but no supervisorId,
 * then looks up the supervisor in the users collection and adds the supervisorId.
 * 
 * Usage: node scripts/fixSupervisorIds.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgetrace';

async function fixSupervisorIds() {
    const client = new MongoClient(MONGODB_URI);

    try {
        console.log('🔌 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db();
        const projectsCollection = db.collection('projects');
        const usersCollection = db.collection('users');

        // Find all projects with supervisor name but no supervisorId
        const projectsNeedingFix = await projectsCollection.find({
            supervisor: { $exists: true, $ne: '' },
            $or: [
                { supervisorId: { $exists: false } },
                { supervisorId: '' }
            ]
        }).toArray();

        console.log(`\n📊 Found ${projectsNeedingFix.length} projects needing supervisor ID fix`);

        if (projectsNeedingFix.length === 0) {
            console.log('✅ All projects already have supervisor IDs!');
            return;
        }

        let fixed = 0;
        let notFound = 0;

        for (const project of projectsNeedingFix) {
            console.log(`\n🔍 Processing project: "${project.title}"`);
            console.log(`   Supervisor name: "${project.supervisor}"`);

            // Try to find supervisor by name (case-insensitive)
            const supervisor = await usersCollection.findOne({
                name: new RegExp(`^${project.supervisor.trim()}$`, 'i'),
                role: 'supervisor'
            });

            if (supervisor) {
                // Update project with supervisorId
                await projectsCollection.updateOne(
                    { _id: project._id },
                    {
                        $set: {
                            supervisorId: supervisor.uid,
                            supervisor: supervisor.name, // Normalize name
                            updatedAt: new Date()
                        }
                    }
                );

                console.log(`   ✅ Fixed! Added supervisorId: ${supervisor.uid}`);
                fixed++;
            } else {
                console.log(`   ⚠️  Supervisor not found in users collection`);
                console.log(`   💡 Tip: Make sure "${project.supervisor}" has a registered supervisor account`);
                notFound++;
            }
        }

        console.log(`\n\n📊 Summary:`);
        console.log(`   ✅ Fixed: ${fixed} projects`);
        console.log(`   ⚠️  Not Found: ${notFound} projects`);
        console.log(`   📝 Total Processed: ${projectsNeedingFix.length} projects`);

        if (notFound > 0) {
            console.log(`\n💡 For the ${notFound} projects with supervisors not found:`);
            console.log(`   1. Ensure the supervisor has registered an account`);
            console.log(`   2. Make sure their role is set to 'supervisor'`);
            console.log(`   3. Check that the name matches exactly`);
            console.log(`   4. Run this script again after they register`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\n🔌 Database connection closed');
    }
}

// Run the script
fixSupervisorIds();
