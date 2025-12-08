# KnowledgeTrace Server

Express.js + MongoDB backend API for KnowledgeTrace platform.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file (see environment variables below)

3. Start server:
   ```bash
   npm start
   # or
   npm run dev
   ```

## Environment Variables

Create `.env` file with:
```
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DB_USERNAME=your_mongodb_username
DB_PASSWORD=your_mongodb_password
DB_NAME=knowledgeTrace
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

## Deployment

See `../DEPLOY.md` for detailed deployment instructions.

The server can be deployed to:
- Render (recommended - free tier available)
- Railway
- Heroku
- Any Node.js hosting platform
