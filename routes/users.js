// User routes
const express = require('express');
const router = express.Router();
const { getUsersCollection, ObjectId } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const usersCollection = await getUsersCollection();
    const user = await usersCollection.findOne({ uid: req.user.uid });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(new User(user).toJSON());
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
});

// Create or update user profile
router.post('/', verifyToken, async (req, res) => {
  try {
    const usersCollection = await getUsersCollection();
    
    // Ensure required fields
    const userData = {
      name: req.body.name || req.user.name || req.user.email?.split('@')[0] || 'User',
      email: req.user.email,
      uid: req.user.uid,
      photoURL: req.body.photoURL || null,
      updatedAt: new Date(),
    };

    // Only include photoURL if provided
    if (req.body.photoURL) {
      userData.photoURL = req.body.photoURL;
    }

    const existingUser = await usersCollection.findOne({ uid: req.user.uid });

    if (existingUser) {
      // Update existing user
      await usersCollection.updateOne(
        { uid: req.user.uid },
        { $set: userData }
      );
      const updatedUser = await usersCollection.findOne({ uid: req.user.uid });
      res.json({ message: 'User profile updated', user: new User(updatedUser).toJSON() });
    } else {
      // Create new user
      userData.createdAt = new Date();
      const result = await usersCollection.insertOne(userData);
      const newUser = await usersCollection.findOne({ _id: result.insertedId });
      res.status(201).json({ message: 'User profile created', user: new User(newUser).toJSON() });
    }
  } catch (error) {
    console.error('Error creating/updating user:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Error creating/updating user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const usersCollection = await getUsersCollection();
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    // Don't allow updating uid or email
    delete updateData.uid;
    delete updateData.email;

    const result = await usersCollection.updateOne(
      { uid: req.user.uid },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedUser = await usersCollection.findOne({ uid: req.user.uid });
    res.json({ message: 'Profile updated successfully', user: new User(updatedUser).toJSON() });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;

