// Script to fix the existing c233137 project with Ashiqur as supervisor
const { getProjectsCollection, getUsersCollection } = require('./config/database');

async function fixProject() {
    try {
        const projects = await getProjectsCollection();
        const users = await getUsersCollection();

        // Find Ashiqur
        const ashiqur = await users.findOne({ name: /ashiqur/i, role: "supervisor" });
        if (!ashiqur) {
            console.log('❌ Ashiqur not found as supervisor');
            process.exit(1);
        }

        console.log('Found Ashiqur:');
        console.log('  UID:', ashiqur.uid);
        console.log('  Name:', ashiqur.name);

        // Update c233137's project
        const result = await projects.updateOne(
            { author: /c233137/i },
            {
                $set: {
                    supervisorId: ashiqur.uid,
                    supervisor: ashiqur.name,
                    supervisorDepartment: ashiqur.department || ''
                }
            }
        );

        console.log('\n✅ Update result:', result.modifiedCount, 'project(s) modified');

        // Verify
        const updated = await projects.findOne({ author: /c233137/i });
        console.log('\nVerified project:');
        console.log('  Title:', updated.title);
        console.log('  Author:', updated.author);
        console.log('  Supervisor:', updated.supervisor);
        console.log('  SupervisorId:', updated.supervisorId);

        console.log('\n✅ Project fixed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixProject();
