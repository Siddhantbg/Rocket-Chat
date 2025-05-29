const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middlewares/auth');

// Get all users
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      code: user.code,
      avatarUrl: user.avatarUrl
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router; 