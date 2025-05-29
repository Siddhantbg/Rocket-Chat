const User = require('../models/User');
const upstash = require('./upstashRedis');

class UserService {
  async getUserProfile(userId) {
    try {
      // Try to get from cache first
      const cachedProfile = await upstash.getCachedUserProfile(userId);
      if (cachedProfile) {
        return cachedProfile;
      }

      // If not in cache, get from database
      const user = await User.findById(userId).select('-password');
      if (!user) {
        return null;
      }

      // Cache the profile
      const profile = user.toJSON();
      await upstash.setCachedUserProfile(userId, profile);

      return profile;
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      throw error;
    }
  }

  async updateUserProfile(userId, updateData) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true }
      ).select('-password');

      if (!user) {
        return null;
      }

      // Update cache
      const profile = user.toJSON();
      await upstash.setCachedUserProfile(userId, profile);

      return profile;
    } catch (error) {
      console.error('Error in updateUserProfile:', error);
      throw error;
    }
  }
}

module.exports = new UserService(); 