const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const auth = require('../middleware/auth');
const User = require('../models/User');

// Configure Cloudinary storage for media
const mediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_media',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'pdf', 'doc', 'docx']
  }
});

// Configure multer for media uploads
const mediaUpload = multer({
  storage: mediaStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Configure Cloudinary storage for avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 200, height: 200, crop: 'fill' }]
  }
});

// Configure multer for avatar uploads
const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Upload avatar
router.post('/avatar', auth, (req, res, next) => {
  // Debug logging
  console.log('Avatar upload request received');
  console.log('Auth user:', req.user);
  console.log('Content-Type:', req.headers['content-type']);

  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: 'File too large',
            details: 'Maximum file size is 2MB'
          });
        }
      }
      return res.status(400).json({ 
        error: 'File upload error',
        details: err.message 
      });
    }

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Please select an image file'
      });
    }

    try {
      console.log('File uploaded successfully:', req.file);
      
      // Update user's avatar URL
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { avatarUrl: req.file.path },
        { new: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      // Emit socket event for real-time avatar update
      if (req.io) {
        req.io.emit('user:avatar:update', {
          userId: user._id,
          avatarUrl: req.file.path
        });
      }

      res.json({
        avatarUrl: req.file.path,
        message: 'Avatar uploaded successfully'
      });
    } catch (error) {
      console.error('Database error:', error);
      res.status(500).json({
        error: 'Failed to update user avatar',
        details: error.message
      });
    }
  });
});

// Upload media for messages
router.post('/media', auth, (req, res, next) => {
  console.log('Media upload request received');
  console.log('Auth user:', req.user);
  console.log('Content-Type:', req.headers['content-type']);

  mediaUpload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: 'File too large',
            details: 'Maximum file size is 10MB'
          });
        }
      }
      return res.status(400).json({ 
        error: 'File upload error',
        details: err.message 
      });
    }

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'Please select a file'
      });
    }

    try {
      console.log('File uploaded successfully:', req.file);

      // Determine file type
      const type = req.file.mimetype.startsWith('image/') ? 'image' :
                  req.file.mimetype.startsWith('video/') ? 'video' : 'file';

      res.json({
        url: req.file.path,
        type,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        error: 'Failed to upload file',
        details: error.message
      });
    }
  });
});

module.exports = router; 