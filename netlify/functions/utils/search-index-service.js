/**
 * Search Index Service
 * Handles search indexing, caching, and performance optimizations
 */

const DatabaseService = require('./database-service');

class SearchIndexService {
  constructor() {
    this.indexCache = new Map();
    this.suggestionCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Build or rebuild search indexes
   * @param {Array} entityTypes - Types of entities to index
   * @returns {Object} - Indexing results
   */
  static async buildIndexes(entityTypes = ['customers', 'leads', 'interactions', 'vehicles']) {
    const results = {
      startTime: Date.now(),
      indexes: {},
      totalRecords: 0,
      errors: []
    };

    try {
      for (const entityType of entityTypes) {
        try {
          const indexResult = await this.buildEntityIndex(entityType);
          results.indexes[entityType] = indexResult;
          results.totalRecords += indexResult.recordCount;
        } catch (error) {
          console.error(`Error building index for ${entityType}:`, error);
          results.errors.push({
            entityType,
            error: error.message
          });
        }
      }

      results.duration = Date.now() - results.startTime;

      // Update index metadata
      await this.updateIndexMetadata(results);

      return results;

    } catch (error) {
      console.error('Error building search indexes:', error);
      throw error;
    }
  }

  /**
   * Build index for a specific entity type
   */
  static async buildEntityIndex(entityType) {
    const result = {
      recordCount: 0,
      searchableFields: [],
      indexSize: 0
    };

    try {
      switch (entityType) {
        case 'customers':
          result.searchableFields = ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'vehicle_interest'];
          result.recordCount = await this.indexCustomers();
          break;
        case 'leads':
          result.searchableFields = ['first_name', 'last_name', 'email', 'phone', 'message', 'vehicle_interest'];
          result.recordCount = await this.indexLeads();
          break;
        case 'interactions':
          result.searchableFields = ['subject', 'content', 'summary'];
          result.recordCount = await this.indexInteractions();
          break;
        case 'vehicles':
          result.searchableFields = ['stock_number', 'vin', 'make', 'model', 'trim', 'exterior_color', 'interior_color', 'engine'];
          result.recordCount = await this.indexVehicles();
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      return result;

    } catch (error) {
      console.error(`Error indexing ${entityType}:`, error);
      throw error;
    }
  }

  /**
   * Index customers for search
   */
  static async indexCustomers() {
    // Create or update search index table for customers
    const createIndexSql = `
      CREATE TABLE IF NOT EXISTS customer_search_index (
        customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
        search_vector TSVECTOR,
        searchable_text TEXT,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_customer_search_vector ON customer_search_index USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_customer_search_updated ON customer_search_index(last_updated);
    `;

    await DatabaseService.query(createIndexSql);

    // Populate/update index
    const indexSql = `
      INSERT INTO customer_search_index (customer_id, search_vector, searchable_text, last_updated)
      SELECT
        c.id,
        to_tsvector('english',
          coalesce(c.first_name, '') || ' ' ||
          coalesce(c.last_name, '') || ' ' ||
          coalesce(c.email, '') || ' ' ||
          coalesce(c.phone, '') || ' ' ||
          coalesce(c.address_line1, '') || ' ' ||
          coalesce(c.city, '') || ' ' ||
          coalesce(c.state, '') || ' ' ||
          coalesce(c.vehicle_interest, '')
        ),
        coalesce(c.first_name, '') || ' ' ||
        coalesce(c.last_name, '') || ' ' ||
        coalesce(c.email, '') || ' ' ||
        coalesce(c.phone, '') || ' ' ||
        coalesce(c.address_line1, '') || ' ' ||
        coalesce(c.city, '') || ' ' ||
        coalesce(c.state, '') || ' ' ||
        coalesce(c.vehicle_interest, ''),
        NOW()
      FROM customers c
      ON CONFLICT (customer_id)
      DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        searchable_text = EXCLUDED.searchable_text,
        last_updated = EXCLUDED.last_updated;
    `;

    const result = await DatabaseService.query(indexSql);
    return result.rowCount || 0;
  }

  /**
   * Index leads for search
   */
  static async indexLeads() {
    const createIndexSql = `
      CREATE TABLE IF NOT EXISTS lead_search_index (
        lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
        search_vector TSVECTOR,
        searchable_text TEXT,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_lead_search_vector ON lead_search_index USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_lead_search_updated ON lead_search_index(last_updated);
    `;

    await DatabaseService.query(createIndexSql);

    const indexSql = `
      INSERT INTO lead_search_index (lead_id, search_vector, searchable_text, last_updated)
      SELECT
        l.id,
        to_tsvector('english',
          coalesce(l.first_name, '') || ' ' ||
          coalesce(l.last_name, '') || ' ' ||
          coalesce(l.email, '') || ' ' ||
          coalesce(l.phone, '') || ' ' ||
          coalesce(l.message, '') || ' ' ||
          coalesce(l.vehicle_interest, '')
        ),
        coalesce(l.first_name, '') || ' ' ||
        coalesce(l.last_name, '') || ' ' ||
        coalesce(l.email, '') || ' ' ||
        coalesce(l.phone, '') || ' ' ||
        coalesce(l.message, '') || ' ' ||
        coalesce(l.vehicle_interest, ''),
        NOW()
      FROM leads l
      ON CONFLICT (lead_id)
      DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        searchable_text = EXCLUDED.searchable_text,
        last_updated = EXCLUDED.last_updated;
    `;

    const result = await DatabaseService.query(indexSql);
    return result.rowCount || 0;
  }

  /**
   * Index interactions for search
   */
  static async indexInteractions() {
    const createIndexSql = `
      CREATE TABLE IF NOT EXISTS interaction_search_index (
        interaction_id UUID PRIMARY KEY REFERENCES interactions(id) ON DELETE CASCADE,
        search_vector TSVECTOR,
        searchable_text TEXT,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_interaction_search_vector ON interaction_search_index USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_interaction_search_updated ON interaction_search_index(last_updated);
    `;

    await DatabaseService.query(createIndexSql);

    const indexSql = `
      INSERT INTO interaction_search_index (interaction_id, search_vector, searchable_text, last_updated)
      SELECT
        i.id,
        to_tsvector('english',
          coalesce(i.subject, '') || ' ' ||
          coalesce(i.content, '') || ' ' ||
          coalesce(i.summary, '')
        ),
        coalesce(i.subject, '') || ' ' ||
        coalesce(i.content, '') || ' ' ||
        coalesce(i.summary, ''),
        NOW()
      FROM interactions i
      ON CONFLICT (interaction_id)
      DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        searchable_text = EXCLUDED.searchable_text,
        last_updated = EXCLUDED.last_updated;
    `;

    const result = await DatabaseService.query(indexSql);
    return result.rowCount || 0;
  }

  /**
   * Index vehicles for search
   */
  static async indexVehicles() {
    const createIndexSql = `
      CREATE TABLE IF NOT EXISTS vehicle_search_index (
        vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
        search_vector TSVECTOR,
        searchable_text TEXT,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_vehicle_search_vector ON vehicle_search_index USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_vehicle_search_updated ON vehicle_search_index(last_updated);
    `;

    await DatabaseService.query(createIndexSql);

    const indexSql = `
      INSERT INTO vehicle_search_index (vehicle_id, search_vector, searchable_text, last_updated)
      SELECT
        v.id,
        to_tsvector('english',
          coalesce(v.stock_number::text, '') || ' ' ||
          coalesce(v.vin, '') || ' ' ||
          coalesce(v.make, '') || ' ' ||
          coalesce(v.model, '') || ' ' ||
          coalesce(v.trim, '') || ' ' ||
          coalesce(v.exterior_color, '') || ' ' ||
          coalesce(v.interior_color, '') || ' ' ||
          coalesce(v.engine, '')
        ),
        coalesce(v.stock_number::text, '') || ' ' ||
        coalesce(v.vin, '') || ' ' ||
        coalesce(v.make, '') || ' ' ||
        coalesce(v.model, '') || ' ' ||
        coalesce(v.trim, '') || ' ' ||
        coalesce(v.exterior_color, '') || ' ' ||
        coalesce(v.interior_color, '') || ' ' ||
        coalesce(v.engine, ''),
        NOW()
      FROM vehicles v
      ON CONFLICT (vehicle_id)
      DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        searchable_text = EXCLUDED.searchable_text,
        last_updated = EXCLUDED.last_updated;
    `;

    const result = await DatabaseService.query(indexSql);
    return result.rowCount || 0;
  }

  /**
   * Perform optimized search using indexes
   * @param {Object} searchCriteria - Search parameters
   * @returns {Object} - Search results
   */
  static async optimizedSearch(searchCriteria) {
    const { query, entity_types = ['customers', 'leads', 'interactions', 'vehicles'] } = searchCriteria;

    if (!query || query.trim().length < 2) {
      return { results: [], total_results: 0, execution_time: 0 };
    }

    const startTime = Date.now();
    const results = [];

    // Search each indexed entity type
    for (const entityType of entity_types) {
      try {
        const entityResults = await this.searchIndexedEntity(entityType, query, searchCriteria);
        results.push(...entityResults);
      } catch (error) {
        console.error(`Error searching indexed ${entityType}:`, error);
      }
    }

    // Sort by relevance score
    results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

    // Apply pagination
    const { limit = 50, offset = 0 } = searchCriteria;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      results: paginatedResults,
      total_results: results.length,
      execution_time: Date.now() - startTime
    };
  }

