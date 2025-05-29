import { create } from 'zustand';

interface PresenceStore {
  onlineUsers: Set<string>;
  typingUsers: Map<string, string[]>;
  setOnlineUsers: (users: string[]) => void;
  addOnlineUser: (userId: string) => void;
  removeOnlineUser: (userId: string) => void;
  setTypingUsers: (roomId: string, users: string[]) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  onlineUsers: new Set<string>(),
  typingUsers: new Map<string, string[]>(),

  setOnlineUsers: (users) =>
    set(() => ({
      onlineUsers: new Set(users)
    })),

  addOnlineUser: (userId) =>
    set((state) => {
      const newSet = new Set(state.onlineUsers);
      newSet.add(userId);
      return { onlineUsers: newSet };
    }),

  removeOnlineUser: (userId) =>
    set((state) => {
      const newSet = new Set(state.onlineUsers);
      newSet.delete(userId);
      return { onlineUsers: newSet };
    }),

  setTypingUsers: (roomId, users) =>
    set((state) => {
      const newMap = new Map(state.typingUsers);
      newMap.set(roomId, users);
      return { typingUsers: newMap };
    })
})); 