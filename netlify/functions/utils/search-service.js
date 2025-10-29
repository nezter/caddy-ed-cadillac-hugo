/**
 * Advanced Search Service
 * Comprehensive search across all CRM entities with faceted filtering and relevance scoring
 */

const DatabaseService = require('./database-service');
const SearchIndexService = require('./search-index-service');

class SearchService {
  /**
   * Perform comprehensive search across all entities
   * @param {Object} searchCriteria - Search parameters
   * @returns {Object} - Search results with facets and ranking
   */
  static async comprehensiveSearch(searchCriteria) {
    try {
      const {
        query = '',
        entity_types = ['customers', 'leads', 'interactions', 'vehicles'],
        filters = {},
        sort_by = 'relevance',
        sort_order = 'desc',
        limit = 50,
        offset = 0,
        include_facets = true,
        use_indexes = true
      } = searchCriteria;

      const results = {
        query,
        total_results: 0,
        results: [],
        facets: {},
        execution_time: 0,
        used_indexes: false
      };

      const startTime = Date.now();

      // Try optimized search with indexes first (if enabled and query is substantial)
      if (use_indexes && query && query.trim().length >= 2) {
        try {
          const indexResults = await SearchIndexService.optimizedSearch(searchCriteria);
          if (indexResults.results && indexResults.results.length > 0) {
            results.results = indexResults.results;
            results.total_results = indexResults.total_results;
            results.execution_time = indexResults.execution_time;
            results.used_indexes = true;

            // Generate facets for indexed results
            if (include_facets) {
              results.facets = await this.generateFacets(results.results, entity_types, filters);
            }

            return results;
          }
        } catch (indexError) {
          console.warn('Index search failed, falling back to standard search:', indexError.message);
        }
      }

      // Search each entity type
      const searchPromises = entity_types.map(entityType =>
        this.searchEntity(entityType, query, filters, limit, offset)
      );

      const entityResults = await Promise.all(searchPromises);

      // Combine and rank results
      const allResults = [];
      entityResults.forEach((entityResult, index) => {
        const entityType = entity_types[index];
        entityResult.results.forEach(result => {
          allResults.push({
            ...result,
            entity_type: entityType,
            relevance_score: this.calculateRelevanceScore(result, query, entityType)
          });
        });
      });

      // Sort by relevance or specified field
      if (sort_by === 'relevance') {
        allResults.sort((a, b) => b.relevance_score - a.relevance_score);
      } else {
        allResults.sort((a, b) => {
          const aVal = a[sort_by];
          const bVal = b[sort_by];
          const order = sort_order === 'desc' ? -1 : 1;

          if (aVal < bVal) return -1 * order;
          if (aVal > bVal) return 1 * order;
          return 0;
        });
      }

      // Apply pagination
      const paginatedResults = allResults.slice(offset, offset + limit);

      // Generate facets if requested
      if (include_facets) {
        results.facets = await this.generateFacets(allResults, entity_types, filters);
      }

      results.results = paginatedResults;
      results.total_results = allResults.length;
      results.execution_time = Date.now() - startTime;

      return results;

    } catch (error) {
      console.error('Error performing comprehensive search:', error);
      throw error;
    }
  }

  /**
   * Search within a specific entity type
   * @param {string} entityType - Type of entity to search
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @param {number} limit - Result limit
   * @param {number} offset - Result offset
   * @returns {Object} - Entity-specific search results
   */
  static async searchEntity(entityType, query, filters = {}, limit = 50, offset = 0) {
    try {
      switch (entityType) {
        case 'customers':
          return await this.searchCustomers(query, filters, limit, offset);
        case 'leads':
          return await this.searchLeads(query, filters, limit, offset);
        case 'interactions':
          return await this.searchInteractions(query, filters, limit, offset);
        case 'vehicles':
          return await this.searchVehicles(query, filters, limit, offset);
        case 'appointments':
          return await this.searchAppointments(query, filters, limit, offset);
        default:
          return { results: [], total: 0 };
      }
    } catch (error) {
      console.error(`Error searching ${entityType}:`, error);
      return { results: [], total: 0 };
    }
  }

