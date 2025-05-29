const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  avatarUrl: {
    type: String,
    default: 'https://res.cloudinary.com/your-cloud-name/image/upload/v1/defaults/avatar-placeholder.png'
  },
  code: {
    type: String,
    required: true,
    unique: true,
    minlength: 4,
    maxlength: 4
  }
}, {
  timestamps: true
});

// Generate 4-digit invite code before validation
userSchema.pre('validate', async function(next) {
  if (!this.code) {
    // Keep generating codes until we find a unique one
    let isUnique = false;
    while (!isUnique) {
      const generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
      const existingUser = await mongoose.models.User.findOne({ code: generatedCode });
      if (!existingUser) {
        this.code = generatedCode;
        isUnique = true;
      }
    }
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 