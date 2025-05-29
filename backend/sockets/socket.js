const { Server } = require('socket.io');
const Message = require('../models/Message');
const mongoose = require('mongoose');

// Store user socket mappings and online status
const userSockets = new Map();
const onlineUsers = new Set();
const typingUsers = new Map(); // roomId -> Set of typing user IDs

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"]
    },
    // Additional Socket.IO options for better handling of credentials
    allowEIO3: true, // Allow Engine.IO version 3
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    console.log('New client connected');

    // Handle user connection
    socket.on('user:connect', (userId) => {
      console.log('User connected:', userId);
      
      // Store socket mapping
      userSockets.set(userId, socket.id);
      onlineUsers.add(userId);

      // Broadcast user's online status
      socket.broadcast.emit('user:online', userId);

      // Send current online users to the connected user
      socket.emit('users:online', Array.from(onlineUsers));
      
      // Mark pending messages as delivered
      emitMessageDelivered(userId, io);
    });

    // Handle room joining
    socket.on('room:join', (roomId) => {
      socket.join(roomId);
    });

    // Handle room leaving
    socket.on('room:leave', (roomId) => {
      socket.leave(roomId);
    });

    // Handle typing indicators
    socket.on('typing:start', ({ roomId, userId }) => {
      if (!typingUsers.has(roomId)) {
        typingUsers.set(roomId, new Set());
      }
      typingUsers.get(roomId).add(userId);
      socket.to(roomId).emit('typing:update', Array.from(typingUsers.get(roomId)));
    });

    socket.on('typing:stop', ({ roomId, userId }) => {
      if (typingUsers.has(roomId)) {
        typingUsers.get(roomId).delete(userId);
        socket.to(roomId).emit('typing:update', Array.from(typingUsers.get(roomId)));
      }
    });

    // Handle sending messages
    socket.on('message:send', async (data) => {
      try {
        const { senderId, roomId, type, content, mediaUrl, fileName, mimeType, clientId } = data;

        if (!mongoose.Types.ObjectId.isValid(senderId)) {
          throw new Error('Invalid sender ID');
        }

        const messageData = {
          sender: new mongoose.Types.ObjectId(senderId),
          room: new mongoose.Types.ObjectId(roomId),
          type: type || 'text',
          content: content || ''
        };

        // Add media-related fields if present
        if (type !== 'text') {
          if (!mediaUrl) {
            throw new Error('Media URL is required for non-text messages');
          }
          messageData.mediaUrl = mediaUrl;
          messageData.mimeType = mimeType;
          if (type === 'file') {
            messageData.fileName = fileName;
          }
        }

        const message = new Message(messageData);
        await message.save();

        // Prepare message payload with virtual fields
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name avatar');

        const messagePayload = {
          ...populatedMessage.toObject(),
          clientId,
          createdAt: message.createdAt
        };

        // Remove sender from typing indicators
        if (typingUsers.has(roomId)) {
          typingUsers.get(roomId).delete(senderId);
          io.to(roomId).emit('typing:update', Array.from(typingUsers.get(roomId)));
        }

        console.log('Emitting message to room:', roomId, messagePayload);

        // Broadcast to all room members (including sender)
        io.to(roomId).emit('message:receive', messagePayload);

        // Optional: confirm only to sender
        socket.emit('message:sent', {
          success: true,
          message: messagePayload
        });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message:sent', {
          success: false,
          error: error.message || 'Failed to send message'
        });
      }
    });

    // When messages are read
    socket.on('message:read', async ({ roomId, userId, messageIds }) => {
      try {
        const readAt = new Date().toISOString();
        // Update messages in database
        await markMessagesAsRead(messageIds, readAt);
        
        // Notify message senders
        io.to(roomId).emit('message:read:ack', {
          messageIds,
          readAt,
          read: true
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      // Find and remove user from mappings
      for (const [userId, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(userId);
          onlineUsers.delete(userId);
          
          // Remove user from all typing indicators
          for (const [roomId, typingSet] of typingUsers.entries()) {
            if (typingSet.delete(userId)) {
              io.to(roomId).emit('typing:update', Array.from(typingSet));
            }
          }

          // Broadcast user's offline status
          socket.broadcast.emit('user:offline', userId);
          break;
        }
      }
      console.log('Client disconnected');
    });
  });

  return io;
}

// Helper functions
async function emitMessageDelivered(userId, io) {
  try {
    // Find all undelivered messages for this user
    const undeliveredMessages = await Message.find({
      recipient: userId,
      delivered: { $ne: true }
    }).populate('sender', 'username');

    if (undeliveredMessages.length > 0) {
      // Mark messages as delivered
      const messageIds = undeliveredMessages.map(msg => msg._id);
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { 
          $set: { 
            delivered: true, 
            deliveredAt: new Date() 
          } 
        }
      );

      // Get user's socket
      const userSocketId = userSockets.get(userId);
      if (userSocketId) {
        // Emit delivery confirmation to the user
        io.to(userSocketId).emit('messages:delivered', {
          messageIds,
          deliveredAt: new Date().toISOString()
        });

        // Notify senders that their messages were delivered
        for (const message of undeliveredMessages) {
          const senderSocketId = userSockets.get(message.sender._id.toString());
          if (senderSocketId) {
            io.to(senderSocketId).emit('message:delivered', {
              messageId: message._id,
              deliveredAt: new Date().toISOString(),
              recipient: userId
            });
          }
        }
      }

      console.log(`Marked ${undeliveredMessages.length} messages as delivered for user:`, userId);
    }
  } catch (error) {
    console.error('Error marking messages as delivered:', error);
  }
}

async function markMessagesAsRead(messageIds, readAt) {
  try {
    // Validate messageIds
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      throw new Error('Invalid messageIds provided');
    }

    // Update messages in database
    const result = await Message.updateMany(
      { 
        _id: { $in: messageIds },
        read: { $ne: true } // Only update unread messages
      },
      { 
        $set: { 
          read: true, 
          readAt: new Date(readAt)
        } 
      }
    );

    console.log(`Marked ${result.modifiedCount} messages as read at ${readAt}`);
    return result;
  } catch (error) {
    console.error('Error marking messages as read:', error);
    throw error;
  }
}

module.exports = initializeSocket;