// Complete diagnostic - run with: node diagnose.js

const { getUsersCollection } = require('./config/database');

async function diagnose() {
    try {
        console.log('=== DIAGNOSTIC REPORT ===\n');

        const usersCollection = await getUsersCollection();

        // 1. Check all users
        const allUsers = await usersCollection.find({}).toArray();
        console.log(`1. TOTAL USERS: ${allUsers.length}\n`);

        // 2. Show recent users
        const recent = allUsers.sort((a, b) =>
            new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        ).slice(0, 5);

        console.log('2. MOST RECENT USERS:');
        recent.forEach((u, i) => {
            console.log(`   ${i + 1}. ${u.name || 'NO NAME'}`);
            console.log(`      Email: ${u.email}`);
            console.log(`      Role: ${u.role || 'NO ROLE'}`);
            console.log(`      Created: ${u.createdAt || 'UNKNOWN'}\n`);
        });

        // 3. Count by role
        const supervisors = allUsers.filter(u => u.role === 'supervisor');
        const students = allUsers.filter(u => u.role === 'student');
        const noRole = allUsers.filter(u => !u.role);

        console.log('3. USERS BY ROLE:');
        console.log(`   Supervisors: ${supervisors.length}`);
        console.log(`   Students: ${students.length}`);
        console.log(`   No Role: ${noRole.length}\n`);

        // 4. Check for professor accounts
        const profAccounts = allUsers.filter(u =>
            u.email?.includes('professor') ||
            u.name?.toLowerCase().includes('professor')
        );

        console.log('4. PROFESSOR ACCOUNTS:');
        if (profAccounts.length === 0) {
            console.log('   ❌ NO PROFESSOR ACCOUNTS FOUND!');
            console.log('   This means account creation failed.\n');
        } else {
            profAccounts.forEach(p => {
                console.log(`   ✓ ${p.name}`);
                console.log(` ` `     Email: ${p.email}`);
                console.log(`     Role: ${p.role || 'NO ROLE'}\n`);
            });
        }

        // 5. Check email patterns
        const iuucEmails = allUsers.filter(u => u.email?.endsWith('@iiuc.ac.bd'));
        const ugradEmails = allUsers.filter(u => u.email?.endsWith('@ugrad.iiuc.ac.bd'));

        console.log('5. EMAIL PATTERNS:');
        console.log(`   @iiuc.ac.bd (faculty): ${iuucEmails.length}`);
        console.log(`   @ugrad.iiuc.ac.bd (student): ${ugradEmails.length}\n`);

        // 6. Show @iiuc.ac.bd users
        if (iuucEmails.length > 0) {
            console.log('6. FACULTY EMAILS (@iiuc.ac.bd):');
            iuucEmails.forEach(u => {
                console.log(`   - ${u.email} (Role: ${u.role || 'NO ROLE'})`);
            });
        } else {
            console.log('6. ❌ NO FACULTY EMAILS FOUND!');
            console.log('   You need to create accounts with @iiuc.ac.bd (not @ugrad.iiuc.ac.bd)');
        }

        console.log('\n=== END DIAGNOSTIC ===');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

diagnose();
