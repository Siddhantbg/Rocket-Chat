const Room = require('../models/Room');
const User = require('../models/User');
const mongoose = require('mongoose');

// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const { name, isGroup, members: memberCodes } = req.body;
    
    // For direct messages (non-group)
    if (!isGroup && (!memberCodes || memberCodes.length !== 1)) {
      return res.status(400).json({ error: 'Direct message rooms must have exactly one other member' });
    }

    // Normalize member codes to strings and find users
    const codes = (memberCodes || []).map(code => String(code).trim());
    
    if (codes.length === 0) {
      return res.status(400).json({ error: 'No member codes provided' });
    }

    // Find users by their codes
    const members = await User.find({ code: { $in: codes } });

    if (members.length === 0) {
      return res.status(400).json({ error: 'No valid members found with provided codes' });
    }

    if (members.length !== codes.length) {
      const foundCodes = members.map(m => m.code);
      const invalidCodes = codes.filter(code => !foundCodes.includes(code));
      return res.status(400).json({ 
        error: `Some member codes are invalid: ${invalidCodes.join(', ')}` 
      });
    }

    // Get member IDs
    const memberIds = members.map(m => m._id);

    // Add the creator if not already included
    if (!memberIds.some(id => id.equals(req.user._id))) {
      memberIds.push(req.user._id);
    }

    // For direct messages, check if room already exists
    if (!isGroup) {
      const existingRoom = await Room.findOne({
        isGroup: false,
        members: { 
          $all: memberIds,
          $size: 2
        }
      }).populate('members', 'name code avatar');

      if (existingRoom) {
        return res.json(existingRoom);
      }
    }

    const room = new Room({
      name,
      isGroup,
      members: memberIds,
      createdBy: req.user._id
    });

    await room.save();
    
    // Populate the members before sending response
    const populatedRoom = await Room.findById(room._id)
      .populate('members', 'name code avatar');

    res.status(201).json(populatedRoom);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

// Get rooms for a user
exports.getUserRooms = async (req, res) => {
  try {
    console.log('Fetching rooms for user:', {
      userId: req.userId.toString(),
      userObjectId: req.userId
    });

    const rooms = await Room.find({
      members: req.userId
    })
    .populate('members', 'name code avatar')
    .sort({ lastActivity: -1 });

    console.log(`Found ${rooms.length} rooms for user`);
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', {
      error: error.message,
      stack: error.stack,
      userId: req.userId?.toString()
    });
    res.status(500).json({ error: 'Failed to fetch rooms', details: error.message });
  }
};

// Join room by invite code
exports.joinRoom = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const room = await Room.findOne({ inviteCode });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.isGroup) {
      return res.status(400).json({ error: 'Cannot join a direct message room' });
    }

    if (room.members.includes(req.user._id)) {
      return res.status(400).json({ error: 'Already a member of this room' });
    }

    room.members.push(req.user._id);
    room.lastActivity = new Date();
    await room.save();

    res.json(room);
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
};

// Leave room
exports.leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.isGroup) {
      return res.status(400).json({ error: 'Cannot leave a direct message room' });
    }

    if (!room.members.includes(req.user._id)) {
      return res.status(400).json({ error: 'Not a member of this room' });
    }

    room.members = room.members.filter(id => !id.equals(req.user._id));
    await room.save();

    res.json({ message: 'Successfully left the room' });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
}; 