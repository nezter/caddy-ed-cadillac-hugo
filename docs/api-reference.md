# API Reference - Cadillac Dealership System

## 🔐 Authentication

All API endpoints require authentication except for lead submission and public inventory access.

### Authentication Methods

#### JWT Token Authentication
```javascript
// Include in request headers
headers: {
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

#### Cookie Authentication
```javascript
// Token stored in httpOnly cookie
// Automatically included by browser
```

### Login Endpoint

**POST** `/api/sales/login`

Authenticate a sales representative and receive a JWT token.

#### Request Body
```json
{
  "email": "john.smith@cadillacofsouthcharlotte.com",
  "password": "secure_password"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "sales_rep_1",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john.smith@cadillacofsouthcharlotte.com",
      "role": "sales_representative",
      "permissions": ["view_customers", "manage_leads", "schedule_appointments"]
    },
    "expiresIn": "8h"
  },
  "message": "Login successful"
}
```

#### Error Responses
```json
{
  "success": false,
  "error": "Invalid email or password",
  "code": "AUTH_INVALID_CREDENTIALS"
}
```

### Authentication Check

**GET** `/api/sales/auth-check`

Verify if the current user is authenticated.

#### Response
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "user": {
      "id": "sales_rep_1",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john.smith@cadillacofsouthcharlotte.com",
      "role": "sales_representative",
      "permissions": ["view_customers", "manage_leads"]
    }
  }
}
```

### Logout

**POST** `/api/sales/logout`

Invalidate the current session.

#### Response
```json
{
  "success": true,
  "data": {
    "loggedOut": true,
    "message": "Successfully logged out"
  }
}
```

## 👥 Customer Management

### List Customers

**GET** `/api/sales/customers`

Retrieve a paginated list of customers with optional filtering.

#### Query Parameters
- `search` (string): Search term for name, email, or phone
- `type` (string): Customer type filter (`prospect`, `lead`, `active`, `inactive`, `vip`)
- `status` (string): Status filter (`active`, `inactive`, `archived`)
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `sortBy` (string): Sort field (default: `last_activity_date`)
- `sortOrder` (string): Sort order (`asc`, `desc`)

#### Example Request
```
GET /api/sales/customers?search=john&page=1&limit=10&sortBy=last_activity_date&sortOrder=desc
```

#### Response
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "cust_123",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@email.com",
        "phone": "(555) 123-4567",
        "customerType": "active",
        "status": "active",
        "source": "website",
        "assignedSalesRepName": "Jane Smith",
        "lastActivityDate": "2024-01-15T10:30:00Z",
        "leadCount": 2,
        "appointmentCount": 1,
        "openTaskCount": 0
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

### Create Customer

**POST** `/api/sales/customers`

Create a new customer record.

#### Request Body
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@email.com",
  "phone": "(555) 123-4567",
  "addressLine1": "123 Main St",
  "city": "Charlotte",
  "state": "NC",
  "zipCode": "28202",
  "type": "prospect",
  "source": "website",
  "vehicleInterest": "2024 Cadillac Escalade",
  "preferredContactMethod": "email",
  "emailConsent": true,
  "smsConsent": false,
  "phoneConsent": true
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": "cust_123",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@email.com",
    "customerType": "prospect",
    "status": "active",
    "createdAt": "2024-01-15T14:30:00Z"
  },
  "message": "Customer created successfully"
}
```

### Update Customer

**PUT** `/api/sales/customers?id=cust_123`

Update an existing customer record.

#### Request Body
```json
{
  "firstName": "Johnny",
  "email": "johnny.doe@email.com",
  "status": "active",
  "vehicleInterest": "2024 Cadillac XT5",
  "preferredContactMethod": "phone"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": "cust_123",
    "firstName": "Johnny",
    "lastName": "Doe",
    "email": "johnny.doe@email.com",
    "status": "active",
    "updatedAt": "2024-01-15T15:45:00Z"
  },
  "message": "Customer updated successfully"
}
```

### Delete Customer

**DELETE** `/api/sales/customers?id=cust_123`

Soft delete a customer record (marks as archived).

#### Response
```json
{
  "success": true,
  "data": {
    "id": "cust_123",
    "deleted": true,
    "deletedAt": "2024-01-15T16:00:00Z",
    "deletedBy": "sales_rep_1"
  },
  "message": "Customer deleted successfully"
}
```

## 📝 Lead Management

### Submit Lead

**POST** `/api/leads`

Process a new lead submission from the website.

#### Request Body
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@email.com",
  "phone": "(555) 987-6543",
  "message": "I'm interested in the 2024 Cadillac Escalade",
  "formType": "general",
  "pageUrl": "https://caddyed.com/inventory/2024-cadillac-escalade",
  "vehicleInterest": "2024 Cadillac Escalade",
  "vehicleYear": 2024,
  "vehicleMake": "Cadillac",
  "vehicleModel": "Escalade",
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "luxury-suvs"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "leadId": "lead_456",
    "customerId": null,
    "status": "new",
    "priority": "high",
    "score": 85,
    "assignedSalesRepName": "John Smith",
    "nextFollowUpDate": "2024-01-16T10:00:00Z",
    "isDuplicate": false
  },
  "message": "Lead submitted successfully"
}
```

### Check Lead Duplicates

**POST** `/api/leads/duplicates`

Check if a lead might be a duplicate before submission.

#### Request Body
```json
{
  "email": "jane.smith@email.com",
  "phone": "(555) 987-6543",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "isDuplicate": true,
    "confidence": 0.95,
    "duplicates": [
      {
        "id": "lead_123",
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith@email.com",
        "status": "contacted",
        "createdAt": "2024-01-10T09:15:00Z"
      }
    ]
  }
}
```

