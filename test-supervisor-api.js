// Quick test script to verify API returns supervisor field
const { getProjectsCollection } = require('./config/database');

async function testProjectAPI() {
    const projects = await getProjectsCollection();
    const project = await projects.findOne({ author: /c233137/i });

    console.log('\n=== RAW DATABASE RECORD ===');
    console.log('Title:', project.title);
    console.log('Supervisor:', project.supervisor);
    console.log('SupervisorId:', project.supervisorId);

    // Simulate what the API returns
    const Project = require('./models/Project');
    const projectModel = new Project(project);
    const apiResponse = projectModel.toJSON();

    console.log('\n=== API RESPONSE (toJSON) ===');
    console.log('Title:', apiResponse.title);
    console.log('Supervisor:', apiResponse.supervisor);
    console.log('SupervisorId:', apiResponse.supervisorId);

    process.exit(0);
}

testProjectAPI();
