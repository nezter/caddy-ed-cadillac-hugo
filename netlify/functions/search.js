const errorHandler = require('./utils/error-handler');
const SearchService = require('./utils/search-service');
const SearchIndexService = require('./utils/search-index-service');
const DatabaseService = require('./utils/database-service');
const { authenticateRequest } = require('./utils/auth-middleware');

/**
 * Advanced Search API
 * Comprehensive search across all CRM entities with faceted filtering
 */
exports.handler = async function(event, context) {
  // Authenticate request with proper JWT validation
  const auth = await authenticateRequest(event, {
    requireAuth: true,
    allowedRoles: ['admin', 'manager', 'sales_rep'],
    requiredPermissions: ['search_read']
  });

  if (!auth.authenticated) {
    return auth.error;
  }

  try {
    const path = event.path.replace('/.netlify/functions/search', '');
    const method = event.httpMethod;

    // Parse path parameters
    const pathParts = path.split('/').filter(p => p);
    const resourceId = pathParts[0];
    const subResource = pathParts[1];

    switch (`${method} ${path}`) {
      case 'GET /':
        return await performSearch(event);
      case 'GET /suggestions':
        return await getSearchSuggestions(event);
      case 'POST /saved':
        return await saveSearch(event);
      case 'GET /saved':
        return await getSavedSearches(event);
      case `DELETE /saved/${resourceId}`:
        return await deleteSavedSearch(event, resourceId);
      case 'GET /facets':
        return await getSearchFacets(event);
      case 'GET /analytics':
        return await getSearchAnalytics(event);
      case 'POST /indexes/build':
        return await buildSearchIndexes(event);
      case 'POST /indexes/rebuild':
        return await rebuildSearchIndexes(event);
      case 'GET /indexes/stats':
        return await getIndexStats(event);
      case 'GET /performance':
        return await getSearchPerformance(event);
      default:
        return errorHandler.notFoundError('Endpoint not found');
    }

  } catch (error) {
    console.error('Search API error:', error);
    return errorHandler.serverError('Failed to process search request', error);
  }
};

/**
 * Perform comprehensive search across all entities
 */
async function performSearch(event) {
  const searchCriteria = {
    query: event.queryStringParameters?.q || '',
    entity_types: event.queryStringParameters?.entities ?
      event.queryStringParameters.entities.split(',') :
      ['customers', 'leads', 'interactions', 'vehicles'],
    sort_by: event.queryStringParameters?.sort_by || 'relevance',
    sort_order: event.queryStringParameters?.sort_order || 'desc',
    limit: parseInt(event.queryStringParameters?.limit) || 50,
    offset: parseInt(event.queryStringParameters?.offset) || 0,
    include_facets: event.queryStringParameters?.facets !== 'false'
  };

  // Parse filters from query parameters
  searchCriteria.filters = parseFiltersFromQuery(event.queryStringParameters);

  try {
    const results = await SearchService.comprehensiveSearch(searchCriteria);

    return errorHandler.createSuccessResponse({
      search_criteria: searchCriteria,
      results: results.results,
      total_results: results.total_results,
      facets: results.facets,
      execution_time_ms: results.execution_time,
      pagination: {
        limit: searchCriteria.limit,
        offset: searchCriteria.offset,
        has_more: (searchCriteria.offset + searchCriteria.limit) < results.total_results
      }
    });

  } catch (error) {
    console.error('Error performing search:', error);
    return errorHandler.serverError('Failed to perform search', error);
  }
}

/**
 * Get search suggestions for autocomplete
 */
async function getSearchSuggestions(event) {
  const partialQuery = event.queryStringParameters?.q || '';
  const limit = parseInt(event.queryStringParameters?.limit) || 10;

  try {
    const suggestions = await SearchService.getSearchSuggestions(partialQuery, limit);

    return errorHandler.createSuccessResponse({
      query: partialQuery,
      suggestions: suggestions.map(s => ({
        term: s.term,
        entity_type: s.entity_type,
        frequency: s.frequency,
        display_text: `${s.term} (${s.entity_type})`
      }))
    });

  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return errorHandler.serverError('Failed to get search suggestions', error);
  }
}

/**
 * Save a search query for later use
 */