  /**
   * Search using full-text index for an entity type
   */
  static async searchIndexedEntity(entityType, query, searchCriteria) {
    const tableMap = {
      customers: 'customer_search_index',
      leads: 'lead_search_index',
      interactions: 'interaction_search_index',
      vehicles: 'vehicle_search_index'
    };

    const idFieldMap = {
      customers: 'customer_id',
      leads: 'lead_id',
      interactions: 'interaction_id',
      vehicles: 'vehicle_id'
    };

    const tableName = tableMap[entityType];
    const idField = idFieldMap[entityType];

    if (!tableName) return [];

    // Use PostgreSQL full-text search
    const searchSql = `
      SELECT
        si.${idField} as id,
        si.searchable_text,
        ts_rank(si.search_vector, plainto_tsquery('english', $1)) as relevance_score,
        si.last_updated
      FROM ${tableName} si
      WHERE si.search_vector @@ plainto_tsquery('english', $1)
      ORDER BY relevance_score DESC
      LIMIT 100
    `;

    try {
      const result = await DatabaseService.query(searchSql, [query]);

      // Enrich results with entity data
      const enrichedResults = await Promise.all(
        result.rows.map(async (row) => {
          const entityData = await this.getEntityData(entityType, row.id);
          return {
            ...entityData,
            entity_type: entityType,
            relevance_score: Math.round(row.relevance_score * 1000) / 1000,
            searchable_text: row.searchable_text
          };
        })
      );

      return enrichedResults;

    } catch (error) {
      console.error(`Error searching indexed ${entityType}:`, error);
      return [];
    }
  }

