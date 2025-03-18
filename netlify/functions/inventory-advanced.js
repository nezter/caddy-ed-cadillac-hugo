const { query } = require('../../src/lib/database');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorHandler.forbiddenError('Method not allowed');
  }

  try {
    // Parse query parameters with defaults
    const params = event.queryStringParameters || {};
    const limit = parseInt(params.limit) || 12;
    const page = parseInt(params.page) || 1;
    const offset = (page - 1) * limit;
    
    // Get basic inventory data with pagination
    const sql = `
      SELECT 
        v.*,
        COUNT(*) OVER() as total_count
      FROM vehicles v
      WHERE 1=1
    `;

    // Build conditions array for filters
    let conditions = [];
    let queryParams = [limit, offset];
    let paramIndex = 3; // Start from 3 since we already have limit and offset

    // Add make filter
    if (params.make) {
      const makes = params.make.split(',');
      if (makes.length > 0) {
        conditions.push(`make IN (${makes.map((_, i) => `$${paramIndex++}`).join(',')})`);
        queryParams = [...queryParams, ...makes];
      }
    }

    // Add model filter
    if (params.model) {
      const models = params.model.split(',');
      if (models.length > 0) {
        conditions.push(`model IN (${models.map((_, i) => `$${paramIndex++}`).join(',')})`);
        queryParams = [...queryParams, ...models];
      }
    }

    // Add year range filter
    if (params.yearMin) {
      conditions.push(`year >= $${paramIndex++}`);
      queryParams.push(parseInt(params.yearMin));
    }
    if (params.yearMax) {
      conditions.push(`year <= $${paramIndex++}`);
      queryParams.push(parseInt(params.yearMax));
    }

    // Add price range filter
    if (params.priceMin) {
      conditions.push(`price >= $${paramIndex++}`);
      queryParams.push(parseInt(params.priceMin));
    }
    if (params.priceMax) {
      conditions.push(`price <= $${paramIndex++}`);
      queryParams.push(parseInt(params.priceMax));
    }

    // Add body style filter
    if (params.bodyStyle) {
      const bodyStyles = params.bodyStyle.split(',');
      if (bodyStyles.length > 0) {
        conditions.push(`body_style IN (${bodyStyles.map((_, i) => `$${paramIndex++}`).join(',')})`);
        queryParams = [...queryParams, ...bodyStyles];
      }
    }

    // Add drivetrain filter
    if (params.drivetrain) {
      const drivetrains = params.drivetrain.split(',');
      if (drivetrains.length > 0) {
        conditions.push(`drivetrain IN (${drivetrains.map((_, i) => `$${paramIndex++}`).join(',')})`);
        queryParams = [...queryParams, ...drivetrains];
      }
    }

    // Add transmission filter
    if (params.transmission) {
      const transmissions = params.transmission.split(',');
      if (transmissions.length > 0) {
        conditions.push(`transmission IN (${transmissions.map((_, i) => `$${paramIndex++}`).join(',')})`);
        queryParams = [...queryParams, ...transmissions];
      }
    }

    // Add fuel type filter
    if (params.fuelType) {
      const fuelTypes = params.fuelType.split(',');
      if (fuelTypes.length > 0) {
        conditions.push(`fuel_type IN (${fuelTypes.map((_, i) => `$${paramIndex++}`).join(',')})`);
        queryParams = [...queryParams, ...fuelTypes];
      }
    }

    // Add color filter
    if (params.color) {
      const colors = params.color.split(',');
      if (colors.length > 0) {
        conditions.push(`(${colors.map((_, i) => `exterior_color ILIKE $${paramIndex + i}`).join(' OR ')})`);
        queryParams = [...queryParams, ...colors.map(color => `%${color}%`)];
        paramIndex += colors.length;
      }
    }

    // Add search term filter
    if (params.search) {
      conditions.push(`(
        make ILIKE $${paramIndex} OR
        model ILIKE $${paramIndex} OR
        trim ILIKE $${paramIndex} OR
        description ILIKE $${paramIndex} OR
        vin ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    // Add feature filters (if any feature parameters exist)
    const featureParams = Object.keys(params)
      .filter(key => key.startsWith('feature_'))
      .map(key => key.replace('feature_', ''));
      
    if (featureParams.length > 0) {
      // Use JSON features containment with ALL features required
      conditions.push(`features @> $${paramIndex++}::jsonb`);
      queryParams.push(JSON.stringify(featureParams));
    }

    // Add conditions to SQL query
    let fullSql = sql;
    if (conditions.length > 0) {
      fullSql += ' AND ' + conditions.join(' AND ');
    }

    // Add sorting
    if (params.sort) {
      const sortParam = params.sort.toLowerCase();
      switch (sortParam) {
        case 'price-asc':
          fullSql += ' ORDER BY price ASC';
          break;
        case 'price-desc':
          fullSql += ' ORDER BY price DESC';
          break;
        case 'year-desc':
          fullSql += ' ORDER BY year DESC';
          break;
        case 'year-asc':
          fullSql += ' ORDER BY year ASC';
          break;
        case 'model-asc':
          fullSql += ' ORDER BY model ASC';
          break;
        case 'model-desc':
          fullSql += ' ORDER BY model DESC';
          break;
        case 'newest':
          fullSql += ' ORDER BY created_at DESC';
          break;
        default:
          fullSql += ' ORDER BY featured DESC, created_at DESC';
      }
    } else {
      fullSql += ' ORDER BY featured DESC, created_at DESC';
    }

    // Add pagination
    fullSql += ' LIMIT $1 OFFSET $2';

    // Log query for debugging (remove in production)
    console.log('Query:', fullSql);
    console.log('Params:', queryParams);

    // Execute query
    const result = await query(fullSql, queryParams);
    
    // Get the total count from the first row
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      },
      body: JSON.stringify({
        success: true,
        metadata: {
          total: totalCount,
          count: result.rows.length,
          page: page,
          pages: totalPages,
          limit: limit
        },
        vehicles: result.rows.map(row => {
          const { total_count, ...vehicle } = row;
          return vehicle;
        })
      })
    };
  } catch (error) {
    console.error('Database query error:', error);
    return errorHandler.serverError('Failed to fetch inventory data', error);
  }
};
