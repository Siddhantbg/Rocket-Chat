const Message = require('../models/Message');
const User = require('../models/User');
const Room = require('../models/Room');
const redis = require('../services/redis');
const upstash = require('../services/upstashRedis');
const mongoose = require('mongoose');

// Map to store socket connections (still needed for direct socket access)
const userSockets = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('user:connect', async (userId) => {
      try {
        console.log('User connected:', userId);
        
        // Store the userId on the socket for later reference
        socket.userId = userId;
        
        // Remove any existing socket for this user (handle multiple tabs/devices)
        const existingSocketId = userSockets.get(userId);
        if (existingSocketId && existingSocketId !== socket.id) {
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          if (existingSocket) {
            existingSocket.disconnect(true);
          }
        }
        
        userSockets.set(userId, socket.id);

        // Add user to Redis online users set
        await redis.addOnlineUser(userId);

        // Broadcast user online status
        socket.broadcast.emit('user:online', userId);

        // Send current online users from Redis
        const onlineUsers = await redis.getOnlineUsers();
        socket.emit('users:online', onlineUsers);
        
        console.log(`User ${userId} connected with socket ${socket.id}`);
      } catch (error) {
        console.error('Error in user:connect:', error);
      }
    });

    socket.on('disconnect', async () => {
      try {
        console.log('Client disconnected:', socket.id);
        
        // Find and remove the disconnected user
        let disconnectedUserId = null;
        
        if (socket.userId) {
          disconnectedUserId = socket.userId;
        } else {
          // Fallback: search through the map
          for (const [userId, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
              disconnectedUserId = userId;
              break;
            }
          }
        }
        
        if (disconnectedUserId) {
          userSockets.delete(disconnectedUserId);
          await redis.removeOnlineUser(disconnectedUserId);
          await redis.clearUserData(disconnectedUserId);
          socket.broadcast.emit('user:offline', disconnectedUserId);
          console.log(`User ${disconnectedUserId} disconnected`);
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    socket.on('room:join', async (roomId) => {
      try {
        socket.join(roomId);
        console.log(`User ${socket.userId} joined room: ${roomId}`);

        // Get room members from Redis
        if (socket.userId) {
          const members = await redis.getRoomMembers(roomId);
          if (!members.includes(socket.userId)) {
            await redis.addRoomMember(roomId, socket.userId);
          }

          // Mark undelivered messages as delivered when user joins room
          const undeliveredMessages = await Message.find({
            room: roomId,
            delivered: false,
            sender: { $ne: socket.userId }
          });

          if (undeliveredMessages.length > 0) {
            // Update messages as delivered
            await Message.updateMany(
              {
                _id: { $in: undeliveredMessages.map(m => m._id) }
              },
              { $set: { delivered: true } }
            );

            // Group messages by sender and notify them
            const messagesBySender = undeliveredMessages.reduce((acc, msg) => {
              const senderId = msg.sender.toString();
              if (!acc[senderId]) {
                acc[senderId] = [];
              }
              acc[senderId].push(msg);
              return acc;
            }, {});

            // Send delivery confirmations to each sender
            Object.entries(messagesBySender).forEach(([senderId, messages]) => {
              const senderSocketId = userSockets.get(senderId);
              if (senderSocketId) {
                messages.forEach(msg => {
                  io.to(senderSocketId).emit('message:delivered', {
                    messageId: msg._id.toString()
                  });
                });
              }
            });
          }
        }
      } catch (error) {
        console.error('Error joining room:', error);
      }
    });

    socket.on('room:leave', async (roomId) => {
      try {
        socket.leave(roomId);
        console.log(`User ${socket.userId} left room: ${roomId}`);
        
        if (socket.userId) {
          await redis.removeRoomMember(roomId, socket.userId);
        }
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    });

    socket.on('message:send', async (data) => {
      try {
        const { senderId, roomId, type, content, mediaUrl, fileName, mimeType, clientId } = data;
        
        // Check rate limit first
        const rateLimitResult = await upstash.checkRateLimit(senderId);
        if (!rateLimitResult.success) {
          socket.emit('rate:limit', { 
            error: "Too many messages. Please wait.",
            reset: rateLimitResult.reset,
            remaining: rateLimitResult.remaining
          });
          socket.emit('message:sent', {
            success: false,
            error: 'Rate limit exceeded',
            clientId
          });
          return;
        }

        // Validate input
        if (!senderId || !roomId || !clientId) {
          socket.emit('message:sent', {
            success: false,
            error: 'Missing required fields',
            clientId
          });
          return;
        }

        // Additional validation for media messages
        if (type !== 'text' && !mediaUrl) {
          socket.emit('message:sent', {
            success: false,
            error: 'Media URL is required for non-text messages',
            clientId
          });
          return;
        }

        // Verify room and membership
        const room = await Room.findById(roomId);
        if (!room) {
          socket.emit('message:sent', {
            success: false,
            error: 'Room not found',
            clientId
          });
          return;
        }

        if (!room.members.includes(senderId)) {
          socket.emit('message:sent', {
            success: false,
            error: 'Not a member of this room',
            clientId
          });
          return;
        }

        // Get all room members for checking presence
        const roomMembers = room.members.map(id => id.toString());
        const otherMembers = roomMembers.filter(memberId => memberId !== senderId);

        // Check which members are online and in the room
        const onlineMembers = await redis.getOnlineUsers();
        const onlineMembersInRoom = await redis.getRoomMembers(roomId);
        
        // A message is considered delivered if receivers are online
        const isDelivered = otherMembers.some(memberId => 
          onlineMembers.includes(memberId) && onlineMembersInRoom.includes(memberId)
        );

        // Create message data with all fields
        const messageData = {
          sender: senderId,
          room: roomId,
          type: type || 'text',
          content: content || '',
          delivered: isDelivered,
          read: false
        };

        // Add media-related fields if present
        if (type !== 'text') {
          messageData.mediaUrl = mediaUrl;
          messageData.mimeType = mimeType;
          if (type === 'file') {
            messageData.fileName = fileName;
          }
        }

        const message = new Message(messageData);
        const savedMessage = await message.save();
        
        // Populate the sender field for the virtual to work
        await savedMessage.populate('sender');

        // Create the response message with clientId for matching
        const confirmedMessage = {
          ...savedMessage.toJSON(),
          clientId,
          isSending: false
        };

        // Confirm to sender with clientId
        socket.emit('message:sent', {
          success: true,
          message: confirmedMessage
        });

        // Update Redis room metadata
        await redis.updateRoomLastActivity(roomId);

        // Increment unread count for other members and notify them
        for (const memberId of otherMembers) {
          const unreadCount = await redis.incrementUnreadCount(roomId, memberId);
          const memberSocketId = userSockets.get(memberId);
          
          if (memberSocketId) {
            // Send unread count update
            io.to(memberSocketId).emit('room:unread:update', {
              roomId,
              unreadCount
            });

            // If member is online and in the room, send delivery confirmation
            if (onlineMembers.includes(memberId) && onlineMembersInRoom.includes(memberId)) {
              socket.emit('message:delivered', {
                messageId: savedMessage._id.toString()
              });
            }
          }
        }

        // Broadcast to room members (excluding sender)
        socket.to(roomId).emit('message:receive', confirmedMessage);

      } catch (error) {
        console.error('Error handling message:', error);
        socket.emit('message:sent', {
          success: false,
          error: 'Failed to send message',
          clientId: data.clientId
        });
      }
    });

    socket.on('message:read', async (data) => {
      try {
        const { roomId, userId, messageIds } = data;

        // Validate required fields
        if (!roomId || !userId) {
          console.error('Missing required fields:', { roomId, userId });
          return;
        }

        // Validate roomId and userId are valid ObjectIds
        if (!mongoose.Types.ObjectId.isValid(roomId) || !mongoose.Types.ObjectId.isValid(userId)) {
          console.error('Invalid roomId or userId:', { roomId, userId });
          return;
        }

        // Find messages to update
        let messagesToUpdate;
        if (messageIds && Array.isArray(messageIds)) {
          // Filter out any invalid ObjectIds
          const validMessageIds = messageIds.filter(id => mongoose.Types.ObjectId.isValid(id));
          
          if (validMessageIds.length === 0) {
            console.log('No valid messageIds provided, will mark all unread messages as read');
            // Fall back to updating all unread messages
            messagesToUpdate = await Message.find({
              room: roomId,
              sender: { $ne: userId },
              read: false
            }).populate('sender', 'name avatar');
          } else {
            // Update specific messages
            messagesToUpdate = await Message.find({
              _id: { $in: validMessageIds },
              room: roomId,
              sender: { $ne: userId },
              read: false
            }).populate('sender', 'name avatar');
          }
        } else {
          // Update all unread messages in the room
          messagesToUpdate = await Message.find({
            room: roomId,
            sender: { $ne: userId },
            read: false
          }).populate('sender', 'name avatar');
        }

        if (messagesToUpdate.length === 0) {
          console.log('No unread messages to mark as read');
          return;
        }

        const readAt = new Date().toISOString();
        const messageIdsToUpdate = messagesToUpdate.map(m => m._id);

        // Update messages to read
        await Message.updateMany(
          { _id: { $in: messageIdsToUpdate } },
          { 
            $set: { 
              read: true, 
              readAt, 
              delivered: true 
            } 
          }
        );

        // Reset unread count in Redis
        await redis.resetUnreadCount(roomId, userId);

        // Notify room members about read status
        io.to(roomId).emit('message:read:ack', {
          messageIds: messageIdsToUpdate.map(id => id.toString()),
          readAt,
          roomId,
          read: true
        });

        // Group messages by sender for individual notifications
        const messagesBySender = messagesToUpdate.reduce((acc, msg) => {
          const senderId = msg.sender._id.toString();
          if (!acc[senderId]) {
            acc[senderId] = [];
          }
          acc[senderId].push(msg);
          return acc;
        }, {});

        // Send individual read receipts to each sender
        Object.entries(messagesBySender).forEach(([senderId, messages]) => {
          const senderSocketId = userSockets.get(senderId);
          if (senderSocketId) {
            io.to(senderSocketId).emit('message:read:ack', {
              messageIds: messages.map(m => m._id.toString()),
              readAt,
              roomId,
              read: true
            });
          }
        });

        console.log(`Marked ${messagesToUpdate.length} messages as read in room ${roomId}`);
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    socket.on('typing:start', async (data) => {
      try {
        const { roomId, userId } = data;
        
        if (!roomId || !userId) return;
        
        await redis.setTyping(roomId, userId);
        const typingUsers = await redis.getTypingUsers(roomId);
        
        // Broadcast to room excluding the user who is typing
        socket.to(roomId).emit('typing:update', {
          roomId,
          typingUsers: typingUsers.filter(id => id !== userId)
        });
        
      } catch (error) {
        console.error('Error handling typing start:', error);
      }
    });

    socket.on('typing:stop', async (data) => {
      try {
        const { roomId, userId } = data;
        
        if (!roomId || !userId) return;
        
        await redis.removeTyping(roomId, userId);
        const typingUsers = await redis.getTypingUsers(roomId);
        
        // Broadcast to room excluding the user who stopped typing
        socket.to(roomId).emit('typing:update', {
          roomId,
          typingUsers: typingUsers.filter(id => id !== userId)
        });
        
      } catch (error) {
        console.error('Error handling typing stop:', error);
      }
    });

    socket.on('user:avatar:update', async (data) => {
      try {
        const { userId, avatarUrl } = data;
        
        // Broadcast avatar update to all connected clients
        io.emit('user:avatar:update', {
          userId,
          avatarUrl
        });
        
        console.log(`User ${userId} updated avatar to ${avatarUrl}`);
      } catch (error) {
        console.error('Error handling avatar update:', error);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Handle io-level errors
  io.on('error', (error) => {
    console.error('Socket.IO server error:', error);
  });
};