## 🚗 Inventory Management

### Get Inventory

**GET** `/api/inventory`

Retrieve current vehicle inventory with optional filtering.

#### Query Parameters
- `make` (string): Filter by make (e.g., "Cadillac")
- `model` (string): Filter by model
- `year` (number): Filter by year
- `priceMin` (number): Minimum price filter
- `priceMax` (number): Maximum price filter
- `limit` (number): Number of results (default: 50, max: 200)

#### Example Request
```
GET /api/inventory?make=Cadillac&priceMax=80000&limit=20
```

#### Response
```json
{
  "success": true,
  "data": {
    "vehicles": [
      {
        "stockNumber": "C12345",
        "vin": "1GYS4BKJ7FR123456",
        "year": 2024,
        "make": "Cadillac",
        "model": "Escalade",
        "trim": "Premium Luxury",
        "price": 65000,
        "mileage": 0,
        "exteriorColor": "Black",
        "interiorColor": "Jet Black",
        "engine": "6.2L V8",
        "transmission": "10-Speed Automatic",
        "drivetrain": "4WD",
        "fuelType": "Gasoline",
        "images": [
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg"
        ],
        "features": [
          "Navigation System",
          "Leather Seats",
          "Sunroof"
        ]
      }
    ],
    "total": 25,
    "lastUpdated": "2024-01-15T12:00:00Z"
  }
}
```

### Sync Inventory

**POST** `/api/inventory/sync`

Trigger a manual inventory synchronization from the dealership API.

#### Response
```json
{
  "success": true,
  "data": {
    "syncId": "sync_789",
    "status": "started",
    "message": "Inventory sync initiated",
    "estimatedDuration": "5-10 minutes"
  }
}
```

## 📊 Analytics & Reporting

### Get Sales Dashboard

**GET** `/api/sales/dashboard`

Retrieve sales performance metrics and KPIs.

#### Query Parameters
- `period` (string): Time period (`today`, `week`, `month`, `quarter`, `year`)
- `salesRepId` (string): Filter by specific sales rep

#### Response
```json
{
  "success": true,
  "data": {
    "period": "month",
    "metrics": {
      "totalLeads": 145,
      "convertedLeads": 23,
      "conversionRate": 15.9,
      "totalSales": 2850000,
      "averageDealSize": 124000,
      "customerSatisfaction": 4.7,
      "responseTime": "2.3 hours",
      "appointmentsCompleted": 67
    },
    "trends": {
      "leadsTrend": 12.5,
      "salesTrend": 8.3,
      "conversionTrend": 3.1
    },
    "topPerformers": [
      {
        "salesRepName": "John Smith",
        "leadsGenerated": 45,
        "salesClosed": 8,
        "revenue": 920000
      }
    ]
  }
}
```

## 📞 Appointment Management

### Schedule Appointment

**POST** `/api/appointments`

Create a new appointment.

#### Request Body
```json
{
  "customerId": "cust_123",
  "appointmentType": "test_drive",
  "title": "Test Drive - 2024 Cadillac Escalade",
  "description": "Customer wants to test drive the Premium Luxury model",
  "scheduledStart": "2024-01-20T14:00:00Z",
  "scheduledEnd": "2024-01-20T15:30:00Z",
  "vehicleOfInterest": "2024 Cadillac Escalade Premium Luxury",
  "location": "Cadillac of South Charlotte",
  "reminderSent": false
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": "appt_789",
    "customerId": "cust_123",
    "appointmentType": "test_drive",
    "scheduledStart": "2024-01-20T14:00:00Z",
    "scheduledEnd": "2024-01-20T15:30:00Z",
    "status": "scheduled",
    "confirmationStatus": "pending"
  },
  "message": "Appointment scheduled successfully"
}
```

## ⚙️ Error Handling

All API endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_ERROR_CODE",
  "details": {
    "field": "specific_field_name",
    "reason": "detailed explanation"
  }
}
```

### Common Error Codes

- `AUTH_REQUIRED`: Authentication required
- `AUTH_INVALID_TOKEN`: Invalid or expired token
- `AUTH_INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `VALIDATION_ERROR`: Invalid request data
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `DUPLICATE_ENTRY`: Resource already exists
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

### HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (duplicate data)
- `422`: Unprocessable Entity (validation failed)
- `429`: Too Many Requests
- `500`: Internal Server Error

## 🔄 Rate Limiting

API endpoints are rate limited to prevent abuse:

- **Authenticated endpoints**: 1000 requests per hour per user
- **Lead submission**: 10 requests per hour per IP
- **Inventory endpoints**: 500 requests per hour per IP

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## 📝 Data Formats

### Date/Time Format
All dates use ISO 8601 format in UTC:
```
2024-01-15T14:30:00Z
```

### Phone Numbers
Phone numbers are stored in E.164 format:
```
+15551234567
```

### Currency
All monetary values are in USD cents (integers):
```json
{
  "price": 6500000,  // $65,000.00
  "budgetMin": 4000000,  // $40,000.00
  "budgetMax": 8000000   // $80,000.00
}
```

### Pagination
List endpoints support cursor-based pagination:
```json
{
  "data": [...],
  "pagination": {
    "hasNext": true,
    "hasPrevious": false,
    "nextCursor": "eyJpZCI6ImN1c3RfMTIzIiwicGFnZSI6Mn0=",
    "previousCursor": null
  }
}
```

This API reference provides comprehensive documentation for integrating with the Cadillac Dealership Customer Management System.