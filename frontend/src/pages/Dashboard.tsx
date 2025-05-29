import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePresenceStore } from '../store/presenceStore';
import { socketClient } from '../sockets/socket';
import RoomList from '../components/RoomList';
import ChatWindow from '../components/ChatWindow';
import debounce from 'lodash/debounce';

interface Room {
  _id: string;
  name: string;
  isGroup: boolean;
  members: Array<{
    _id: string;
    name: string;
    code: string;
    avatar?: string;
  }>;
  lastActivity: string;
}

export default function Dashboard() {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const { user } = useAuthStore();
  const {
    onlineUsers,
    typingUsers: presenceTypingUsers,
    setOnlineUsers,
    addOnlineUser,
    removeOnlineUser,
    setTypingUsers: setPresenceTypingUsers
  } = usePresenceStore();
  const navigate = useNavigate();

  // Handle room selection
  const handleRoomSelect = (room: Room) => {
    if (selectedRoom?._id !== room._id) {
      // Leave previous room if any
      if (selectedRoom) {
        socketClient.emit('room:leave', selectedRoom._id);
      }
      
      // Join new room
      socketClient.emit('room:join', room._id);
      setSelectedRoom(room);
    }
  };

  // Set up debounced typing handlers
  const debouncedStopTyping = useCallback(
    debounce((roomId: string, userId: string) => {
      socketClient.emit('typing:stop', { roomId, userId });
    }, 1000),
    []
  );

  const handleTyping = (roomId: string) => {
    if (!user) return;
    socketClient.emit('typing:start', { roomId, userId: user.id });
    debouncedStopTyping(roomId, user.id);
  };

  // Set up socket event listeners
  useEffect(() => {
    // Listen for online users updates
    socketClient.on('users:online', setOnlineUsers);
    socketClient.on('user:online', addOnlineUser);
    socketClient.on('user:offline', removeOnlineUser);

    // Listen for typing updates
    socketClient.on('typing:update', (data: { roomId: string; typingUsers: string[] }) => {
      setPresenceTypingUsers(data.roomId, data.typingUsers);
    });

    return () => {
      socketClient.off('users:online');
      socketClient.off('user:online');
      socketClient.off('user:offline');
      socketClient.off('typing:update');
    };
  }, [setOnlineUsers, addOnlineUser, removeOnlineUser, setPresenceTypingUsers]);

  const typingUsersObject = Object.fromEntries(presenceTypingUsers);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* <nav className="bg-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-white text-xl font-bold">SynapseChat</h1>
          <div className="flex items-center space-x-4">
            <Link
              to="/profile"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-300 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav> */}

      <div className="p-4">
        <div className="max-w-6xl mx-auto h-[85vh]">
          <div className="flex h-full space-x-4">
            {/* Rooms List - 1/3 width */}
            <div className="w-1/3 h-full">
              <RoomList
                onSelectRoom={handleRoomSelect}
                selectedRoomId={selectedRoom?._id}
                onlineUsers={onlineUsers}
                typingUsers={typingUsersObject}
              />
            </div>

            {/* Chat Window - 2/3 width */}
            <div className="w-2/3 h-full">
              {selectedRoom ? (
                <ChatWindow
                  roomId={selectedRoom._id}
                  selectedRoomId={selectedRoom._id}
                  onlineUsers={onlineUsers}
                  typingUsers={typingUsersObject}
                  isGroup={selectedRoom.isGroup}
                  onTyping={() => handleTyping(selectedRoom._id)}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-800 rounded-lg">
                  <div className="text-gray-400">
                    Select a chat to start messaging
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 