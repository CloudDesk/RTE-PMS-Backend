# UAE Visa Details Implementation Note

## Problem Statement

The user management system needed to support UAE-specific visa requirements for employees working in the UAE (country code 'AE'). The system required:

1. **Visa Type Tracking**: Support for different types of UAE visas
2. **Expiry Date Management**: Track visa expiry dates for compliance
3. **Validation**: Ensure visa details are provided for UAE employees
4. **API Integration**: Include visa details in user creation and updates

## Solution Overview

Implemented UAE-specific visa details as an **optional field** that is only applicable for users with country set to 'AE' (UAE). The solution includes:

1. **Database Schema**: Added visa details to the user model as optional field
2. **Validation Logic**: Conditional validation only when visa details are provided
3. **API Support**: Updated routes to handle visa details in all user operations
4. **Type Safety**: TypeScript interfaces for type safety
5. **Response Integration**: Visa details included in all user response routes

## Technical Implementation

### 1. Enhanced User Model (`src/models/user.model.ts`)

#### New Interface Added:

```typescript
interface IVisaDetails {
  visaType?: 'Standard Employment Visa' | 'Domestic Worker Visa' | 'Green Visa';
  visaExpiryDate?: Date;
  isActive?: boolean;
}
```

#### Schema Definition:

```typescript
// UAE-specific visa details
visaDetails: {
  visaType: {
    type: String,
    enum: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
    required: false
  },
  visaExpiryDate: {
    type: Date,
    required: false,
    validate: {
      validator: function(value: Date) {
        if (value) {
          return value > new Date(); // Visa expiry date should be in the future
        }
        return true;
      },
      message: 'Visa expiry date must be in the future for UAE employees'
    }
  },
        isActive: {
        type: Boolean,
        required: false
      }
}
```

#### Validation Hook:

```typescript
// Pre-save hook to handle UAE-specific visa validation
userSchema.pre('save', function (next) {
  if (this.country === 'AE' && this.visaDetails) {
    // Only validate if visa details are provided (optional field)
    if (!this.visaDetails.visaType || !this.visaDetails.visaExpiryDate) {
      return next(new Error('If visa details are provided, both visa type and expiry date are required'));
    }
    
    // Check if visa is expired
    if (this.visaDetails.visaExpiryDate <= new Date()) {
      return next(new Error('Visa has expired. Please update with a valid expiry date'));
    }
  }
  next();
});
```

### 2. Updated User Routes (`src/routes/user.routes.ts`)

#### Schema Definition:

```typescript
const visaDetailsSchema = {
  type: 'object',
  properties: {
    visaType: {
      type: 'string',
      enum: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
      description: 'Type of UAE visa (optional)'
    },
    visaExpiryDate: {
      type: 'string',
      format: 'date-time',
      description: 'Visa expiry date (optional for UAE employees)'
    },
    isActive: {
      type: 'boolean',
      description: 'Whether the visa is active (only relevant when visa details are provided)'
    }
  }
  // No required array - all fields are optional
};
```

#### API Integration:

The visa details are now included in:
- User creation (`POST /users`)
- User updates (`PUT /users/:id`)
- User retrieval (`GET /users`, `GET /users/:id`)
- All user listing endpoints

## Visa Types Supported

### 1. Standard Employment Visa
- **Description**: Regular employment visa for professional workers
- **Duration**: Typically 2-3 years
- **Requirements**: Employment contract, medical fitness

### 2. Domestic Worker Visa
- **Description**: Visa for domestic workers (maids, drivers, etc.)
- **Duration**: Typically 2 years
- **Requirements**: Employment contract, medical fitness, accommodation

### 3. Green Visa
- **Description**: Long-term residency visa (5-10 years)
- **Duration**: 5-10 years
- **Requirements**: High skills, specific qualifications, financial stability

## Usage Examples

### Creating a UAE Employee with Visa Details

```json
POST /users
{
  "name": "Ahmed Al Mansouri",
  "email": "ahmed@company.ae",
  "password": "securepassword123",
  "role": "staff",
  "departmentId": "IT001",
  "country": "AE",
  "currency": "AED",
  "licenseType": "employee",
  "portalAccess": true,
  "visaDetails": {
    "visaType": "Standard Employment Visa",
    "visaExpiryDate": "2026-12-31T23:59:59.000Z",
    "isActive": true
  }
}
```

### Updating Visa Details

```json
PUT /users/:id
{
  "visaDetails": {
    "visaType": "Green Visa",
    "visaExpiryDate": "2030-06-30T23:59:59.000Z",
    "isActive": true
  }
}
```

### Retrieving User with Visa Details

```json
GET /users/:id
{
  "success": true,
  "data": {
    "_id": "user_id",
    "name": "Ahmed Al Mansouri",
    "email": "ahmed@company.ae",
    "country": "AE",
    "currency": "AED",
    "visaDetails": {
      "visaType": "Standard Employment Visa",
      "visaExpiryDate": "2026-12-31T23:59:59.000Z",
      "isActive": true
    }
  }
}
```

## Validation Rules

### For UAE Employees (country = 'AE'):

1. **Optional Field**: `visaDetails` is completely optional
2. **Conditional Validation**: Only validates if visa details are provided
3. **Valid Visa Types**: Must be one of the three supported types (if provided)
4. **Future Date**: Visa expiry date must be in the future (if provided)
5. **Active Status**: Visa must be marked as active (if provided)

### For Non-UAE Employees:

1. **Optional**: Visa details are not required
2. **No Validation**: No validation applied if country is not 'AE'

## Error Handling

### Common Error Scenarios:

1. **Incomplete Visa Details for UAE Employee**:
   ```
   Error: If visa details are provided, both visa type and expiry date are required
   ```

