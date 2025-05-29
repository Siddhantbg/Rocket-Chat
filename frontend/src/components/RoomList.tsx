import { useState, useEffect } from 'react';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import PresenceDot from './PresenceDot';
import NewRoomModal from './NewRoomModal';
import { socketClient } from '../sockets/socket';

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
  unreadCount?: number;
}

interface RoomListProps {
  onSelectRoom: (room: Room) => void;
  selectedRoomId?: string;
  onlineUsers: Set<string>;
  typingUsers: Record<string, string[]>;
}

export default function RoomList({
  onSelectRoom,
  selectedRoomId,
  onlineUsers,
  typingUsers
}: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewRoomModalOpen, setIsNewRoomModalOpen] = useState(false);
  const { user } = useAuthStore();

  const fetchRooms = async () => {
    try {
      const response = await api.get('/rooms');
      setRooms(response.data);
      setError(null);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to fetch rooms');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen for unread count updates
    socketClient.on('room:unread:update', (data: { roomId: string; unreadCount: number }) => {
      setRooms(prev => 
        prev.map(room => 
          room._id === data.roomId 
            ? { ...room, unreadCount: data.unreadCount }
            : room
        )
      );
    });

    // Listen for new messages
    socketClient.on('message:receive', (message) => {
  if (
    message.sender === user?.id ||
    (typeof message.sender === 'object' && message.sender !== null && ' _id' in message.sender && message.sender._id === user?.id)
  ) return;

  setRooms(prev =>
    prev.map(room =>
      room._id === message.room
        ? {
            ...room,
            lastActivity: message.createdAt,
            unreadCount: (room.unreadCount || 0) + 1
          }
        : room
    ).sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    )
  );
});


    // Listen for message read acknowledgments
    socketClient.on('message:read:ack', (data: { roomId: string }) => {
      setRooms(prev => 
        prev.map(room => 
          room._id === data.roomId
            ? { ...room, unreadCount: 0 }
            : room
        )
      );
    });

    return () => {
      socketClient.off('room:unread:update');
      socketClient.off('message:receive');
      socketClient.off('message:read:ack');
    };
  }, [user]);

  const getRoomDisplayName = (room: Room) => {
    if (room.isGroup) return room.name;
    const otherMember = room.members.find(member => member._id !== user?.id);
    return otherMember?.name || 'Unknown User';
  };

  const handleRoomClick = (room: Room) => {
    onSelectRoom(room);
    // Reset unread count when selecting room
    setRooms(prev => 
      prev.map(r => 
        r._id === room._id
          ? { ...r, unreadCount: 0 }
          : r
      )
    );
  };

  // Get typing users for a room
  const getTypingUsers = (roomId: string): string[] => {
    return typingUsers[roomId] || [];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading rooms...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="p-4 bg-gray-700 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Chats</h2>
          <button
            onClick={() => setIsNewRoomModalOpen(true)}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            New Chat
          </button>
        </div>
        {user && (
          <div className="text-sm text-gray-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span>{user.name}</span>
            </div>
            <div className="bg-gray-800 px-2 py-1 rounded">
              Code: <span className="font-mono font-medium text-white">{user.code}</span>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-center justify-center flex-1 p-4">
          <div className="text-red-400">{error}</div>
        </div>
      ) : (
        <div className="divide-y divide-gray-700 flex-1 overflow-y-auto">
          {rooms.map((room) => {
            const isTyping = (getTypingUsers(room._id).length > 0);
            const otherMembers = room.members.filter(m => m._id !== user?.id);
            const isOnline = room.isGroup
              ? otherMembers.some(m => onlineUsers.has(m._id))
              : onlineUsers.has(otherMembers[0]?._id);

            return (
              <button
                key={room._id}
                onClick={() => handleRoomClick(room)}
                className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-700 transition-colors ${
                  selectedRoomId === room._id ? 'bg-gray-700' : ''
                }`}
              >
                <div className="shrink-0 relative">
                  {room.isGroup ? (
                    <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center">
                      <span className="text-white text-lg font-medium">
                        {room.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center">
                      <span className="text-white text-lg font-medium">
                        {getRoomDisplayName(room).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <PresenceDot
                    isOnline={isOnline}
                    className="absolute bottom-0 right-0 border-2 border-gray-800"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="text-white font-medium truncate">
                      {getRoomDisplayName(room)}
                    </p>
                    <span className="text-xs text-gray-400">
                      {new Date(room.lastActivity).toLocaleDateString()}
                    </span>
                  </div>
                  {isTyping && (
                    <p className="text-green-400 text-sm">
                      {room.isGroup
                        ? `${getTypingUsers(room._id).length} people typing...`
                        : 'Typing...'}
                    </p>
                  )}
                </div>
                {room.unreadCount && (
                  <span className="text-xs bg-red-600 px-2 py-1 rounded-full">
                    {room.unreadCount > 2 ? '2+' : room.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <NewRoomModal
        isOpen={isNewRoomModalOpen}
        onClose={() => setIsNewRoomModalOpen(false)}
        onRoomCreated={fetchRooms}
      />
    </div>
  );
} 