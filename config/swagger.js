// Swagger Configuration
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'KnowledgeTrace API',
            version: '1.0.0',
            description: 'Comprehensive API documentation for the KnowledgeTrace MERN platform - A thesis and research project management system',
            contact: {
                name: 'API Support',
                email: 'support@knowledgetrace.com',
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT',
            },
        },
        servers: [
            {
                url: 'http://localhost:5000/api',
                description: 'Development server',
            },
            {
                url: 'https://api.knowledgetrace.com/api',
                description: 'Production server',
            },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Firebase JWT authentication token',
                },
            },
            schemas: {
                Project: {
                    type: 'object',
                    required: ['title', 'abstract', 'authorId'],
                    properties: {
                        _id: {
                            type: 'string',
                            description: 'Project unique identifier',
                        },
                        title: {
                            type: 'string',
                            minLength: 3,
                            maxLength: 200,
                            description: 'Project title',
                        },
                        abstract: {
                            type: 'string',
                            minLength: 50,
                            maxLength: 5000,
                            description: 'Project abstract',
                        },
                        techStack: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: 20,
                            description: 'Technologies used',
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: 10,
                            description: 'Project tags',
                        },
                        author: {
                            type: 'string',
                            maxLength: 100,
                            description: 'Author name',
                        },
                        authorId: {
                            type: 'string',
                            description: 'Firebase UID of the author',
                        },
                        supervisor: {
                            type: 'string',
                            maxLength: 100,
                            description: 'Supervisor name',
                        },
                        year: {
                            type: 'integer',
                            minimum: 2000,
                            description: 'Project year',
                        },
                        githubLink: {
                            type: 'string',
                            format: 'uri',
                            description: 'GitHub repository URL',
                        },
                        pdfUrl: {
                            type: 'string',
                            format: 'uri',
                            description: 'PDF file URL',
                        },
                        status: {
                            type: 'string',
                            enum: ['pending', 'approved', 'rejected'],
                            description: 'Project approval status',
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                    },
                },
                User: {
                    type: 'object',
                    required: ['name', 'email', 'uid'],
                    properties: {
                        _id: {
                            type: 'string',
                            description: 'User unique identifier',
                        },
                        name: {
                            type: 'string',
                            minLength: 1,
                            maxLength: 100,
                            description: 'User display name',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address',
                        },
                        uid: {
                            type: 'string',
                            description: 'Firebase UID',
                        },
                        photoURL: {
                            type: 'string',
                            format: 'uri',
                            description: 'Profile photo URL',
                        },
                        bio: {
                            type: 'string',
                            maxLength: 500,
                            description: 'User biography',
                        },
                        location: {
                            type: 'string',
                            maxLength: 100,
                            description: 'User location',
                        },
                        website: {
                            type: 'string',
                            format: 'uri',
                            description: 'User website',
                        },
                        isAdmin: {
                            type: 'boolean',
                            description: 'Admin status',
                        },
                        createdAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                        updatedAt: {
                            type: 'string',
                            format: 'date-time',
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false,
                        },
                        message: {
                            type: 'string',
                            description: 'Error message',
                        },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    field: {
                                        type: 'string',
                                    },
                                    message: {
                                        type: 'string',
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        tags: [
            {
                name: 'Projects',
                description: 'Project management endpoints',
            },
            {
                name: 'Users',
                description: 'User management endpoints',
            },
            {
                name: 'Admin',
                description: 'Admin-only endpoints',
            },
        ],
    },
    apis: ['./routes/*.js', './controllers/*.js'], // Path to API docs
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
