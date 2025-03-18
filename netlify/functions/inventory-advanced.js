const { query } = require('../../src/lib/database');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const limit = parseInt(params.limit) || 10;
    const offset = parseInt(params.offset) || 0;
    const sort = params.sort || 'created_at';
    const order = params.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Build dynamic filtering conditions
    let whereClause = '';
    const queryParams = [limit, offset];
    let paramIndex = 3; // Start from $3 as we already used $1 and $2

    if (params.make) {
      whereClause += `${whereClause ? ' AND ' : ' WHERE '} make = $${paramIndex++}`;
      queryParams.push(params.make);
    }

    if (params.model) {
      whereClause += `${whereClause ? ' AND ' : ' WHERE '} model = $${paramIndex++}`;
      queryParams.push(params.model);
    }

    if (params.year) {
      whereClause += `${whereClause ? ' AND ' : ' WHERE '} year = $${paramIndex++}`;
      queryParams.push(parseInt(params.year));
    }

    if (params.minPrice) {
      whereClause += `${whereClause ? ' AND ' : ' WHERE '} price >= $${paramIndex++}`;
      queryParams.push(parseInt(params.minPrice));
    }

    if (params.maxPrice) {
      whereClause += `${whereClause ? ' AND ' : ' WHERE '} price <= $${paramIndex++}`;
      queryParams.push(parseInt(params.maxPrice));
    }

    // Execute the query with advanced filtering and analytics
    const sql = `
      WITH inventory AS (
        SELECT 
          v.*,
          COUNT(*) OVER() as total_count,
          AVG(price) OVER() as avg_price
        FROM vehicles v
        ${whereClause}
        ORDER BY ${sort} ${order}
        LIMIT $1 OFFSET $2
      )
      SELECT 
        i.*,
        (SELECT json_agg(img) FROM vehicle_images img WHERE img.vehicle_id = i.id) as images,
        (SELECT json_agg(f) FROM vehicle_features f WHERE f.vehicle_id = i.id) as features
      FROM inventory i
    `;

    const result = await query(sql, queryParams);
    
    // Get the total count and average price from the first row
    const totalCount = result.rows[0]?.total_count || 0;
    const avgPrice = result.rows[0]?.avg_price || 0;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      },
      body: JSON.stringify({
        success: true,
        metadata: {
          total: parseInt(totalCount),
          count: result.rows.length,
          offset: offset,
          limit: limit,
          avgPrice: parseFloat(avgPrice)
        },
        vehicles: result.rows.map(row => ({
          ...row,
          total_count: undefined, // Remove metadata fields from individual rows
          avg_price: undefined
        }))
      })
    };
  } catch (error) {
    console.error('Database query error:', error);
    return errorHandler.serverError('Failed to fetch inventory data', error);
  }
};