  /**
   * Search customers with advanced filtering
   */
  static async searchCustomers(query, filters, limit, offset) {
    let sql = `
      SELECT
        c.*,
        COUNT(DISTINCT l.id) as lead_count,
        COUNT(DISTINCT i.id) as interaction_count,
        MAX(i.created_at) as last_interaction_date,
        MAX(l.created_at) as last_lead_date
      FROM customers c
      LEFT JOIN leads l ON c.id = l.customer_id
      LEFT JOIN interactions i ON c.id = i.customer_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Add search query
    if (query) {
      sql += ` AND (
        c.first_name ILIKE $${paramIndex} OR
        c.last_name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.phone ILIKE $${paramIndex} OR
        c.address_line1 ILIKE $${paramIndex} OR
        c.city ILIKE $${paramIndex} OR
        c.state ILIKE $${paramIndex} OR
        c.vehicle_interest ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Add filters
    sql += this.buildFilterConditions(filters, params, paramIndex);

    sql += `
      GROUP BY c.id
      ORDER BY
        CASE WHEN c.customer_type = 'active' THEN 1
             WHEN c.customer_type = 'prospect' THEN 2
             ELSE 3 END,
        c.last_activity_date DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await DatabaseService.query(sql, params);
    return {
      results: result.rows,
      total: result.rows.length // Note: This is approximate for pagination
    };
  }

  /**
   * Search leads with advanced filtering
   */
  static async searchLeads(query, filters, limit, offset) {
    let sql = `
      SELECT
        l.*,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        sr.first_name as sales_rep_first_name,
        sr.last_name as sales_rep_last_name,
        COUNT(i.id) as interaction_count,
        MAX(i.created_at) as last_interaction_date
      FROM leads l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN sales_reps sr ON l.assigned_sales_rep_id = sr.id
      LEFT JOIN interactions i ON l.id = i.lead_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Add search query
    if (query) {
      sql += ` AND (
        l.first_name ILIKE $${paramIndex} OR
        l.last_name ILIKE $${paramIndex} OR
        l.email ILIKE $${paramIndex} OR
        l.phone ILIKE $${paramIndex} OR
        l.message ILIKE $${paramIndex} OR
        l.vehicle_interest ILIKE $${paramIndex} OR
        c.first_name ILIKE $${paramIndex} OR
        c.last_name ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Add filters
    sql += this.buildFilterConditions(filters, params, paramIndex);

    sql += `
      GROUP BY l.id, c.first_name, c.last_name, c.email, sr.first_name, sr.last_name
      ORDER BY l.score DESC, l.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await DatabaseService.query(sql, params);
    return {
      results: result.rows,
      total: result.rows.length
    };
  }

  /**
   * Search interactions with advanced filtering
   */
  static async searchInteractions(query, filters, limit, offset) {
    let sql = `
      SELECT
        i.*,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        sr.first_name as sales_rep_first_name,
        sr.last_name as sales_rep_last_name
      FROM interactions i
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN sales_reps sr ON i.sales_rep_id = sr.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Add search query
    if (query) {
      sql += ` AND (
        i.subject ILIKE $${paramIndex} OR
        i.content ILIKE $${paramIndex} OR
        i.summary ILIKE $${paramIndex} OR
        c.first_name ILIKE $${paramIndex} OR
        c.last_name ILIKE $${paramIndex} OR
        sr.first_name ILIKE $${paramIndex} OR
        sr.last_name ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Add filters
    sql += this.buildFilterConditions(filters, params, paramIndex);

    sql += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await DatabaseService.query(sql, params);
    return {
      results: result.rows,
      total: result.rows.length
    };
  }

  /**
   * Search vehicles with advanced filtering
   */
  static async searchVehicles(query, filters, limit, offset) {
    let sql = `
      SELECT v.*,
             COUNT(DISTINCT i.id) as inquiry_count,
             MAX(i.created_at) as last_inquiry_date
      FROM vehicles v
      LEFT JOIN interactions i ON i.metadata->>'vehicle_id' = v.stock_number
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Add search query
    if (query) {
      sql += ` AND (
        v.stock_number ILIKE $${paramIndex} OR
        v.vin ILIKE $${paramIndex} OR
        v.make ILIKE $${paramIndex} OR
        v.model ILIKE $${paramIndex} OR
        v.trim ILIKE $${paramIndex} OR
        v.exterior_color ILIKE $${paramIndex} OR
        v.interior_color ILIKE $${paramIndex} OR
        v.engine ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Add filters
    sql += this.buildFilterConditions(filters, params, paramIndex);

    sql += `
      GROUP BY v.id
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await DatabaseService.query(sql, params);
    return {
      results: result.rows,
      total: result.rows.length
    };
  }

  /**
   * Search appointments with advanced filtering
   */
  static async searchAppointments(query, filters, limit, offset) {
    let sql = `
      SELECT
        a.*,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.email as customer_email,
        sr.first_name as sales_rep_first_name,
        sr.last_name as sales_rep_last_name
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      LEFT JOIN sales_reps sr ON a.assigned_sales_rep_id = sr.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Add search query
    if (query) {
      sql += ` AND (
        a.title ILIKE $${paramIndex} OR
        a.description ILIKE $${paramIndex} OR
        c.first_name ILIKE $${paramIndex} OR
        c.last_name ILIKE $${paramIndex} OR
        sr.first_name ILIKE $${paramIndex} OR
        sr.last_name ILIKE $${paramIndex}
      )`;
      params.push(`%${query}%`);
      paramIndex++;
    }

    // Add filters
    sql += this.buildFilterConditions(filters, params, paramIndex);

    sql += ` ORDER BY a.scheduled_start DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await DatabaseService.query(sql, params);
    return {
      results: result.rows,
      total: result.rows.length
    };
  }

  /**
   * Build filter conditions for SQL queries
   */
  static buildFilterConditions(filters, params, startIndex) {
    let sql = '';
    let paramIndex = startIndex;

    // Date range filters
    if (filters.date_from) {
      sql += ` AND created_at >= $${paramIndex}`;
      params.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      sql += ` AND created_at <= $${paramIndex}`;
      params.push(filters.date_to);
      paramIndex++;
    }

    // Status filters
    if (filters.status && Array.isArray(filters.status)) {
      sql += ` AND status = ANY($${paramIndex})`;
      params.push(filters.status);
      paramIndex++;
    } else if (filters.status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    // Customer type filters
    if (filters.customer_type) {
      sql += ` AND customer_type = $${paramIndex}`;
      params.push(filters.customer_type);
      paramIndex++;
    }

    // Sales rep filters
    if (filters.sales_rep_id) {
      sql += ` AND assigned_sales_rep_id = $${paramIndex}`;
      params.push(filters.sales_rep_id);
      paramIndex++;
    }

    // Lead source filters
    if (filters.lead_source) {
      sql += ` AND lead_source = $${paramIndex}`;
      params.push(filters.lead_source);
      paramIndex++;
    }

    // Vehicle filters
    if (filters.make) {
      sql += ` AND make ILIKE $${paramIndex}`;
      params.push(`%${filters.make}%`);
      paramIndex++;
    }

    if (filters.model) {
      sql += ` AND model ILIKE $${paramIndex}`;
      params.push(`%${filters.model}%`);
      paramIndex++;
    }

    if (filters.year) {
      sql += ` AND year = $${paramIndex}`;
      params.push(filters.year);
      paramIndex++;
    }

    // Price range filters
    if (filters.min_price) {
      sql += ` AND list_price >= $${paramIndex}`;
      params.push(filters.min_price);
      paramIndex++;
    }

    if (filters.max_price) {
      sql += ` AND list_price <= $${paramIndex}`;
      params.push(filters.max_price);
      paramIndex++;
    }

    // Interaction type filters
    if (filters.interaction_type) {
      sql += ` AND interaction_type = $${paramIndex}`;
      params.push(filters.interaction_type);
      paramIndex++;
    }

    return sql;
  }

  /**
   * Calculate relevance score for search results
   */
  static calculateRelevanceScore(result, query, entityType) {
    if (!query) return 0;

    const queryLower = query.toLowerCase();
    let score = 0;

    // Base score by entity type (customers and leads are more important)
    const entityWeights = {
      customers: 10,
      leads: 8,
      interactions: 5,
      vehicles: 3,
      appointments: 6
    };
    score += entityWeights[entityType] || 1;

    // Exact matches get higher scores
    const searchableFields = this.getSearchableFields(entityType);
    searchableFields.forEach(field => {
      const value = result[field]?.toString().toLowerCase() || '';

      if (value === queryLower) {
        score += 20; // Exact match
      } else if (value.startsWith(queryLower)) {
        score += 15; // Starts with query
      } else if (value.includes(queryLower)) {
        score += 10; // Contains query
      }

      // Word boundary matches
      const words = queryLower.split(/\s+/);
      words.forEach(word => {
        if (value.includes(word)) {
          score += 5;
        }
      });
    });

    // Recency bonus (newer items get slight boost)
    if (result.created_at) {
      const daysSinceCreation = (Date.now() - new Date(result.created_at).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 10 - daysSinceCreation / 30); // Bonus for items created within last 30 days
    }

    // Status-based scoring
    if (result.status === 'active' || result.status === 'new') {
      score += 5;
    }

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get searchable fields for an entity type
   */
  static getSearchableFields(entityType) {
    const fieldMap = {
      customers: ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'vehicle_interest'],
      leads: ['first_name', 'last_name', 'email', 'phone', 'message', 'vehicle_interest'],
      interactions: ['subject', 'content', 'summary'],
      vehicles: ['stock_number', 'vin', 'make', 'model', 'trim', 'exterior_color', 'interior_color', 'engine'],
      appointments: ['title', 'description']
    };

    return fieldMap[entityType] || [];
  }

  /**
   * Generate facets for search results
   */
  static async generateFacets(results, entityTypes, appliedFilters) {
    const facets = {};

    // Entity type distribution
    facets.entity_types = {};
    results.forEach(result => {
      facets.entity_types[result.entity_type] = (facets.entity_types[result.entity_type] || 0) + 1;
    });

    // Status facets
    facets.status = {};
    results.forEach(result => {
      if (result.status) {
        facets.status[result.status] = (facets.status[result.status] || 0) + 1;
      }
    });

    // Customer type facets
    facets.customer_types = {};
    results.forEach(result => {
      if (result.customer_type) {
        facets.customer_types[result.customer_type] = (facets.customer_types[result.customer_type] || 0) + 1;
      }
    });

    // Date range facets
    facets.date_ranges = {
      today: results.filter(r => this.isToday(r.created_at)).length,
      this_week: results.filter(r => this.isThisWeek(r.created_at)).length,
      this_month: results.filter(r => this.isThisMonth(r.created_at)).length,
      last_30_days: results.filter(r => this.isLast30Days(r.created_at)).length
    };

    // Sales rep facets
    facets.sales_reps = {};
    results.forEach(result => {
      const repName = result.sales_rep_first_name && result.sales_rep_last_name
        ? `${result.sales_rep_first_name} ${result.sales_rep_last_name}`
        : result.assigned_sales_rep_id || 'Unassigned';
      if (repName) {
        facets.sales_reps[repName] = (facets.sales_reps[repName] || 0) + 1;
      }
    });

    // Lead source facets
    facets.lead_sources = {};
    results.forEach(result => {
      if (result.lead_source || result.source) {
        const source = result.lead_source || result.source;
        facets.lead_sources[source] = (facets.lead_sources[source] || 0) + 1;
      }
    });

    // Vehicle make/model facets
    facets.vehicle_makes = {};
    facets.vehicle_models = {};
    results.forEach(result => {
      if (result.make) {
        facets.vehicle_makes[result.make] = (facets.vehicle_makes[result.make] || 0) + 1;
      }
      if (result.model) {
        facets.vehicle_models[result.model] = (facets.vehicle_models[result.model] || 0) + 1;
      }
    });

    return facets;
  }

  /**
   * Date utility functions for facets
   */
  static isToday(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  static isThisWeek(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    return date >= startOfWeek;
  }

  static isThisMonth(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  static isLast30Days(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return date >= thirtyDaysAgo;
  }

  /**
   * Save a search query for later use
   */
  static async saveSearch(userId, searchData) {
    const sql = `
      INSERT INTO saved_searches (user_id, name, query, filters, entity_types, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const params = [
      userId,
      searchData.name,
      searchData.query,
      JSON.stringify(searchData.filters || {}),
      searchData.entity_types || ['customers', 'leads'],
      'system'
    ];

    try {
      const result = await DatabaseService.query(sql, params);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving search:', error);
      throw error;
    }
  }

  /**
   * Get saved searches for a user
   */
  static async getSavedSearches(userId) {
    const sql = 'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC';

    try {
      const result = await DatabaseService.query(sql, [userId]);
      return result.rows.map(row => ({
        ...row,
        filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters
      }));
    } catch (error) {
      console.error('Error getting saved searches:', error);
      return [];
    }
  }

  /**
   * Delete a saved search
   */
  static async deleteSavedSearch(searchId, userId) {
    const sql = 'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING *';

    try {
      const result = await DatabaseService.query(sql, [searchId, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting saved search:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions based on partial query
   */
  static async getSearchSuggestions(partialQuery, limit = 10) {
    if (!partialQuery || partialQuery.length < 2) {
      return [];
    }

    const sql = `
      SELECT DISTINCT term, entity_type, COUNT(*) as frequency
      FROM (
        SELECT unnest(string_to_array(lower(first_name || ' ' || last_name), ' ')) as term, 'customer' as entity_type FROM customers WHERE first_name ILIKE $1 OR last_name ILIKE $1
        UNION ALL
        SELECT unnest(string_to_array(lower(email), ' ')) as term, 'customer' as entity_type FROM customers WHERE email ILIKE $1
        UNION ALL
        SELECT unnest(string_to_array(lower(make || ' ' || model), ' ')) as term, 'vehicle' as entity_type FROM vehicles WHERE make ILIKE $1 OR model ILIKE $1
        UNION ALL
        SELECT unnest(string_to_array(lower(subject), ' ')) as term, 'interaction' as entity_type FROM interactions WHERE subject ILIKE $1
      ) suggestions
      WHERE length(term) >= 3
      GROUP BY term, entity_type
      ORDER BY frequency DESC, term
      LIMIT $2
    `;

    try {
      const result = await DatabaseService.query(sql, [`%${partialQuery}%`, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      return [];
    }
  }
}

module.exports = SearchService;