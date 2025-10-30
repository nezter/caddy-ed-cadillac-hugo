/**
 * Redis Cache Service
 * Provides high-performance caching layer for frequently accessed data
 */

const Redis = require('ioredis');

class RedisCacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.connectionPromise = null;
    this.defaultTTL = 300; // 5 minutes
    this.keyPrefix = 'followup_system:';
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      sets: 0
    };
  }

  /**
   * Initialize Redis connection with enhanced configuration
   */
  async initialize() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      try {
        // Support multiple Redis connection methods
        const redisUrl = process.env.REDIS_URL || 
                        process.env.REDIS_CONNECTION_STRING ||
                        process.env.UPSTASH_REDIS_REST_URL;

        if (!redisUrl) {
          console.warn('Redis connection string not found. Caching will be disabled.');
          return null;
        }

        // Redis configuration with connection pooling
        const redisConfig = {
          // Connection settings
          connectTimeout: 10000,
          commandTimeout: 5000,
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          
          // Connection pooling
          family: 4,
          keepAlive: 30000,
          
          // Performance optimizations
          enableOfflineQueue: false,
          maxMemoryPolicy: 'allkeys-lru',
          
          // TLS for secure connections
          tls: redisUrl.includes('rediss://') ? {} : undefined
        };

        // Handle different Redis providers
        if (redisUrl.includes('upstash') || process.env.UPSTASH_REDIS_REST_TOKEN) {
          // Upstash Redis REST API configuration
          this.redis = new Redis(redisUrl, {
            ...redisConfig,
            // Upstash-specific settings
            password: process.env.UPSTASH_REDIS_REST_TOKEN,
            tls: { rejectUnauthorized: false }
          });
        } else {
          // Standard Redis configuration
          this.redis = new Redis(redisUrl, redisConfig);
        }

        // Event handlers
        this.redis.on('connect', () => {
          console.log('✅ Redis connected successfully');
          this.isConnected = true;
        });

        this.redis.on('ready', () => {
          console.log('✅ Redis ready for commands');
        });

        this.redis.on('error', (error) => {
          console.error('Redis connection error:', error.message);
          this.isConnected = false;
          this.stats.errors++;
        });

        this.redis.on('close', () => {
          console.log('Redis connection closed');
          this.isConnected = false;
        });

        this.redis.on('reconnecting', () => {
          console.log('Redis reconnecting...');
        });

        // Test connection
        await this.redis.ping();
        console.log('✅ Redis cache service initialized');
        
        return this.redis;
      } catch (error) {
        console.error('Failed to initialize Redis:', error.message);
        this.isConnected = false;
        return null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Generate prefixed cache key
   */
  generateKey(key) {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.isConnected || !this.redis) {
      this.stats.misses++;
      return null;
    }

    try {
      const prefixedKey = this.generateKey(key);
      const value = await this.redis.get(prefixedKey);
      
      if (value !== null) {
        this.stats.hits++;
        return JSON.parse(value);
      } else {
        this.stats.misses++;
        return null;
      }
    } catch (error) {
      console.error('Redis get error:', error.message);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const prefixedKey = this.generateKey(key);
      const serializedValue = JSON.stringify(value);
      
      if (ttl > 0) {
        await this.redis.setex(prefixedKey, ttl, serializedValue);
      } else {
        await this.redis.set(prefixedKey, serializedValue);
      }
      
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('Redis set error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const prefixedKey = this.generateKey(key);
      await this.redis.del(prefixedKey);
      return true;
    } catch (error) {
      console.error('Redis delete error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const prefixedKey = this.generateKey(key);
      const result = await this.redis.exists(prefixedKey);
      return result === 1;
    } catch (error) {
      console.error('Redis exists error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key, ttl) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const prefixedKey = this.generateKey(key);
      await this.redis.expire(prefixedKey, ttl);
      return true;
    } catch (error) {
      console.error('Redis expire error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key) {
    if (!this.isConnected || !this.redis) {
      return -1;
    }

    try {
      const prefixedKey = this.generateKey(key);
      return await this.redis.ttl(prefixedKey);
    } catch (error) {
      console.error('Redis TTL error:', error.message);
      this.stats.errors++;
      return -1;
    }
  }

  /**
   * Increment numeric value
   */
  async incr(key, amount = 1) {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    try {
      const prefixedKey = this.generateKey(key);
      if (amount === 1) {
        return await this.redis.incr(prefixedKey);
      } else {
        return await this.redis.incrby(prefixedKey, amount);
      }
    } catch (error) {
      console.error('Redis increment error:', error.message);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Add item to list
   */
  async listAdd(key, value, maxLength = null) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const prefixedKey = this.generateKey(key);
      const serializedValue = JSON.stringify(value);
      
      if (maxLength) {
        await this.redis.lpush(prefixedKey, serializedValue);
        await this.redis.ltrim(prefixedKey, 0, maxLength - 1);
      } else {
        await this.redis.lpush(prefixedKey, serializedValue);
      }
      
      return true;
    } catch (error) {
      console.error('Redis list add error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get items from list
   */
  async listGet(key, start = 0, end = -1) {
    if (!this.isConnected || !this.redis) {
      return [];
    }

    try {
      const prefixedKey = this.generateKey(key);
      const values = await this.redis.lrange(prefixedKey, start, end);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      console.error('Redis list get error:', error.message);
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Add item to set
   */
  async setAdd(key, value) {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const prefixedKey = this.generateKey(key);
      const serializedValue = JSON.stringify(value);
      await this.redis.sadd(prefixedKey, serializedValue);
      return true;
    } catch (error) {
      console.error('Redis set add error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get items from set
   */
  async setGet(key) {
    if (!this.isConnected || !this.redis) {
      return [];
    }

    try {
      const prefixedKey = this.generateKey(key);
      const values = await this.redis.smembers(prefixedKey);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      console.error('Redis set get error:', error.message);
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Cache invalidation patterns
   */
  async invalidatePattern(pattern) {
    if (!this.isConnected || !this.redis) {
      return 0;
    }

    try {
      const prefixedPattern = this.generateKey(pattern);
      const keys = await this.redis.keys(prefixedPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Invalidated ${keys.length} cache entries matching pattern: ${pattern}`);
      }
      
      return keys.length;
    } catch (error) {
      console.error('Redis invalidate pattern error:', error.message);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Cache warming for frequently accessed data
   */
  async warmCache(dataSources = []) {
    console.log('Starting cache warming...');
    
    for (const source of dataSources) {
      try {
        const { key, fetcher, ttl } = source;
        const data = await fetcher();
        
        if (data) {
          await this.set(key, data, ttl);
          console.log(`Warmed cache for key: ${key}`);
        }
      } catch (error) {
        console.error(`Failed to warm cache for ${source.key}:`, error.message);
      }
    }
    
    console.log('Cache warming completed');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      isConnected: this.isConnected
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      sets: 0
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.redis) {
      return { status: 'not_initialized', connected: false };
    }

    try {
      const startTime = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        connected: this.isConnected,
        responseTime: `${responseTime}ms`,
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        stats: this.getStats()
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.redis) {
      await this.redis.quit();
      console.log('Redis connection closed');
    }
  }
}

// Singleton instance
const redisCacheService = new RedisCacheService();

// Initialize on module load
redisCacheService.initialize().catch(error => {
  console.error('Failed to initialize Redis cache service:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redisCacheService.shutdown();
});

process.on('SIGINT', async () => {
  await redisCacheService.shutdown();
});

module.exports = redisCacheService;