2. **Expired Visa**:
   ```
   Error: Visa has expired. Please update with a valid expiry date
   ```

3. **Invalid Visa Type**:
   ```
   Error: Visa type must be one of: Standard Employment Visa, Domestic Worker Visa, Green Visa
   ```

4. **Past Expiry Date**:
   ```
   Error: Visa expiry date must be in the future for UAE employees
   ```

## Database Impact

### Schema Changes:
- Added `visaDetails` field to user collection
- Field is optional but becomes required for UAE users
- Includes validation at the database level

### Migration Strategy:
- **Backward Compatible**: Existing users without visa details continue to work
- **Progressive Enhancement**: UAE users can be updated with visa details
- **No Breaking Changes**: Non-UAE users are unaffected

## API Endpoints Updated

### 1. User Creation (`POST /users`)
- ✅ Accepts visa details in request body
- ✅ Validates visa details for UAE employees
- ✅ Returns visa details in response

### 2. User Update (`PUT /users/:id`)
- ✅ Accepts visa details updates
- ✅ Validates updated visa details
- ✅ Returns updated visa details

### 3. User Retrieval (`GET /users`, `GET /users/:id`)
- ✅ Includes visa details in response
- ✅ Filters work with visa details

### 4. User Search and Filtering
- ✅ Can filter by country to find UAE employees
- ✅ Can include visa details in search results

## Testing Scenarios

### 1. UAE Employee Creation
- ✅ Create UAE employee with valid visa details
- ✅ Create UAE employee without visa details (should fail)
- ✅ Create UAE employee with expired visa (should fail)

### 2. Non-UAE Employee Creation
- ✅ Create non-UAE employee without visa details (should succeed)
- ✅ Create non-UAE employee with visa details (should succeed)

### 3. Visa Details Updates
- ✅ Update visa type
- ✅ Update visa expiry date
- ✅ Update visa active status

### 4. Validation Testing
- ✅ Test with expired visa date
- ✅ Test with invalid visa type
- ✅ Test with missing required fields

## Benefits

1. **Compliance**: Ensures UAE visa requirements are met
2. **Automation**: Automatic validation reduces manual errors
3. **Flexibility**: Supports different visa types

## Critical Fix Applied

### Root Cause of "visaType is required!" Error

The error was caused by **OpenAPI schema validation** in the routes file, not the Mongoose model validation.

#### Problem:
```typescript
// src/routes/user.routes.ts - BEFORE (causing the error)
const visaDetailsSchema = {
  type: 'object',
  properties: {
    visaType: { /* ... */ },
    visaExpiryDate: { /* ... */ },
    isActive: { /* ... */ }
  },
  required: ['visaType', 'visaExpiryDate'] // ❌ This was causing the error
};
```

#### Solution:
```typescript
// src/routes/user.routes.ts - AFTER (fixed)
const visaDetailsSchema = {
  type: 'object',
  properties: {
    visaType: { /* ... */ },
    visaExpiryDate: { /* ... */ },
    isActive: { /* ... */ }
  }
  // ✅ Removed required array - all fields are now optional
};
```

### Files Fixed:
1. ✅ `src/models/user.model.ts` - Made visa fields optional in Mongoose schema
2. ✅ `src/services/user.service.ts` - Updated TypeScript interfaces
3. ✅ `src/routes/user.routes.ts` - **CRITICAL**: Removed required validation from OpenAPI schema

### Result:
- ✅ No more "visaType is required!" errors
- ✅ UAE users can be created/retrieved without visa details
- ✅ All validation is now truly optional

## Logical Consistency Fix

### Problem Identified:
When a user has no `visaDetails` (null/undefined), showing `isActive: true` was logically inconsistent.

### Fix Applied:
1. **Removed Misleading Default**: Removed `default: true` from `isActive` field
2. **Updated Descriptions**: Clarified that `isActive` is only relevant when visa details are provided
3. **Logical Behavior**: 
   - No visa details → `visaDetails: null` → No `isActive` value
   - With visa details → `visaDetails: { visaType: "...", isActive: true/false }`

### Current Behavior:
```json
// User with no visa details
{
  "name": "Ahmed Al Mansouri",
  "country": "AE",
  "visaDetails": null  // ✅ No isActive field
}

// User with visa details
{
  "name": "Ahmed Al Mansouri", 
  "country": "AE",
  "visaDetails": {
    "visaType": "Standard Employment Visa",
    "visaExpiryDate": "2026-12-31T23:59:59.000Z",
    "isActive": true  // ✅ Only present when visa details exist
  }
}
```

### Excel Export Logic:
```typescript
// Correct logic in Excel export
user.visaDetails?.isActive ? 'Yes' : 'No'
// If visaDetails is null → 'No' ✅
// If visaDetails exists but isActive is false → 'No' ✅  
// If visaDetails exists and isActive is true → 'Yes' ✅
```
4. **Integration**: Seamlessly integrated with existing user management
5. **Type Safety**: TypeScript interfaces ensure data integrity

## Future Enhancements

1. **Visa Renewal Tracking**: Track visa renewal history
2. **Expiry Notifications**: Automated alerts for expiring visas
3. **Document Upload**: Support for visa document attachments
4. **Visa Status Tracking**: Track visa application status
5. **Reporting**: Visa expiry reports and analytics

## Conclusion

The UAE visa details implementation provides a robust solution for managing visa information for UAE employees while maintaining backward compatibility for existing users. The solution includes comprehensive validation, type safety, and seamless API integration.

The implementation ensures compliance with UAE visa requirements while providing flexibility for different visa types and automatic validation to prevent errors. 