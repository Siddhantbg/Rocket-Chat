const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Initialize rate limiter (test configuration)
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10s'), // Reduced to 3 messages per 10 seconds for testing
  analytics: true,
});

class UpstashService {
  // Rate limiting
  async checkRateLimit(userId) {
    const { success, limit, reset, remaining } = await ratelimit.limit(userId);
    return { success, limit, reset, remaining };
  }

  // User profile caching
  async getCachedUserProfile(userId) {
    const cachedProfile = await redis.get(`user:${userId}`);
    return cachedProfile ? JSON.parse(cachedProfile) : null;
  }

  async setCachedUserProfile(userId, profile) {
    await redis.set(`user:${userId}`, JSON.stringify(profile), { ex: 3600 }); // 1 hour TTL
  }

  // Unread counts caching
  async getCachedUnreadCount(roomId, userId) {
    return await redis.get(`unread:${roomId}:${userId}`);
  }

  async setCachedUnreadCount(roomId, userId, count) {
    await redis.set(`unread:${roomId}:${userId}`, count, { ex: 300 }); // 5 minutes TTL
  }
}

module.exports = new UpstashService(); 