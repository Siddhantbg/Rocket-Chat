const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret', { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user (code will be auto-generated in the pre-validate hook)
    const user = new User({
      name,
      email,
      password
    });

    // Save user with retries for potential code collision
    let savedUser = null;
    let retries = 3;
    
    while (retries > 0 && !savedUser) {
      try {
        savedUser = await user.save();
      } catch (error) {
        if (error.code === 11000 && error.keyPattern?.code) {
          // Code collision, retry with a new code
          user.code = undefined; // This will trigger code regeneration
          retries--;
          if (retries === 0) {
            throw new Error('Failed to generate unique code, please try again');
          }
        } else {
          throw error;
        }
      }
    }

    // Generate tokens
    const tokens = generateTokens(savedUser._id);

    res.status(201).json({
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        code: savedUser.code,
        avatarUrl: savedUser.avatarUrl
      },
      ...tokens
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const tokens = generateTokens(user._id);

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        code: user.code,
        avatarUrl: user.avatarUrl
      },
      ...tokens
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message || 'Login failed' });
  }
}; 