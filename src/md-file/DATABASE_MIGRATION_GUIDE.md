# Database Migration Guide: Test → HRMS Production

## Overview

This guide helps you migrate your MongoDB database from "test" to "hrms_production" and verify the setup.

## Changes Made

### 1. Configuration Update
- **File**: `src/config/index.ts`
- **Change**: Updated default MongoDB URI to include `/hrms_production` database name

### 2. New Scripts Added
- **Migration Script**: `scripts/migrate-to-production-db.js`
- **Verification Script**: `scripts/verify-database.js`
- **Package.json Scripts**: Added convenient npm commands

## Step-by-Step Migration Process

### Step 1: Verify Current Setup
```bash
# Check current database connection
npm run db:verify
```

### Step 2: Dry Run Migration (Optional)
```bash
# See what would be migrated without actually doing it
npm run db:migrate:dry-run
```

### Step 3: Perform Migration
```bash
# Migrate all data from test to hrms_production
npm run db:migrate
```

### Step 4: Verify New Database
```bash
# Verify hrms_production database is working
npm run db:verify
```

## Environment Variables

### Option 1: Use Environment Variable (Recommended)
```bash
# Set in your .env file or environment
export MONGODB_URI="mongodb+srv://username:password@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0"
```

### Option 2: Use Default Configuration
The config file now defaults to `hrms_production` database.

## Manual MongoDB Commands (Alternative)

If you prefer using MongoDB shell directly:

### 1. Copy Database
```bash
# Connect to MongoDB shell
mongosh "mongodb+srv://username:password@cluster0.0ktur.mongodb.net"

# Copy entire database
db.copyDatabase("test", "hrms_production", "mongodb+srv://username:password@cluster0.0ktur.mongodb.net")
```

### 2. Copy Specific Collections
```bash
# Copy specific collections
db.copyDatabase("test", "hrms_production", "mongodb+srv://username:password@cluster0.0ktur.mongodb.net", "users")
db.copyDatabase("test", "hrms_production", "mongodb+srv://username:password@cluster0.0ktur.mongodb.net", "leaves")
# ... repeat for other collections
```

## Verification Steps

### 1. Check Database Connection
```bash
npm run db:verify
```

Expected output:
```
🔍 Verifying database connection and collections...
🔌 Connecting to: mongodb+srv://.../hrms_production
✅ Connected to MongoDB successfully!
📊 Database name: hrms_production
📋 Found X collections:
  - users: Y documents
  - leaves: Z documents
  ...
```

### 2. Test Application
```bash
# Start your application
npm run dev

# Test API endpoints
curl http://localhost:5800/users
```

### 3. Check Collections in MongoDB Atlas
1. Go to MongoDB Atlas dashboard
2. Navigate to Collections
3. Verify `hrms_production` database exists
4. Check that all collections are present

## Collections That Will Be Created Automatically

When your application starts, Mongoose will automatically create these collections in the new database:

- `users` - User accounts and profiles
- `leaves` - Leave requests and approvals
- `payrolls` - Payroll records
- `attendance-records` - Daily attendance
- `attendance-regularizations` - Attendance corrections
- `audit-logs` - System audit trail
- `data-units` - Data management
- `documents` - File uploads
- `holiday-calendars` - Holiday schedules
- `leave-summaries` - Leave summaries
- `lovs` - List of values
- `organizations` - Organization settings
- `overtimes` - Overtime records
- `payroll-deductions` - Salary deductions
- `payroll-salary-structures` - Salary structures
- `payslips` - Payroll slips
- `reports` - System reports
- `salary-assignments` - Salary assignments
- `salary-structures` - Salary configurations
- `shifts` - Work shifts
- `tax-declarations` - Tax declarations
- `tax-slabs` - Tax configurations
- `timesheet-files` - Timesheet attachments
- `timesheets` - Time tracking
- `training-attendances` - Training attendance
- `trainings` - Training records
- `weekend-calendars` - Weekend schedules

## Troubleshooting

### Issue: Connection Failed
```bash
# Check if MongoDB URI is correct
echo $MONGODB_URI

# Test connection manually
mongosh "your-mongodb-uri"
```

### Issue: Collections Not Created
```bash
# Restart application to trigger collection creation
npm run dev

# Check logs for any errors
```

### Issue: Migration Failed
```bash
# Check source database exists
npm run db:migrate:dry-run

# Verify permissions
# Ensure you have read access to source and write access to target
```

### Issue: Data Not Migrated
```bash
# Check if source database has data
mongosh "mongodb+srv://.../test" --eval "db.users.countDocuments()"

# Run migration with verbose logging
node scripts/migrate-to-production-db.js
```

## Rollback Plan

If you need to rollback:

### 1. Change Configuration Back
```typescript
// In src/config/index.ts
mongoUri: process.env.MONGODB_URI || 'mongodb+srv://.../test?retryWrites=true&w=majority&appName=Cluster0',
```

### 2. Or Use Environment Variable
```bash
export MONGODB_URI="mongodb+srv://.../test?retryWrites=true&w=majority&appName=Cluster0"
```

## Security Considerations

1. **Backup**: Always backup your data before migration
2. **Permissions**: Ensure proper database permissions
3. **Environment Variables**: Use environment variables for sensitive data
4. **Testing**: Test in staging environment first

## Performance Notes

- Migration speed depends on data size and network
- Large collections may take time to migrate
- Consider running during off-peak hours
- Monitor MongoDB Atlas metrics during migration

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review MongoDB Atlas logs
3. Verify network connectivity
4. Check database permissions 