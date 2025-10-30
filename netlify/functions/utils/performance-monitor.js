/**
 * Performance Monitoring Service
 * Tracks API performance, database queries, and system health
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        slowRequests: 0
      },
      database: {
        totalQueries: 0,
        slowQueries: 0,
        errors: 0,
        averageQueryTime: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      memory: {
        used: 0,
        total: 0,
        percentage: 0
      },
      uptime: Date.now()
    };
    
    this.requestTimes = [];
    this.queryTimes = [];
    this.slowRequestThreshold = 2000; // 2 seconds
    this.slowQueryThreshold = 1000; // 1 second
    this.maxMetricsHistory = 1000;
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    // Update memory metrics every 30 seconds
    setInterval(() => {
      this.updateMemoryMetrics();
    }, 30000);

    // Clean up old metrics every 5 minutes
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 300000);

    console.log('Performance monitoring started');
  }

  /**
   * Track API request
   */
  trackRequest(method, path, statusCode, responseTime, error = null) {
    this.metrics.requests.total++;
    
    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    if (responseTime > this.slowRequestThreshold) {
      this.metrics.requests.slowRequests++;
      console.warn('Slow request detected:', {
        method,
        path,
        statusCode,
        responseTime: `${responseTime}ms`
      });
    }

    // Track response time for average calculation
    this.requestTimes.push(responseTime);
    if (this.requestTimes.length > this.maxMetricsHistory) {
      this.requestTimes.shift();
    }

    this.updateAverageResponseTime();

    // Log request details for debugging
    if (process.env.NODE_ENV === 'development' || error) {
      console.log('Request tracked:', {
        method,
        path,
        statusCode,
        responseTime: `${responseTime}ms`,
        error: error?.message
      });
    }
  }

  /**
   * Track database query
   */
  trackQuery(sql, executionTime, error = null) {
    this.metrics.database.totalQueries++;
    
    if (executionTime > this.slowQueryThreshold) {
      this.metrics.database.slowQueries++;
      console.warn('Slow query detected:', {
        sql: sql.substring(0, 100) + '...',
        executionTime: `${executionTime}ms`
      });
    }

    if (error) {
      this.metrics.database.errors++;
    }

    // Track query time for average calculation
    this.queryTimes.push(executionTime);
    if (this.queryTimes.length > this.maxMetricsHistory) {
      this.queryTimes.shift();
    }

    this.updateAverageQueryTime();
  }

  /**
   * Track cache performance
   */
  trackCacheHit() {
    this.metrics.cache.hits++;
    this.updateCacheHitRate();
  }

  trackCacheMiss() {
    this.metrics.cache.misses++;
    this.updateCacheHitRate();
  }

  /**
   * Update memory metrics
   */
  updateMemoryMetrics() {
    const usage = process.memoryUsage();
    this.metrics.memory = {
      used: Math.round(usage.heapUsed / 1024 / 1024), // MB
      total: Math.round(usage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
    };
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime() {
    if (this.requestTimes.length === 0) {
      this.metrics.requests.averageResponseTime = 0;
      return;
    }

    const sum = this.requestTimes.reduce((a, b) => a + b, 0);
    this.metrics.requests.averageResponseTime = Math.round(sum / this.requestTimes.length);
  }

  /**
   * Update average query time
   */
  updateAverageQueryTime() {
    if (this.queryTimes.length === 0) {
      this.metrics.database.averageQueryTime = 0;
      return;
    }

    const sum = this.queryTimes.reduce((a, b) => a + b, 0);
    this.metrics.database.averageQueryTime = Math.round(sum / this.queryTimes.length);
  }

  /**
   * Update cache hit rate
   */
  updateCacheHitRate() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = total > 0 
      ? Math.round((this.metrics.cache.hits / total) * 100) 
      : 0;
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics() {
    // Keep only recent metrics for memory efficiency
    if (this.requestTimes.length > this.maxMetricsHistory) {
      this.requestTimes = this.requestTimes.slice(-this.maxMetricsHistory);
    }
    
    if (this.queryTimes.length > this.maxMetricsHistory) {
      this.queryTimes = this.queryTimes.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.metrics.uptime;
    
    return {
      ...this.metrics,
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / 60000),
        hours: Math.floor(uptime / 3600000)
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();
    
    return {
      overall: {
        status: this.getOverallStatus(metrics),
        score: this.calculatePerformanceScore(metrics)
      },
      requests: {
        total: metrics.requests.total,
        successRate: metrics.requests.total > 0 
          ? Math.round((metrics.requests.successful / metrics.requests.total) * 100) 
          : 0,
        averageResponseTime: `${metrics.requests.averageResponseTime}ms`,
        slowRequests: metrics.requests.slowRequests
      },
      database: {
        totalQueries: metrics.database.totalQueries,
        averageQueryTime: `${metrics.database.averageQueryTime}ms`,
        slowQueries: metrics.database.slowQueries,
        errorRate: metrics.database.totalQueries > 0
          ? Math.round((metrics.database.errors / metrics.database.totalQueries) * 100)
          : 0
      },
      cache: {
        hitRate: `${metrics.cache.hitRate}%`,
        totalOperations: metrics.cache.hits + metrics.cache.misses
      },
      memory: {
        usage: `${metrics.memory.used}MB / ${metrics.memory.total}MB`,
        percentage: `${metrics.memory.percentage}%`
      },
      uptime: metrics.uptime
    };
  }

  /**
   * Get overall system status
   */
  getOverallStatus(metrics) {
    const issues = [];

    // Check response times
    if (metrics.requests.averageResponseTime > 3000) {
      issues.push('slow_response_times');
    }

    // Check error rates
    const errorRate = metrics.requests.total > 0 
      ? (metrics.requests.failed / metrics.requests.total) * 100 
      : 0;
    if (errorRate > 5) {
      issues.push('high_error_rate');
    }

    // Check memory usage
    if (metrics.memory.percentage > 85) {
      issues.push('high_memory_usage');
    }

    // Check database performance
    if (metrics.database.averageQueryTime > 2000) {
      issues.push('slow_database_queries');
    }

    if (issues.length === 0) {
      return 'healthy';
    } else if (issues.length <= 2) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Calculate performance score (0-100)
   */
  calculatePerformanceScore(metrics) {
    let score = 100;

    // Response time impact
    if (metrics.requests.averageResponseTime > 1000) {
      score -= Math.min(30, (metrics.requests.averageResponseTime - 1000) / 100);
    }

    // Error rate impact
    const errorRate = metrics.requests.total > 0 
      ? (metrics.requests.failed / metrics.requests.total) * 100 
      : 0;
    if (errorRate > 0) {
      score -= Math.min(40, errorRate * 8);
    }

    // Memory usage impact
    if (metrics.memory.percentage > 70) {
      score -= Math.min(20, (metrics.memory.percentage - 70) / 2);
    }

    // Database performance impact
    if (metrics.database.averageQueryTime > 500) {
      score -= Math.min(20, (metrics.database.averageQueryTime - 500) / 100);
    }

    // Cache performance bonus
    if (metrics.cache.hitRate > 50) {
      score += Math.min(10, (metrics.cache.hitRate - 50) / 10);
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Create performance monitoring middleware
   */
  createMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Track response
      const originalSend = res.send;
      res.send = function(data) {
        const responseTime = Date.now() - startTime;
        
        performanceMonitor.trackRequest(
          req.method,
          req.path,
          res.statusCode,
          responseTime,
          res.statusCode >= 400 ? new Error(`HTTP ${res.statusCode}`) : null
        );
        
        return originalSend.call(this, data);
      };
      
      next();
    };
  }

  /**
   * Export metrics for monitoring systems
   */
  exportMetrics(format = 'json') {
    const metrics = this.getMetrics();
    
    switch (format) {
      case 'prometheus':
        return this.exportPrometheusMetrics(metrics);
      case 'json':
      default:
        return metrics;
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(metrics) {
    const lines = [];
    
    // Request metrics
    lines.push(`# HELP followup_requests_total Total number of requests`);
    lines.push(`# TYPE followup_requests_total counter`);
    lines.push(`followup_requests_total ${metrics.requests.total}`);
    
    lines.push(`# HELP followup_requests_successful Total successful requests`);
    lines.push(`# TYPE followup_requests_successful counter`);
    lines.push(`followup_requests_successful ${metrics.requests.successful}`);
    
    lines.push(`# HELP followup_requests_failed Total failed requests`);
    lines.push(`# TYPE followup_requests_failed counter`);
    lines.push(`followup_requests_failed ${metrics.requests.failed}`);
    
    lines.push(`# HELP followup_response_time_ms Average response time in milliseconds`);
    lines.push(`# TYPE followup_response_time_ms gauge`);
    lines.push(`followup_response_time_ms ${metrics.requests.averageResponseTime}`);
    
    // Database metrics
    lines.push(`# HELP followup_db_queries_total Total database queries`);
    lines.push(`# TYPE followup_db_queries_total counter`);
    lines.push(`followup_db_queries_total ${metrics.database.totalQueries}`);
    
    lines.push(`# HELP followup_db_query_time_ms Average query time in milliseconds`);
    lines.push(`# TYPE followup_db_query_time_ms gauge`);
    lines.push(`followup_db_query_time_ms ${metrics.database.averageQueryTime}`);
    
    // Cache metrics
    lines.push(`# HELP followup_cache_hits Total cache hits`);
    lines.push(`# TYPE followup_cache_hits counter`);
    lines.push(`followup_cache_hits ${metrics.cache.hits}`);
    
    lines.push(`# HELP followup_cache_misses Total cache misses`);
    lines.push(`# TYPE followup_cache_misses counter`);
    lines.push(`followup_cache_misses ${metrics.cache.misses}`);
    
    // Memory metrics
    lines.push(`# HELP followup_memory_usage_bytes Memory usage in bytes`);
    lines.push(`# TYPE followup_memory_usage_bytes gauge`);
    lines.push(`followup_memory_usage_bytes ${metrics.memory.used * 1024 * 1024}`);
    
    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        slowRequests: 0
      },
      database: {
        totalQueries: 0,
        slowQueries: 0,
        errors: 0,
        averageQueryTime: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      memory: {
        used: 0,
        total: 0,
        percentage: 0
      },
      uptime: Date.now()
    };
    
    this.requestTimes = [];
    this.queryTimes = [];
    
    console.log('Performance metrics reset');
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;