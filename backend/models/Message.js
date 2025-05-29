const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'file'],
    default: 'text',
    required: true
  },
  content: {
    type: String,
    required: function() {
      return this.type === 'text';
    },
    trim: true
  },
  mediaUrl: {
    type: String,
    required: function() {
      return this.type !== 'text';
    }
  },
  fileName: {
    type: String,
    required: function() {
      return this.type === 'file';
    }
  },
  mimeType: {
    type: String,
    required: function() {
      return this.type !== 'text';
    }
  },
  delivered: {
    type: Boolean,
    default: false
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Define senderName as a virtual that derives from populated sender
messageSchema.virtual('senderName').get(function () {
  if (this.populated('sender') && this.sender?.name) {
    return this.sender.name;
  }
  return undefined;
});

// Add a pre-save middleware to ensure either content or mediaUrl is present
messageSchema.pre('save', function(next) {
  if (this.type === 'text' && !this.content) {
    next(new Error('Content is required for text messages'));
  } else if (this.type !== 'text' && !this.mediaUrl) {
    next(new Error('MediaUrl is required for non-text messages'));
  } else {
    next();
  }
});

// Index for faster queries
messageSchema.index({ sender: 1, room: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 