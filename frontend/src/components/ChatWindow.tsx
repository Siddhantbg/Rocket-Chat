import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { socketClient } from '../sockets/socket';
import api from '../lib/axios';

interface Message {
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

interface SocketResponse {
  success: boolean;
  message?: Message;
  error?: string;
}

interface ChatWindowProps {
  roomId: string;
  selectedRoomId: string;
  onlineUsers: Set<string>;
  typingUsers: Record<string, string[]>;
  isGroup: boolean;
  onTyping: () => void;
}

export default function ChatWindow({
  roomId,
  selectedRoomId,
  onlineUsers,
  typingUsers,
  isGroup,
  onTyping
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false); // Start as false until connected
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();

  // Handle file selection
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to check if a message is from the current user
  const isMessageFromMe = useCallback((message: Message): boolean => {
    if (!user || !message.sender) return false;

    let senderId: string | undefined;

    if (typeof message.sender === 'string') {
      senderId = message.sender;
    } else if ('_id' in message.sender) {
      senderId = message.sender._id;
    }

    return senderId === user.id;
  }, [user]);

  // Check if user is scrolled to bottom
  const isScrolledToBottom = useCallback(() => {
    if (!chatContainerRef.current) return true;
    const { scrollHeight, scrollTop, clientHeight } = chatContainerRef.current;
    return Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (force || isScrolledToBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowNewMessageButton(false);
      setNewMessageCount(0);
    }
  }, [isScrolledToBottom]);

  // Handle manual scroll to bottom
  const handleScrollToBottom = () => {
    scrollToBottom(true);
  };

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (isScrolledToBottom()) {
      setShowNewMessageButton(false);
      setNewMessageCount(0);
    }
  }, [isScrolledToBottom]);

  // Get new message badge text
  const getNewMessageText = () => {
    if (newMessageCount === 1) return "↓ 1 New Message";
    if (newMessageCount === 2) return "↓ 2 New Messages";
    return "↓ 2+ New Messages";
  };

  // Sort messages by timestamp and handle duplicates
  const addOrUpdateMessage = useCallback((newMsg: Message, prev: Message[]) => {
    if (!newMsg) return prev;

    // Check for duplicates by clientId first (for optimistic updates)
    if (newMsg.clientId) {
      const hasOptimistic = prev.some(m => m.clientId === newMsg.clientId);
      if (hasOptimistic) {
        return prev.map(m =>
          m.clientId === newMsg.clientId ? { ...newMsg, isSending: false } : m
        ).sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
    }

    // Check for duplicates by _id
    const existingById = prev.find(m => m._id === newMsg._id);
    if (existingById) {
      return prev.map(m =>
        m._id === newMsg._id ? { ...newMsg, isSending: false } : m
      ).sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    // Add new message and sort
    const updated = [...prev, { ...newMsg, isSending: false }];
    return updated.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, []);

  // Handle new message
  const handleNewMessage = useCallback((message: Message) => {
    const isFromMe = isMessageFromMe(message);
    const atBottom = isScrolledToBottom();

    setMessages(prev => {
      const confirmedMessage: Message = {
        ...message,
        isSending: false,
        delivered: message.delivered || false,
        read: message.read || false,
        _id: message._id // This is guaranteed to exist by the Message interface
      };

      return addOrUpdateMessage(confirmedMessage, prev);
    });

    // If message is from someone else and we're at bottom, mark it as read
    if (!isFromMe && !selectedRoomId && atBottom && user && user.id) {
      console.log('Marking new message as read:', message._id);
      socketClient.emit('message:read', {
        roomId,
        userId: user.id,
        messageIds: [message._id]
      });
    }

    if (!isFromMe && !atBottom) {
      setNewMessageCount(prev => Math.min(prev + 1, 99));
      setShowNewMessageButton(true);
    } else if (atBottom) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [isMessageFromMe, isScrolledToBottom, addOrUpdateMessage, scrollToBottom, user, roomId, selectedRoomId]);

  // Generate unique client ID
  const generateClientId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Mark messages as read with retry logic
  const markMessagesAsRead = useCallback(() => {
    if (!user || !roomId || isGroup) {
      console.log('Skipping markMessagesAsRead:', { hasUser: !!user, roomId, isGroup });
      return;
    }

    const unreadMessages = messages
      .filter(msg => !msg.read && !isMessageFromMe(msg) && msg._id)
      .map(msg => msg._id);

    if (unreadMessages.length > 0) {
      console.log('Marking messages as read:', {
        count: unreadMessages.length,
        messageIds: unreadMessages,
        roomId,
        userId: user.id
      });

      // Function to attempt marking messages as read
      const attemptMarkAsRead = (retryCount = 0) => {
        socketClient.emit('message:read', {
          roomId,
          userId: user.id,
          messageIds: unreadMessages
        });

        // If retry count is less than 3, set up a retry timeout
        if (retryCount < 3) {
          setTimeout(() => {
            // Check if messages are still unread
            const stillUnread = messages
              .filter(msg => unreadMessages.includes(msg._id) && !msg.read)
              .map(msg => msg._id);

            if (stillUnread.length > 0) {
              console.log(`Retrying mark as read (attempt ${retryCount + 1}/3)...`);
              attemptMarkAsRead(retryCount + 1);
            }
          }, 1000 * (retryCount + 1));
        } else {
          console.error('Failed to mark messages as read after 3 attempts');
        }
      };

      // Start the first attempt
      attemptMarkAsRead();
    } else {
      console.log('No unread messages to mark');
    }
  }, [user, roomId, isGroup, messages, isMessageFromMe]);

  // Handle socket connection status
  useEffect(() => {
    const handleConnect = () => {
      console.log('Connected to socket server');
      setIsConnected(true);
      if (user) {
        socketClient.emit('user:connect', user.id);
      }
    };
    
    const handleDisconnect = () => {
      console.log('Disconnected from socket server');
      setIsConnected(false);
    };

    const handleError = (error: Error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    };

    // Set initial connection state
    setIsConnected(socketClient.connected);

    // Set up event listeners
    socketClient.on('connect', handleConnect);
    socketClient.on('disconnect', handleDisconnect);
    socketClient.on('connect_error', handleError);

    // Handle window focus
    const handleFocus = () => {
      if (user && !socketClient.connected) {
        console.log('Window focused, reconnecting socket...');
        socketClient.connect();
      }
    };
    window.addEventListener('focus', handleFocus);

    // Clean up
    return () => {
      socketClient.off('connect');
      socketClient.off('disconnect');
      socketClient.off('connect_error');
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // Load messages when room changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!roomId || !user) {
        setMessages([]);
        return;
      }

      try {
        setIsLoading(true);
        const response = await api.get<Message[]>(`/messages/room/${roomId}`);
        
        setMessages(response.data.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ));
        
        // Scroll to bottom after loading
        setTimeout(() => scrollToBottom(true), 100);
      } catch (error) {
        console.error('Failed to load messages:', error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [roomId, user, scrollToBottom]);

  // Mark messages as read when room is opened
  useEffect(() => {
    if (!user || !roomId || isGroup) return;

    const timer = setTimeout(() => {
      socketClient.emit('message:read', { roomId, userId: user.id });
    }, 500); // Small delay to ensure messages are loaded

    return () => clearTimeout(timer);
  }, [roomId, user, isGroup]);

  // Set up socket message listeners
  useEffect(() => {
    if (!user) return;

    // Set up event listeners with proper types
    const messageReceiveHandler = (message: Message) => {
      if (!message || message.room !== roomId) {
        console.log('Skipping message:', { 
          hasMessage: !!message, 
          messageRoom: message?.room, 
          expectedRoom: roomId 
        });
        return;
      }

      console.log('Received message:', {
        messageId: message._id,
        senderId: typeof message.sender === 'string' ? message.sender : message.sender._id,
        isRead: message.read,
        isDelivered: message.delivered
      });

      handleNewMessage(message);

      // Mark message as read if it's not from us and we're at bottom
      if (!isGroup && !isMessageFromMe(message) && isScrolledToBottom()) {
        console.log('Auto-marking received message as read:', {
          messageId: message._id,
          roomId,
          userId: user.id
        });
        markMessagesAsRead();
      }
    };

    const messageSentHandler = (response: SocketResponse) => {
      if (!response.success || !response.message) return;
      handleNewMessage(response.message);
    };

    const messageDeliveredHandler = (data: { messageId: string }) => {
      console.log('Message delivered:', {
        messageId: data.messageId,
        roomId
      });
      setMessages(prev =>
        prev.map(msg =>
          msg._id === data.messageId
            ? { ...msg, delivered: true }
            : msg
        )
      );
    };

    const messageReadAckHandler = (data: { messageIds: string[]; readAt: string; read: boolean }) => {
      console.log('Messages read acknowledgment:', {
        messageIds: data.messageIds,
        readAt: data.readAt,
        roomId
      });
      setMessages(prev =>
        prev.map(msg =>
          data.messageIds.includes(msg._id)
            ? { ...msg, read: data.read, readAt: data.readAt, delivered: true }
            : msg
        )
      );
    };

    socketClient.on('message:receive', messageReceiveHandler);
    socketClient.on('message:sent', messageSentHandler);
    socketClient.on('message:delivered', messageDeliveredHandler);
    socketClient.on('message:read:ack', messageReadAckHandler);

    return () => {
      socketClient.off('message:receive');
      socketClient.off('message:sent');
      socketClient.off('message:delivered');
      socketClient.off('message:read:ack');
    };
  }, [roomId, user, isGroup, handleNewMessage, isMessageFromMe, isScrolledToBottom, markMessagesAsRead]);

  // Handle auto-read when scrolled to bottom
  useEffect(() => {
    if (isScrolledToBottom()) {
      markMessagesAsRead();
    }
  }, [messages, isScrolledToBottom, markMessagesAsRead]);

  // Handle sending new message
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !isConnected) return;

    const clientId = generateClientId();
    const optimisticMessage: Message = {
      _id: clientId,
      clientId,
      sender: user.id,
      room: roomId,
      type: 'text',
      content: newMessage.trim(),
      read: false,
      delivered: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      senderName: user.name,
      isSending: true
    };

    // Add optimistic message
    handleNewMessage(optimisticMessage);

    // Clear input
    setNewMessage('');

    // Emit socket event
    socketClient.emit('message:send', {
      senderId: user.id,
      roomId,
      type: 'text',
      content: newMessage.trim(),
      clientId
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
  };

  // Message status indicators
  const MessageStatus = ({ message }: { message: Message }) => {
    if (!isMessageFromMe(message)) return null;

    if (message.isSending) {
      return <span className="text-gray-400">⌛</span>;
    }

    // Show blue double ticks if read
    if (message.read) {
      return <span className="text-blue-400">✓✓</span>;
    }

    // Show gray double ticks if delivered
    if (message.delivered) {
      return <span className="text-gray-400">✓✓</span>;
    }

    // Show single gray tick if sent but not delivered
    return <span className="text-gray-400">✓</span>;
  };

  // Find the last read message from the current user
  const findLastReadMessage = useCallback(() => {
    if (!user) return null;
    
    // Get all messages from current user in reverse order
    const myMessages = messages
      .filter(msg => isMessageFromMe(msg))
      .reverse();
    
    // Find first read message (which is the last one chronologically)
    const lastReadMessage = myMessages.find(msg => msg.read);
    
    // Find first unread message after the last read one
    const hasUnreadAfter = lastReadMessage 
      ? myMessages.some(msg => 
          !msg.read && 
          new Date(msg.createdAt) > new Date(lastReadMessage.createdAt)
        )
      : false;

    // Only return the last read message if there are no unread messages after it
    return hasUnreadAfter ? null : lastReadMessage;
  }, [messages, user, isMessageFromMe]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileSend = async () => {
    if (!selectedFile || !user || !isConnected) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Remove the Content-Type header and let the browser set it
      const response = await api.post('/upload/media', formData);
      
      console.log('Upload response:', response.data);
      const { url, type, fileName, mimeType } = response.data;

      // Generate client ID for optimistic update
      const clientId = generateClientId();

      // Create optimistic message
      const optimisticMessage: Message = {
        _id: clientId,
        clientId,
        sender: user.id,
        room: roomId,
        type,
        mediaUrl: url,
        fileName,
        mimeType,
        content: '', // Empty content for media messages
        read: false,
        delivered: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        senderName: user.name,
        isSending: true
      };

      // Add optimistic message
      handleNewMessage(optimisticMessage);

      console.log('Sending media message:', {
        type,
        mediaUrl: url,
        fileName,
        mimeType,
        roomId,
        clientId
      });

      // Emit socket event with all required fields
      socketClient.emit('message:send', {
        senderId: user.id,
        roomId,
        type,
        mediaUrl: url,
        fileName,
        mimeType,
        content: '', // Empty content for media messages
        clientId
      });

      // Clear selected file
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Failed to upload file:', error);
      alert(error.response?.data?.details || error.response?.data?.error || 'Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Render message content based on type
  const MessageContent = ({ message }: { message: Message }) => {
    switch (message.type) {
      case 'image':
        return (
          <div className="relative">
            <img
              src={message.mediaUrl}
              alt="Shared image"
              className="max-w-full rounded-lg"
              loading="lazy"
            />
          </div>
        );
      case 'video':
        return (
          <video
            controls
            className="max-w-full rounded-lg"
            preload="metadata"
          >
            <source src={message.mediaUrl} type={message.mimeType} />
            Your browser does not support the video tag.
          </video>
        );
      case 'file':
        return (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{message.fileName}</span>
          </a>
        );
      default:
        return <p>{message.content}</p>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg overflow-hidden">
      {/* Connection warning */}
      {!isConnected && (
        <div className="bg-yellow-500 text-black px-4 py-2 text-center">
          ⚠️ Reconnecting...
        </div>
      )}

      {/* Messages area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-700 rounded-lg w-2/3" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">No messages yet. Start a conversation!</div>
          </div>
        ) : (
          messages.map((message, index) => {
            const isLastReadMessage = findLastReadMessage()?._id === message._id;
            
            return (
              <div key={message.clientId || message._id}>
                <div
                  className={`flex ${isMessageFromMe(message) ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Show avatar in group chats */}
                  {isGroup && !isMessageFromMe(message) && (
                    <img
                      src={typeof message.sender === 'object' ? message.sender.avatar || 'https://via.placeholder.com/150' : 'https://via.placeholder.com/150'}
                      alt={message.senderName}
                      className="w-8 h-8 rounded-full mr-2"
                    />
                  )}
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isMessageFromMe(message)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-700 text-gray-100'
                    } ${message.isSending ? 'opacity-75' : ''}`}
                  >
                    {isGroup && !isMessageFromMe(message) && (
                      <p className="text-xs text-gray-400 mb-1">
                        {message.senderName}
                      </p>
                    )}
                    <MessageContent message={message} />
                    <div className="text-xs opacity-75 flex items-center gap-1 justify-end">
                      <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                      <MessageStatus message={message} />
                    </div>
                  </div>
                </div>
                {/* Show "Seen at" only after the last read message */}
                {isLastReadMessage && message.readAt && (
                  <div className="text-xs text-blue-400 text-right mt-1 mb-4 pr-4 italic">
                    Seen at {new Date(message.readAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File preview */}
      {selectedFile && (
        <div className="bg-gray-700 p-2">
          <div className="flex items-center justify-between">
            <span className="text-white">{selectedFile.name}</span>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* New messages button */}
      {showNewMessageButton && newMessageCount > 0 && (
        <button
          onClick={handleScrollToBottom}
          className="fixed bottom-24 right-8 bg-indigo-600 text-white rounded-full px-4 py-2 shadow-lg hover:bg-indigo-700 transition-colors z-10"
        >
          {getNewMessageText()}
        </button>
      )}

      {/* Message input */}
      <form onSubmit={handleSubmit} className="bg-gray-700 p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder={isConnected ? "Type a message..." : "Reconnecting..."}
            className="flex-1 bg-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isLoading || !user || !isConnected || isUploading}
          />
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || !user || !isConnected || isUploading}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <button
            type="submit"
            disabled={isLoading || !newMessage.trim() || !user || !isConnected || isUploading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
          {selectedFile && (
            <button
              type="button"
              onClick={handleFileSend}
              disabled={isLoading || !user || !isConnected || isUploading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isUploading ? 'Uploading...' : 'Send File'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}