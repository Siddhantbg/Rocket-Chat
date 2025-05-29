import { useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { socketClient } from '../sockets/socket';
import api from '../lib/axios';

const Profile = () => {
  const { user, updateUser } = useAuthStore();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image size must be less than 2MB');
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await api.post('/upload/avatar', formData);
      const { avatarUrl } = response.data;

      // Update local user state
      updateUser({ ...user!, avatarUrl });

      // Emit socket event for real-time update
      socketClient.emit('user:avatar:update', {
        userId: user!.id,
        avatarUrl
      });

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      setError('Failed to upload avatar. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center space-x-6">
            <div className="relative">
              <img
                src={user?.avatarUrl || 'https://via.placeholder.com/150'}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                <label
                  htmlFor="avatar-upload"
                  className="cursor-pointer text-sm text-center p-2"
                >
                  Change Photo
                </label>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{user?.name}</h2>
              <p className="text-gray-400">{user?.email}</p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />

          {error && (
            <div className="mt-4 text-red-500 text-sm">
              {error}
            </div>
          )}

          {isUploading && (
            <div className="mt-4 text-blue-400 text-sm">
              Uploading...
            </div>
          )}
        </div>

        {/* Add more profile settings sections here */}
      </div>
    </div>
  );
};

export default Profile; 