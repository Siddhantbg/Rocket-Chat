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
    transports: ['websocket', 'polling'],
    path: '/socket.io/',
    forceNew: true,
    auth: () => {
      const { user, accessToken } = useAuthStore.getState();
      console.log('Socket auth data:', { 
        hasUser: !!user, 
        hasToken: !!accessToken,
        socketUrl: import.meta.env.VITE_SOCKET_URL,
        timestamp: new Date().toISOString()
      });
      return {
        token: accessToken,
        userId: user?.id,
      };
    }
  }
);

// Set up socket event listeners
socketClient.on('connect', () => {
  console.log('Socket connected successfully', {
    id: socketClient.id,
    connected: socketClient.connected,
    url: socketClient.io.opts.hostname,
    timestamp: new Date().toISOString(),
    transport: socketClient.io.engine?.transport?.name
  });
});

socketClient.on('disconnect', (reason) => {
  console.log('Socket disconnected:', {
    reason,
    wasConnected: socketClient.connected,
    attempts: (socketClient as any).io._reconnectionAttempts,
    timestamp: new Date().toISOString(),
    transport: socketClient.io.engine?.transport?.name
  });
});

socketClient.on('connect_error', (error) => {
  console.error('Socket connection error:', {
    message: error.message,
    description: error.toString(),
    transport: socketClient.io.engine?.transport?.name,
    timestamp: new Date().toISOString(),
    url: import.meta.env.VITE_SOCKET_URL
  });
});

// Handle avatar updates
socketClient.on('user:avatar:update', (data) => {
  const { user, updateUser } = useAuthStore.getState();
  if (user && user.id === data.userId) {
    updateUser({ ...user, avatarUrl: data.avatarUrl });
  }
}); 