async function saveSearch(event) {
  let searchData;
  try {
    searchData = JSON.parse(event.body);
  } catch (e) {
    return errorHandler.validationError('Invalid JSON in request body');
  }

  const { name, query, filters, entity_types } = searchData;

  if (!name || !query) {
    return errorHandler.validationError('Missing required fields', {
      name: !name ? 'Search name is required' : null,
      query: !query ? 'Search query is required' : null
    });
  }

  // In a real implementation, get user ID from authentication
  const userId = 'system'; // Placeholder

  try {
    const savedSearch = await SearchService.saveSearch(userId, {
      name,
      query,
      filters: filters || {},
      entity_types: entity_types || ['customers', 'leads']
    });

    return errorHandler.createSuccessResponse({
      message: 'Search saved successfully',
      saved_search: savedSearch
    }, 'Search saved');

  } catch (error) {
    console.error('Error saving search:', error);
    return errorHandler.serverError('Failed to save search', error);
  }
}

/**
 * Get saved searches for the current user
 */
async function getSavedSearches(event) {
  // In a real implementation, get user ID from authentication
  const userId = 'system'; // Placeholder

  try {
    const savedSearches = await SearchService.getSavedSearches(userId);

    return errorHandler.createSuccessResponse({
      saved_searches: savedSearches
    });

  } catch (error) {
    console.error('Error getting saved searches:', error);
    return errorHandler.serverError('Failed to get saved searches', error);
  }
}

/**
 * Delete a saved search
 */
async function deleteSavedSearch(event, searchId) {
  if (!searchId) {
    return errorHandler.validationError('Search ID is required');
  }

  // In a real implementation, get user ID from authentication
  const userId = 'system'; // Placeholder

  try {
    const deletedSearch = await SearchService.deleteSavedSearch(searchId, userId);

    if (!deletedSearch) {
      return errorHandler.notFoundError('Saved search not found');
    }

    return errorHandler.createSuccessResponse({
      message: 'Search deleted successfully',
      deleted_search: deletedSearch
    });

  } catch (error) {
    console.error('Error deleting saved search:', error);
    return errorHandler.serverError('Failed to delete saved search', error);
  }
}

/**
 * Get available search facets and their values
 */
async function getSearchFacets(event) {
  try {
    // Get distinct values for common facets
    const facets = {};

    // Customer types
    const customerTypesResult = await DatabaseService.query(
      "SELECT DISTINCT customer_type, COUNT(*) as count FROM customers WHERE customer_type IS NOT NULL GROUP BY customer_type ORDER BY count DESC"
    );
    facets.customer_types = customerTypesResult.rows;

    // Lead sources
    const leadSourcesResult = await DatabaseService.query(
      "SELECT DISTINCT lead_source, COUNT(*) as count FROM leads WHERE lead_source IS NOT NULL GROUP BY lead_source ORDER BY count DESC"
    );
    facets.lead_sources = leadSourcesResult.rows;

    // Interaction types
    const interactionTypesResult = await DatabaseService.query(
      "SELECT DISTINCT interaction_type, COUNT(*) as count FROM interactions GROUP BY interaction_type ORDER BY count DESC"
    );
    facets.interaction_types = interactionTypesResult.rows;

    // Vehicle makes
    const vehicleMakesResult = await DatabaseService.query(
      "SELECT DISTINCT make, COUNT(*) as count FROM vehicles WHERE make IS NOT NULL GROUP BY make ORDER BY count DESC"
    );
    facets.vehicle_makes = vehicleMakesResult.rows;

    // Sales reps
    const salesRepsResult = await DatabaseService.query(
      "SELECT id, first_name || ' ' || last_name as name, COUNT(l.id) as lead_count FROM sales_reps sr LEFT JOIN leads l ON sr.id = l.assigned_sales_rep_id GROUP BY sr.id, sr.first_name, sr.last_name ORDER BY lead_count DESC"
    );
    facets.sales_reps = salesRepsResult.rows;

    // Status values
    facets.status_options = [
      { value: 'active', label: 'Active', entity_types: ['customers', 'vehicles'] },
      { value: 'inactive', label: 'Inactive', entity_types: ['customers'] },
      { value: 'prospect', label: 'Prospect', entity_types: ['customers'] },
      { value: 'new', label: 'New', entity_types: ['leads'] },
      { value: 'qualified', label: 'Qualified', entity_types: ['leads'] },
      { value: 'converted', label: 'Converted', entity_types: ['leads'] },
      { value: 'lost', label: 'Lost', entity_types: ['leads'] },
      { value: 'available', label: 'Available', entity_types: ['vehicles'] },
      { value: 'sold', label: 'Sold', entity_types: ['vehicles'] }
    ];

    return errorHandler.createSuccessResponse({
      facets
    });

  } catch (error) {
    console.error('Error getting search facets:', error);
    return errorHandler.serverError('Failed to get search facets', error);
  }
}

/**
 * Get search analytics and usage statistics
 */
