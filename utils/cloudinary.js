// Cloudinary utility for file uploads
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @returns {Promise<string>} - Cloudinary URL
 */
const uploadToCloudinary = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.warn('Cloudinary not configured. Returning placeholder URL.');
      resolve('https://via.placeholder.com/500x700?text=PDF+Not+Uploaded');
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw', // For PDF files
        folder: 'knowledgetrace/projects',
        public_id: `${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`, // Unique filename with timestamp
        // Don't specify format for raw resources - it's inferred from the file
        access_mode: 'public', // Ensure public access
        type: 'upload', // Default upload type
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          // For raw PDFs, use the secure_url directly
          const pdfUrl = result.secure_url;
          console.log('✅ PDF uploaded successfully:', pdfUrl);
          resolve(pdfUrl);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<void>}
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return;
    }
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
};

