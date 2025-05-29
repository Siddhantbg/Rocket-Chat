const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const auth = require('../middlewares/auth');

// All routes require authentication
router.use(auth);

// Create a new room
router.post('/', roomController.createRoom);

// Get user's rooms
router.get('/', roomController.getUserRooms);

// Join room by invite code
router.post('/join', roomController.joinRoom);

// Leave room
router.post('/:roomId/leave', roomController.leaveRoom);

module.exports = router; 