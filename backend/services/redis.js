const Redis = require('ioredis');

class RedisService {
  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  // User presence methods
  async addOnlineUser(userId) {
    return this.client.sadd('online_users', userId);
  }

  async removeOnlineUser(userId) {
    return this.client.srem('online_users', userId);
  }

  async getOnlineUsers() {
    return this.client.smembers('online_users');
  }

  // Room methods
  async addRoomMember(roomId, userId) {
    return this.client.sadd(`room:${roomId}:members`, userId);
  }

  async getRoomMembers(roomId) {
    return this.client.smembers(`room:${roomId}:members`);
  }

  async removeRoomMember(roomId, userId) {
    return this.client.srem(`room:${roomId}:members`, userId);
  }

  // Unread counts
  async incrementUnreadCount(roomId, userId) {
    return this.client.incr(`room:${roomId}:unread:${userId}`);
  }

  async getUnreadCount(roomId, userId) {
    const count = await this.client.get(`room:${roomId}:unread:${userId}`);
    return parseInt(count) || 0;
  }

  async resetUnreadCount(roomId, userId) {
    return this.client.set(`room:${roomId}:unread:${userId}`, 0);
  }

  // Typing indicators
  async setTyping(roomId, userId) {
    // Set typing status with 5-second expiry
    return this.client.setex(`room:${roomId}:typing:${userId}`, 5, '1');
  }

  async getTypingUsers(roomId) {
    const pattern = `room:${roomId}:typing:*`;
    const keys = await this.client.keys(pattern);
    return keys.map(key => key.split(':').pop());
  }

  // Room metadata
  async updateRoomLastActivity(roomId) {
    return this.client.set(`room:${roomId}:lastActivity`, Date.now());
  }

  async getRoomLastActivity(roomId) {
    return this.client.get(`room:${roomId}:lastActivity`);
  }

  // Cleanup methods
  async clearRoomData(roomId) {
    const pattern = `room:${roomId}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      return this.client.del(...keys);
    }
    return 0;
  }

  async clearUserData(userId) {
    await this.removeOnlineUser(userId);
    // Clear typing indicators
    const pattern = `*:typing:${userId}`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

module.exports = new RedisService(); 