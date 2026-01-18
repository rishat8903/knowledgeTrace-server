const { getUsersCollection, getProjectsCollection } = require('./config/database');

async function checkAshiqurData() {
    const users = await getUsersCollection();
    const projects = await getProjectsCollection();

    // Find Ashiqur supervisor
    const ashiqur = await users.findOne({ name: /ashiqur/i, role: 'supervisor' });
    console.log('=== ASHIQUR (Supervisor) ===');
    console.log('UID:', ashiqur.uid);
    console.log('Name:', ashiqur.name);
    console.log('Email:', ashiqur.email);
    console.log('Role:', ashiqur.role);
    console.log('DisplayName:', ashiqur.displayName || 'NOT SET');

    // Find projects by or supervised by Ashiqur
    const ashiqurAuthor = await projects.find({ authorId: ashiqur.uid }).toArray();
    const ashiqurSupervised = await projects.find({ supervisorId: ashiqur.uid }).toArray();

    console.log('\n=== PROJECTS WHERE ASHIQUR IS AUTHOR ===');
    console.log('Count:', ashiqurAuthor.length);
    ashiqurAuthor.forEach(p => {
        console.log('\nTitle:', p.title);
        console.log('  Author:', p.author);
        console.log('  Supervisor:', p.supervisor || 'NONE'); console.log('  SupervisorId:', p.supervisorId || 'NONE');
    });

    console.log('\n=== PROJECTS WHERE ASHIQUR IS SUPERVISOR ===');
    console.log('Count:', ashiqurSupervised.length);
    ashiqurSupervised.forEach(p => {
        console.log('\nTitle:', p.title);
        console.log('  Author:', p.author);
        console.log('  Supervisor:', p.supervisor);
        console.log('  SupervisorId:', p.supervisorId);
    });

    process.exit(0);
}

checkAshiqurData();
