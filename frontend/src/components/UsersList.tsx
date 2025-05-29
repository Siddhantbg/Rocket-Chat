import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

interface User {
  id: string;
  name: string;
  code: string;
  avatarUrl: string;
}

interface UsersListProps {
  onSelectUser: (user: User) => void;
  selectedUserId?: string;
}

export default function UsersList({ onSelectUser, selectedUserId }: UsersListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/users');
        // Filter out the current user from the list
        const otherUsers = response.data.filter((u: User) => u.id !== currentUser?.id);
        setUsers(otherUsers);
      } catch (error: any) {
        setError(error.response?.data?.error || 'Failed to fetch users');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [currentUser?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 bg-gray-700">
        <h2 className="text-lg font-semibold text-white">Users</h2>
      </div>
      <div className="divide-y divide-gray-700">
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelectUser(user)}
            className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-700 transition-colors ${
              selectedUserId === user.id ? 'bg-gray-700' : ''
            }`}
          >
            <div className="shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center">
                  <span className="text-white text-lg font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="text-white font-medium">{user.name}</div>
              <div className="text-gray-400 text-sm">Code: {user.code}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
} 