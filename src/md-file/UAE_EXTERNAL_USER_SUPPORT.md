# UAE + External User Support

This document outlines the changes made to support UAE operations and external users in the Tendly API.

## Overview

The User schema has been enhanced to support:
- **Multi-country operations** (India and UAE)
- **External users** (contractors, vendors, etc.)
- **Country-specific configurations** (currency, timezone, tax system, etc.)

## New User Schema Fields

### Country & Currency Support
```typescript
country: {
  type: String,
  enum: ['IN', 'AE'], // Extend later for other countries
  default: 'IN'
},
currency: {
  type: String,
  enum: ['INR', 'AED'],
  default: 'INR'
}
```

### External User Support
```typescript
licenseType: {
  type: String,
  enum: ['employee', 'external'],
  default: 'employee'
},
portalAccess: {
  type: Boolean,
  default: true
} // false for external users
```

### Role Update
```typescript
role: {
  type: String,
  required: true,
  enum: ['admin', 'manager', 'staff', 'external'], // Added 'external'
}
```

## Authentication Changes

### JWT Token Enhancement
The JWT token now includes the new fields:
- `country`
- `currency`
- `licenseType`
- `portalAccess`

### Login Validation
- Users without `portalAccess: true` cannot log in
- External users (`licenseType: 'external'`) automatically get `portalAccess: false`

## Country-Specific Configurations

### India (IN)
- **Currency**: INR
- **Timezone**: Asia/Kolkata
- **Working Days**: Monday to Friday
- **Tax System**: Indian
- **Payroll Frequency**: Monthly

### UAE (AE)
- **Currency**: AED
- **Timezone**: Asia/Dubai
- **Working Days**: Sunday to Thursday
- **Tax System**: UAE
- **Payroll Frequency**: Monthly

## Usage Examples

### Accessing User Country Data in Routes
```typescript
// In any route handler
const userCountry = request.user?.country;
const userCurrency = request.user?.currency;
const userLicenseType = request.user?.licenseType;

// Use country-specific logic
if (userCountry === 'AE') {
  // UAE-specific logic
} else if (userCountry === 'IN') {
  // India-specific logic
}
```

### Using Country Configuration Utility
```typescript
import { getCountryConfig, isUAECountry } from '../utilis/countryConfig';

const userCountry = request.user?.country || 'IN';
const config = getCountryConfig(userCountry);

// Get country-specific settings
const timezone = config.timezone;
const workingDays = config.workingDays;
const taxSystem = config.taxSystem;
```

## Migration

### Running the Migration Script
```bash
# Run the migration to update existing users
npx ts-node scripts/migrateUserSchema.ts
```

The migration script will:
1. Add default values for new fields to existing users
2. Set `country: 'IN'`, `currency: 'INR'`, `licenseType: 'employee'`, `portalAccess: true`
3. Verify all users have been updated

## Business Logic Impact

### External Users
- **Role**: Automatically set to 'external'
- **Portal Access**: Disabled by default (`portalAccess: false`)
- **Use Case**: Contractors, vendors, consultants

### Country-Specific Features
- **Payroll**: Different tax calculations based on country
- **Attendance**: Different working days and holidays
- **Currency**: All monetary values in local currency
- **Timezone**: Date/time operations in local timezone

## API Response Changes

### Login Response
The login API now returns additional user fields:
```json
{
  "success": true,
  "data": {
    "token": "...",
    "user": {
      "_id": "...",
      "name": "...",
      "email": "...",
      "role": "...",
      "departmentId": "...",
      "country": "IN",
      "currency": "INR",
      "licenseType": "employee",
      "portalAccess": true
    }
  }
}
```

## Security Considerations

1. **Portal Access Control**: External users cannot access the portal by default
2. **Role-Based Access**: External users have limited permissions
3. **Country Isolation**: Users can only access data for their assigned country

## Future Enhancements

1. **Additional Countries**: Extend support for more countries
2. **Multi-Currency**: Support for multiple currencies per user
3. **Advanced External User Management**: More granular permissions for external users
4. **Country-Specific Features**: Tax calculations, holiday calendars, etc. 