const { Server } = require('socket.io');
const Message = require('../models/Message');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Store user socket mappings and online status
const userSockets = new Map();
const onlineUsers = new Set();
const typingUsers = new Map(); // roomId -> Set of typing user IDs

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400
    },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
    path: '/socket.io/',
    connectTimeout: 45000,
    maxHttpBufferSize: 1e8, // 100 MB
    allowUpgrades: true,
    perMessageDeflate: {
      threshold: 1024 // Only compress messages larger than 1KB
    }
  });

  // Add authentication middleware
  io.use(async (socket, next) => {
    try {
      const { token, userId } = socket.handshake.auth;
      
      console.log('Socket auth attempt:', {
        id: socket.id,
        userId,
        hasToken: !!token,
        time: new Date().toISOString(),
        headers: socket.handshake.headers,
        transport: socket.conn?.transport?.name
      });

      if (!token || !userId) {
        console.error('Missing auth data:', { 
          hasToken: !!token, 
          hasUserId: !!userId,
          socketId: socket.id
        });
        return next(new Error('Authentication failed - missing token or userId'));
      }

      // Verify JWT token
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Log the token verification
        console.log('Token verification:', {
          decodedId: decoded.userId,
          providedId: userId,
          match: decoded.userId === userId,
          time: new Date().toISOString()
        });

        if (decoded.userId !== userId) {
          throw new Error('User ID mismatch');
        }

        // Store user data in socket
        socket.user = {
          id: decoded.userId,
          // Add any other user data you need
        };

        // Check for existing socket connection
        const existingSocketId = userSockets.get(userId);
        if (existingSocketId) {
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          if (existingSocket) {
            console.log(`Disconnecting existing socket for user ${userId}`);
            existingSocket.disconnect(true);
          }
          userSockets.delete(userId);
          onlineUsers.delete(userId);
        }

        console.log('Socket authenticated:', {
          id: socket.id,
          userId: socket.user.id,
          time: new Date().toISOString()
        });

        next();
      } catch (error) {
        console.error('JWT verification failed:', {
          error: error.message,
          socketId: socket.id,
          time: new Date().toISOString()
        });
        return next(new Error('Authentication failed - invalid token'));
      }
    } catch (error) {
      console.error('Socket auth error:', {
        error: error.message,
        socketId: socket.id,
        time: new Date().toISOString()
      });
      next(new Error('Authentication failed'));
    }
  });

  // Add connection logging middleware
  io.use((socket, next) => {
    console.log('Connection attempt:', {
      id: socket.id,
      handshake: {
        headers: socket.handshake.headers,
        auth: {
          hasToken: !!socket.handshake.auth.token,
          hasUserId: !!socket.handshake.auth.userId
        },
        query: socket.handshake.query,
        issued: new Date(socket.handshake.issued).toISOString(),
        url: socket.handshake.url,
        time: new Date().toISOString()
      }
    });
    next();
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', {
      id: socket.id,
      userId: socket.user?.id,
      transport: socket.conn.transport.name,
      time: new Date().toISOString()
    });

    // Handle user connection
    socket.on('user:connect', (userId) => {
      // Verify the userId matches the authenticated user
      if (userId !== socket.user?.id) {
        console.error('User ID mismatch in user:connect:', {
          providedId: userId,
          authenticatedId: socket.user?.id
        });
        socket.disconnect(true);
        return;
      }

      console.log('User connected:', {
        userId,
        socketId: socket.id,
        time: new Date().toISOString()
      });
      
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