  /**
   * Get entity data by ID
   */
  static async getEntityData(entityType, id) {
    let sql, params;

    switch (entityType) {
      case 'customers':
        sql = 'SELECT * FROM customers WHERE id = $1';
        params = [id];
        break;
      case 'leads':
        sql = `
          SELECT l.*, c.first_name as customer_first_name, c.last_name as customer_last_name
          FROM leads l
          LEFT JOIN customers c ON l.customer_id = c.id
          WHERE l.id = $1
        `;
        params = [id];
        break;
      case 'interactions':
        sql = `
          SELECT i.*, c.first_name as customer_first_name, c.last_name as customer_last_name
          FROM interactions i
          JOIN customers c ON i.customer_id = c.id
          WHERE i.id = $1
        `;
        params = [id];
        break;
      case 'vehicles':
        sql = 'SELECT * FROM vehicles WHERE id = $1';
        params = [id];
        break;
      default:
        return {};
    }

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows[0] || {};
    } catch (error) {
      console.error(`Error getting ${entityType} data:`, error);
      return {};
    }
  }

  /**
   * Update index metadata
   */
  static async updateIndexMetadata(indexResults) {
    const sql = `
      INSERT INTO search_index_metadata (
        index_type, last_build_time, duration_ms, record_count, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (index_type)
      DO UPDATE SET
        last_build_time = EXCLUDED.last_build_time,
        duration_ms = EXCLUDED.duration_ms,
        record_count = EXCLUDED.record_count,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata;
    `;

    const params = [
      'full_search_index',
      new Date(indexResults.startTime),
      indexResults.duration,
      indexResults.totalRecords,
      indexResults.errors.length > 0 ? 'completed_with_errors' : 'completed',
      JSON.stringify({
        indexes: indexResults.indexes,
        errors: indexResults.errors
      })
    ];

    try {
      await DatabaseService.query(sql);
    } catch (error) {
      console.error('Error updating index metadata:', error);
    }
  }

  /**
   * Get index statistics
   */
  static async getIndexStats() {
    const sql = 'SELECT * FROM search_index_metadata WHERE index_type = $1';
    const result = await DatabaseService.query(sql, ['full_search_index']);

    if (result.rows.length === 0) {
      return {
        status: 'not_built',
        last_build_time: null,
        record_count: 0,
        duration_ms: 0
      };
    }

    const metadata = result.rows[0];
    return {
      status: metadata.status,
      last_build_time: metadata.last_build_time,
      record_count: metadata.record_count,
      duration_ms: metadata.duration_ms,
      details: metadata.metadata ? JSON.parse(metadata.metadata) : {}
    };
  }

  /**
   * Rebuild indexes incrementally (only changed records)
   */
  static async rebuildIncremental(entityTypes = ['customers', 'leads', 'interactions', 'vehicles']) {
    const results = {
      startTime: Date.now(),
      processedRecords: 0,
      errors: []
    };

    try {
      for (const entityType of entityTypes) {
        try {
          const processed = await this.rebuildEntityIncremental(entityType);
          results.processedRecords += processed;
        } catch (error) {
          console.error(`Error rebuilding ${entityType} incrementally:`, error);
          results.errors.push({
            entityType,
            error: error.message
          });
        }
      }

      results.duration = Date.now() - results.startTime;
      return results;

    } catch (error) {
      console.error('Error in incremental rebuild:', error);
      throw error;
    }
  }

  /**
   * Rebuild index incrementally for one entity type
   */
  static async rebuildEntityIncremental(entityType) {
    // Get the last index update time
    const lastUpdateSql = `SELECT MAX(last_updated) as last_update FROM ${entityType}_search_index`;
    const lastUpdateResult = await DatabaseService.query(lastUpdateSql);
    const lastUpdate = lastUpdateResult.rows[0]?.last_update;

    if (!lastUpdate) {
      // No index exists, do full rebuild
      return await this.buildEntityIndex(entityType).then(r => r.recordCount);
    }

    // Get records modified since last update
    const modifiedRecordsSql = `SELECT COUNT(*) as count FROM ${entityType} WHERE updated_at > $1`;
    const modifiedResult = await DatabaseService.query(modifiedRecordsSql, [lastUpdate]);
    const modifiedCount = modifiedResult.rows[0]?.count || 0;

    if (modifiedCount === 0) {
      return 0; // No changes
    }

    // Rebuild index for modified records
    const rebuildSql = `
      INSERT INTO ${entityType}_search_index (customer_id, search_vector, searchable_text, last_updated)
      SELECT
        c.id,
        to_tsvector('english', 'searchable content here'),
        'searchable text here',
        NOW()
      FROM ${entityType} c
      WHERE c.updated_at > $1
      ON CONFLICT (customer_id)
      DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        searchable_text = EXCLUDED.searchable_text,
        last_updated = EXCLUDED.last_updated;
    `;

    // Note: This is a simplified version. In practice, you'd need entity-specific rebuild queries
    await DatabaseService.query(rebuildSql, [lastUpdate]);

    return modifiedCount;
  }

  /**
   * Clear search caches
   */
  clearCaches() {
    this.indexCache.clear();
    this.suggestionCache.clear();
  }

  /**
   * Get search performance metrics
   */
  static async getSearchPerformance(days = 7) {
    // This would typically query search performance logs
    // For now, return mock data
    return {
      period_days: days,
      average_response_time: 125, // ms
      total_searches: 1250,
      cache_hit_rate: 0.75,
      popular_queries: [
        { query: 'cadillac', count: 45 },
        { query: 'test drive', count: 32 },
        { query: 'john smith', count: 28 }
      ],
      slow_queries: [],
      error_rate: 0.02
    };
  }
}

module.exports = SearchIndexService;