async function getSearchAnalytics(event) {
  const days = parseInt(event.queryStringParameters?.days) || 30;

  try {
    // This would typically query a search_logs table
    // For now, return mock analytics
    const analytics = {
      period_days: days,
      total_searches: 0,
      popular_queries: [],
      search_by_entity: {
        customers: 0,
        leads: 0,
        interactions: 0,
        vehicles: 0
      },
      average_results_per_search: 0,
      no_results_searches: 0,
      saved_searches_count: 0
    };

    // Try to get real analytics if search_logs table exists
    try {
      const savedSearchesResult = await DatabaseService.query(
        'SELECT COUNT(*) as count FROM saved_searches'
      );
      analytics.saved_searches_count = parseInt(savedSearchesResult.rows[0]?.count || 0);
    } catch (e) {
      // Table might not exist yet
    }

    return errorHandler.createSuccessResponse({
      analytics
    });

  } catch (error) {
    console.error('Error getting search analytics:', error);
    return errorHandler.serverError('Failed to get search analytics', error);
  }
}

/**
 * Build search indexes
 */
async function buildSearchIndexes(event) {
  const entityTypes = event.queryStringParameters?.entities ?
    event.queryStringParameters.entities.split(',') :
    ['customers', 'leads', 'interactions', 'vehicles'];

  try {
    const results = await SearchIndexService.buildIndexes(entityTypes);

    return errorHandler.createSuccessResponse({
      message: 'Search indexes built successfully',
      results: {
        duration_ms: results.duration,
        total_records: results.totalRecords,
        indexes_built: Object.keys(results.indexes),
        errors: results.errors
      }
    });

  } catch (error) {
    console.error('Error building search indexes:', error);
    return errorHandler.serverError('Failed to build search indexes', error);
  }
}

/**
 * Rebuild search indexes incrementally
 */
async function rebuildSearchIndexes(event) {
  const entityTypes = event.queryStringParameters?.entities ?
    event.queryStringParameters.entities.split(',') :
    ['customers', 'leads', 'interactions', 'vehicles'];

  try {
    const results = await SearchIndexService.rebuildIncremental(entityTypes);

    return errorHandler.createSuccessResponse({
      message: 'Search indexes rebuilt incrementally',
      results: {
        duration_ms: results.duration,
        processed_records: results.processedRecords,
        errors: results.errors
      }
    });

  } catch (error) {
    console.error('Error rebuilding search indexes:', error);
    return errorHandler.serverError('Failed to rebuild search indexes', error);
  }
}

/**
 * Get search index statistics
 */
async function getIndexStats(event) {
  try {
    const stats = await SearchIndexService.getIndexStats();

    return errorHandler.createSuccessResponse({
      index_stats: stats
    });

  } catch (error) {
    console.error('Error getting index stats:', error);
    return errorHandler.serverError('Failed to get index stats', error);
  }
}

/**
 * Get search performance metrics
 */
async function getSearchPerformance(event) {
  const days = parseInt(event.queryStringParameters?.days) || 7;

  try {
    const performance = await SearchIndexService.getSearchPerformance(days);

    return errorHandler.createSuccessResponse({
      performance
    });

  } catch (error) {
    console.error('Error getting search performance:', error);
    return errorHandler.serverError('Failed to get search performance', error);
  }
}

/**
 * Parse filters from query string parameters
 */
function parseFiltersFromQuery(queryParams) {
  const filters = {};

  // Date filters
  if (queryParams.date_from) filters.date_from = queryParams.date_from;
  if (queryParams.date_to) filters.date_to = queryParams.date_to;

  // Status filters
  if (queryParams.status) {
    filters.status = queryParams.status.includes(',') ?
      queryParams.status.split(',') : queryParams.status;
  }

  // Customer type filters
  if (queryParams.customer_type) filters.customer_type = queryParams.customer_type;

  // Sales rep filters
  if (queryParams.sales_rep_id) filters.sales_rep_id = queryParams.sales_rep_id;

  // Lead source filters
  if (queryParams.lead_source) filters.lead_source = queryParams.lead_source;

  // Vehicle filters
  if (queryParams.make) filters.make = queryParams.make;
  if (queryParams.model) filters.model = queryParams.model;
  if (queryParams.year) filters.year = parseInt(queryParams.year);

  // Price filters
  if (queryParams.min_price) filters.min_price = parseFloat(queryParams.min_price);
  if (queryParams.max_price) filters.max_price = parseFloat(queryParams.max_price);

  // Interaction filters
  if (queryParams.interaction_type) filters.interaction_type = queryParams.interaction_type;

  return filters;
}