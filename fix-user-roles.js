// Migration Script to Fix Existing User Roles
// Run this with: node fix-user-roles.js

const { getUsersCollection } = require('./config/database');

async function fixUserRoles() {
    try {
        const usersCollection = await getUsersCollection();

        // Find all users without roles or with incorrect roles
        const usersToFix = await usersCollection.find({}).toArray();

        console.log(`Found ${usersToFix.length} total users`);

        let fixed = 0;
        for (const user of usersToFix) {
            const email = user.email;
            let newRole = null;

            // Determine correct role based on email
            if (email?.endsWith('@ugrad.iiuc.ac.bd')) {
                newRole = 'student';
            } else if (email?.endsWith('@iiuc.ac.bd')) {
                newRole = 'supervisor';
            } else {
                newRole = 'student'; // Fallback for non-university emails
            }

            // Only update if role is different
            if (user.role !== newRole) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: { role: newRole, updatedAt: new Date() } }
                );
                console.log(`✅ Fixed ${user.name} (${email}): ${user.role || 'NO ROLE'} → ${newRole}`);
                fixed++;
            } else {
                console.log(`✓ ${user.name} (${email}): role already correct (${newRole})`);
            }
        }

        console.log(`\\n🎉 Migration complete! Fixed ${fixed} users`);

        // Show final counts
        const supervisors = await usersCollection.countDocuments({ role: 'supervisor' });
        const students = await usersCollection.countDocuments({ role: 'student' });
        console.log(`\\nFinal counts:`);
        console.log(`  Supervisors: ${supervisors}`);
        console.log(`  Students: ${students}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixUserRoles();
