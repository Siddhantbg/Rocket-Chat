import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

export interface Message {
  _id: string;
  sender: string | { _id: string; avatar?: string };
  room: string;
  type: 'text' | 'image' | 'video' | 'file';
  content?: string;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  read: boolean;
  delivered: boolean;
  createdAt: string;
  updatedAt: string;
  senderName?: string;
  clientId?: string;
  isSending?: boolean;
  readAt?: string;
}

interface ServerToClientEvents {
  'message:receive': (message: Message) => void;
  'message:sent': (response: { success: boolean; message?: Message; error?: string }) => void;
  'message:read:ack': (data: { messageIds: string[]; readAt: string; roomId: string; read: boolean }) => void;
  'message:delivered': (data: { messageId: string }) => void;
  'room:unread:update': (data: { roomId: string; unreadCount: number }) => void;
  'users:online': (users: string[]) => void;
  'user:online': (userId: string) => void;
  'user:offline': (userId: string) => void;
  'typing:update': (data: { roomId: string; typingUsers: string[] }) => void;
  'user:avatar:update': (data: { userId: string; avatarUrl: string }) => void;
  'connect': () => void;
  'disconnect': () => void;
  'connect_error': (error: Error) => void;
}

interface ClientToServerEvents {
  'user:connect': (userId: string) => void;
  'room:join': (roomId: string) => void;
  'room:leave': (roomId: string) => void;
  'message:send': (data: {
    senderId: string;
    roomId: string;
    type: 'text' | 'image' | 'video' | 'file';
    content?: string;
    mediaUrl?: string;
    fileName?: string;
    mimeType?: string;
    clientId: string;
  }) => void;
  'message:read': (data: { roomId: string; userId: string; messageIds?: string[] }) => void;
  'typing:start': (data: { roomId: string; userId: string }) => void;
  'typing:stop': (data: { roomId: string; userId: string }) => void;
  'user:avatar:update': (data: { userId: string; avatarUrl: string }) => void;
}

// Create socket instance
export const socketClient: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SOCKET_URL,
  {
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
    path: '/socket.io/',
    forceNew: true,
    auth: (cb) => {
      const { user, accessToken } = useAuthStore.getState();
      
      console.log('Socket auth attempt:', { 
        hasUser: !!user, 
        hasToken: !!accessToken,
        socketUrl: import.meta.env.VITE_SOCKET_URL,
        timestamp: new Date().toISOString(),
        userId: user?.id
      });

      if (!accessToken || !user?.id) {
        console.error('Missing auth data:', { 
          hasToken: !!accessToken, 
          hasUser: !!user,
          userId: user?.id
        });
        socketClient.disconnect();
        return;
      }

      // Send auth data with exact values for debugging
      const authData = {
        token: accessToken,
        userId: user.id
      };
      console.log('Sending auth data:', authData);
      cb(authData);
    }
  }
);

let reconnectAttempts = 0;
const MAX_FAST_RECONNECTS = 3;

// Set up socket event listeners
socketClient.on('connect', () => {
  const { user } = useAuthStore.getState();
  console.log('Socket connected successfully', {
    id: socketClient.id,
    connected: socketClient.connected,
    userId: user?.id,
    url: import.meta.env.VITE_SOCKET_URL,
    timestamp: new Date().toISOString(),
    transport: socketClient.io.engine?.transport?.name,
    attempts: reconnectAttempts
  });

  // Reset reconnection attempts on successful connection
  reconnectAttempts = 0;

  // Emit user:connect event after successful connection
  if (user?.id) {
    socketClient.emit('user:connect', user.id);
  } else {
    console.error('No user ID available for user:connect event');
    socketClient.disconnect();
  }
});

socketClient.on('disconnect', (reason) => {
  const { user } = useAuthStore.getState();
  console.log('Socket disconnected:', {
    reason,
    wasConnected: socketClient.connected,
    userId: user?.id,
    attempts: reconnectAttempts,
    timestamp: new Date().toISOString(),
    transport: socketClient.io.engine?.transport?.name
  });

  // If we've tried reconnecting too many times quickly, slow down
  if (reconnectAttempts >= MAX_FAST_RECONNECTS) {
    socketClient.io.reconnectionDelay(5000); // Wait 5 seconds between attempts
    socketClient.io.reconnectionDelayMax(10000); // Maximum 10 seconds between attempts
  }

  reconnectAttempts++;

  // If the disconnection was due to an auth error, don't reconnect
  if (reason === 'io server disconnect' || reason === 'io client disconnect') {
    console.error('Socket disconnected by server or client - stopping reconnection');
    socketClient.disconnect();
  }
});

socketClient.on('connect_error', (error) => {
  const { user, accessToken } = useAuthStore.getState();
  console.error('Socket connection error:', {
    message: error.message,
    description: error.toString(),
    transport: socketClient.io.engine?.transport?.name,
    timestamp: new Date().toISOString(),
    url: import.meta.env.VITE_SOCKET_URL,
    hasUser: !!user,
    hasToken: !!accessToken,
    attempts: reconnectAttempts
  });

  // If we get an auth error, disconnect and don't retry
  if (error.message.includes('Authentication failed')) {
    console.error('Authentication failed - disconnecting socket');
    socketClient.disconnect();
  }
});

// Handle avatar updates
socketClient.on('user:avatar:update', (data) => {
  const { user, updateUser } = useAuthStore.getState();
  if (user && user.id === data.userId) {
    updateUser({ ...user, avatarUrl: data.avatarUrl });
  }
}); 