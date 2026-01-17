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
        resource_type: 'raw', // PDFs must be 'raw' - 'auto' detects them as images which fails
        folder: 'knowledgetrace/projects',
        public_id: `${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`, // Unique filename with timestamp
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

/**
 * Generate a download URL for a PDF with proper Cloudinary transformation
 * This forces the browser to download the file instead of displaying it inline
 * @param {string} pdfUrl - The original Cloudinary PDF URL
 * @param {string} filename - Optional custom filename for the download
 * @returns {string} - Download URL with fl_attachment transformation
 */
const getDownloadUrl = (pdfUrl, filename = 'document.pdf') => {
  if (!pdfUrl || typeof pdfUrl !== 'string') {
    return pdfUrl;
  }

  // If it's a placeholder URL, return as-is
  if (pdfUrl.includes('placeholder')) {
    return pdfUrl;
  }

  // Check if it's a Cloudinary URL
  if (!pdfUrl.includes('cloudinary.com')) {
    return pdfUrl;
  }

  // Sanitize filename - remove special characters and spaces
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.pdf$/i, '') + '.pdf';

  // Add Cloudinary transformation to force download with custom filename
  // Pattern: https://res.cloudinary.com/[cloud]/[resource]/upload/[public_id]
  // Transform to: https://res.cloudinary.com/[cloud]/[resource]/upload/fl_attachment:[filename]/[public_id]

  const uploadIndex = pdfUrl.indexOf('/upload/');
  if (uploadIndex === -1) {
    return pdfUrl;
  }

  const beforeUpload = pdfUrl.substring(0, uploadIndex + 8); // includes '/upload/'
  const afterUpload = pdfUrl.substring(uploadIndex + 8);

  return `${beforeUpload}fl_attachment:${sanitizedFilename}/${afterUpload}`;
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  getDownloadUrl,
};

