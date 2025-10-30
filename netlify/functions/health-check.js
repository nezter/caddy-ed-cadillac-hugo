/**
 * Health Check API
 * Provides system health status and performance metrics
 */

const enhancedDatabaseService = require('./utils/enhanced-database-service');
const redisCacheService = require('./utils/redis-cache-service');
const performanceMonitor = require('./utils/performance-monitor');
const { createSecureResponse } = require('./utils/security-middleware');

exports.handler = async function(event, context) {
  try {
    const startTime = Date.now();
    const method = event.httpMethod;
    const path = (event.path || '').replace('/.netlify/functions/health-check', '');

    // Apply basic security (no auth for health checks)
    const securityResult = await require('./utils/security-middleware').applySecurity(event, {
      enableRateLimit: false, // No rate limiting for health checks
      enableCORS: true
    });

    if (securityResult && method !== 'GET') {
      return securityResult;
    }

    if (method !== 'GET') {
      return createSecureResponse(405, {
        success: false,
        error: 'Method not allowed',
        message: 'Only GET method is supported for health checks'
      });
    }

    // Route to different health check endpoints
    switch (path) {
      case '':
      case '/':
        return await getBasicHealth();
      case '/detailed':
        return await getDetailedHealth();
      case '/database':
        return await getDatabaseHealth();
      case '/cache':
        return await getCacheHealth();
      case '/performance':
        return await getPerformanceMetrics();
      case '/metrics':
        return await getPrometheusMetrics();
      default:
        return createSecureResponse(404, {
          success: false,
          error: 'Endpoint not found',
          availableEndpoints: [
            '/health-check',
            '/health-check/detailed',
            '/health-check/database',
            '/health-check/cache',
            '/health-check/performance',
            '/health-check/metrics'
          ]
        });
    }

  } catch (error) {
    console.error('Health check error:', error);
    return createSecureResponse(500, {
      success: false,
      error: 'Health check failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Basic health check - returns simple status
 */
async function getBasicHealth() {
  const startTime = Date.now();
  
  try {
    // Quick checks
    const dbHealth = await enhancedDatabaseService.healthCheck();
    const cacheHealth = await redisCacheService.healthCheck();
    const memoryUsage = process.memoryUsage();
    
    const overallStatus = (dbHealth.postgres || dbHealth.supabase) && 
                         cacheHealth.status !== 'unhealthy' ? 
                         'healthy' : 'unhealthy';
    
    const responseTime = Date.now() - startTime;
    
    return createSecureResponse(200, {
      success: true,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: {
          status: dbHealth.postgres || dbHealth.supabase ? 'connected' : 'disconnected',
          type: dbHealth.postgres ? 'postgresql' : (dbHealth.supabase ? 'supabase' : 'none')
        },
        cache: {
          status: cacheHealth.status,
          connected: cacheHealth.connected
        }
      },
      memory: {
        used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
      },
      uptime: {
        seconds: Math.floor(process.uptime()),
        human: formatUptime(process.uptime())
      }
    });

  } catch (error) {
    return createSecureResponse(503, {
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Detailed health check - comprehensive system status
 */
async function getDetailedHealth() {
  const startTime = Date.now();
  
  try {
    const [dbHealth, cacheHealth, perfMetrics] = await Promise.all([
      enhancedDatabaseService.healthCheck(),
      redisCacheService.healthCheck(),
      Promise.resolve(performanceMonitor.getPerformanceSummary())
    ]);
    
    const responseTime = Date.now() - startTime;
    
    return createSecureResponse(200, {
      success: true,
      status: perfMetrics.overall.status,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        environment: process.env.NODE_ENV || 'development'
      },
      services: {
        database: {
          ...dbHealth,
          details: {
            postgres: dbHealth.postgres,
            supabase: dbHealth.supabase,
            turso: dbHealth.turso
          }
        },
        cache: cacheHealth,
        performance: perfMetrics
      },
      memory: {
        ...getDetailedMemoryInfo(),
        loadAverage: process.loadavg ? process.loadavg() : null
      },
      uptime: {
        seconds: Math.floor(process.uptime()),
        human: formatUptime(process.uptime()),
        detailed: getDetailedUptime()
      }
    });

  } catch (error) {
    return createSecureResponse(503, {
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Database health check
 */
async function getDatabaseHealth() {
  try {
    const dbHealth = await enhancedDatabaseService.healthCheck();
    const queryStats = enhancedDatabaseService.getQueryStats();
    
    return createSecureResponse(200, {
      success: true,
      database: dbHealth,
      statistics: queryStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return createSecureResponse(503, {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Cache health check
 */
async function getCacheHealth() {
  try {
    const cacheHealth = await redisCacheService.healthCheck();
    const cacheStats = redisCacheService.getStats();
    
    return createSecureResponse(200, {
      success: true,
      cache: cacheHealth,
      statistics: cacheStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return createSecureResponse(503, {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Performance metrics
 */
async function getPerformanceMetrics() {
  try {
    const metrics = performanceMonitor.getMetrics();
    const summary = performanceMonitor.getPerformanceSummary();
    
    return createSecureResponse(200, {
      success: true,
      metrics: metrics,
      summary: summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return createSecureResponse(500, {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Prometheus metrics export
 */
async function getPrometheusMetrics() {
  try {
    const prometheusMetrics = performanceMonitor.exportMetrics('prometheus');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
      },
      body: prometheusMetrics
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/plain'
      },
      body: `# Health check failed\n${error.message}`
    };
  }
}

/**
 * Get detailed memory information
 */
function getDetailedMemoryInfo() {
  const usage = process.memoryUsage();
  
  return {
    heap: {
      used: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
    },
    external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    arrayBuffers: usage.arrayBuffers ? `${Math.round(usage.arrayBuffers / 1024 / 1024)}MB` : 'N/A',
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
  };
}

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

/**
 * Get detailed uptime information
 */
function getDetailedUptime() {
  const uptime = process.uptime();
  const now = new Date();
  const startTime = new Date(now.getTime() - uptime * 1000);
  
  return {
    seconds: Math.floor(uptime),
    startTime: startTime.toISOString(),
    currentTime: now.toISOString(),
    human: formatUptime(uptime)
  };
}