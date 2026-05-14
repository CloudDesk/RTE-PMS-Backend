# Database Cloning Guide

This guide explains how to clone all collections and data from the old database (`hrms_production`) to the new database (`zuno-hr-india`) while preserving all IDs and relationships.

## Overview

The cloning process will:
- ✅ Connect to both old and new databases
- ✅ Retrieve all collections from the old database
- ✅ Clone all documents with the same IDs
- ✅ Preserve all relationships and references
- ✅ Provide detailed progress tracking and error handling

## Available Scripts

### 1. Simple Clone Script (`simpleCloneDatabase.ts`)
A straightforward script that clones all collections without advanced features.

**Usage:**
```bash
npm run db:clone
```

**Features:**
- Basic collection cloning
- Simple progress tracking
- Error handling
- Clean output

### 2. Advanced Clone Script (`cloneDatabase.ts`)
A comprehensive script with advanced features for large databases.

**Usage:**
```bash
npm run db:clone:advanced
```

**Features:**
- Batch processing for large collections
- Detailed statistics and reporting
- Progress tracking with timestamps
- Error recovery and retry logic
- Memory optimization
- Graceful shutdown handling

## Database Connections

The scripts use the following connection strings:

**Old Database (Source):**
```
mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0
```

**New Database (Destination):**
```
mongodb+srv://sachioncloud:Maples7123456789@cluster0.0ktur.mongodb.net/zuno-hr-india?retryWrites=true&w=majority&appName=Cluster0
```

## Collections That Will Be Cloned

Based on your project structure, the following collections will be cloned:

- `users` - User accounts and profiles
- `attendances` - Attendance records
- `leaves` - Leave applications and records
- `overtimes` - Overtime records
- `payslips` - Payslip data
- `payrolls` - Payroll information
- `lovs` - List of values
- `auditlogs` - Audit trail
- `shifts` - Shift assignments
- `trainings` - Training records
- `trainingattendances` - Training attendance
- `payrollsalarystructures` - Salary structure data
- `salarystructures` - Salary structure definitions
- `salaryassignments` - Salary assignments
- `attendancerecords` - Attendance record details
- `dataunits` - Data unit information
- `timesheets` - Timesheet data
- `holidaycalendars` - Holiday calendar
- `attendanceregularizations` - Attendance regularization
- And any other collections present in the database

## Important Notes

### ⚠️ Data Safety
- The scripts will **clear existing data** in the new database before cloning
- This is a **complete replacement**, not an append operation
- Make sure you have backups if needed

### 🔄 Process Flow
1. Connect to both databases
2. List all collections in the old database
3. For each collection:
   - Count total documents
   - Clear existing data in new collection
   - Clone all documents with same IDs
   - Report progress and any errors

### 📊 Output Example
```
🔌 Connecting to databases...
✅ Connected to OLD database (hrms_production)
✅ Connected to NEW database (zuno-hr-india)

📋 Found 19 collections to clone

🔄 Cloning collection: users
   📊 Documents to clone: 150
   🗑️  Cleared existing data in new collection
   ✅ Cloned 150 documents

🔄 Cloning collection: attendances
   📊 Documents to clone: 5000
   🗑️  Cleared existing data in new collection
   ✅ Cloned 5000 documents

...

==================================================
📊 CLONING COMPLETED
==================================================
📁 Collections: 19
📄 Total Documents: 25000
✅ Cloned Documents: 25000
==================================================
```

## Troubleshooting

### Connection Issues
If you encounter connection issues:
1. Verify the connection strings are correct
2. Check network connectivity
3. Ensure MongoDB Atlas allows connections from your IP

### Memory Issues
For very large databases:
1. Use the advanced script (`db:clone:advanced`)
2. It processes data in batches to avoid memory issues
3. Monitor system resources during cloning

### Duplicate Key Errors
The advanced script handles duplicate key errors gracefully:
- Continues processing other documents
- Reports the number of duplicates
- Doesn't stop the entire process

## Running the Scripts

### Prerequisites
- Node.js installed
- All dependencies installed (`npm install`)
- Access to both MongoDB databases

### Quick Start
```bash
# Simple clone
npm run db:clone

# Advanced clone with detailed reporting
npm run db:clone:advanced
```

### Manual Execution
```bash
# Run simple script directly
npx ts-node scripts/simpleCloneDatabase.ts

# Run advanced script directly
npx ts-node scripts/cloneDatabase.ts
```

## Monitoring Progress

The scripts provide real-time progress updates:
- Collection-by-collection progress
- Document count for each collection
- Error reporting
- Final summary with statistics

## Post-Clone Verification

After cloning, you can verify the data:

1. **Count Verification:**
   ```javascript
   // In MongoDB shell or compass
   db.users.countDocuments() // Should match old database
   db.attendances.countDocuments() // Should match old database
   ```

2. **Sample Data Check:**
   ```javascript
   // Check a few documents to ensure data integrity
   db.users.findOne()
   db.attendances.findOne()
   ```

3. **Relationship Verification:**
   - Check that ObjectId references still work
   - Verify that lookups return correct data
   - Test application functionality

## Support

If you encounter any issues:
1. Check the console output for error messages
2. Verify database connections
3. Ensure sufficient permissions on both databases
4. Check available disk space and memory

The scripts are designed to be robust and provide clear error messages to help diagnose any issues.
