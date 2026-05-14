# Database Migrations - Travel Allowance Update

**Date:** October 8, 2025  
**Module:** Salary Structure & Employee Salary Assignment  
**Priority:** High

---

## 📋 Overview

This directory contains migration scripts to update the salary assignment structure, specifically changing travel allowance from a percentage-based field in salary structures to a fixed amount field in salary assignments (UAE-specific).

---

## 🎯 Migration Scripts

### **1. Add Travel Allowance Field**
**File:** `2025-10-08-add-travel-allowance-field.ts`

**Purpose:** Adds the `travelAllowance` field to all existing salary assignments with a default value of 0.

**Changes:**
- Adds `travelAllowance: 0` to all salary assignments that don't have this field
- Updates the `updatedAt` timestamp

**Run:**
```bash
# Apply migration
npm run build
node dist/scripts/migrations/2025-10-08-add-travel-allowance-field.js up

# Or with ts-node (development)
ts-node scripts/migrations/2025-10-08-add-travel-allowance-field.ts up

# Rollback
ts-node scripts/migrations/2025-10-08-add-travel-allowance-field.ts down
```

---

### **2. Convert Travel Allowance Percentage to Fixed Amount**
**File:** `2025-10-08-convert-travel-allowance-percentage.ts`

**Purpose:** Converts existing percentage-based travel allowances to fixed amounts for UAE employees.

**Logic:**
```typescript
travelAllowance = Math.round((monthlyGross * travelAllowancePercentage) / 100)
```

**Changes:**
- Identifies all UAE employees (country = 'AE')
- Finds their active salary assignments
- Calculates fixed travel allowance from percentage
- Updates salary assignments with calculated amount
- Logs migration details to `migration_logs` collection for audit

**Run:**
```bash
# Apply migration
npm run build
node dist/scripts/migrations/2025-10-08-convert-travel-allowance-percentage.js up

# Or with ts-node (development)
ts-node scripts/migrations/2025-10-08-convert-travel-allowance-percentage.ts up

# Rollback
ts-node scripts/migrations/2025-10-08-convert-travel-allowance-percentage.ts down
```

---

## 🚀 Deployment Steps

### **Pre-Deployment Checklist**

- [ ] Review all code changes
- [ ] Test migration scripts in development environment
- [ ] Backup production database
- [ ] Review migration logs from development testing
- [ ] Notify stakeholders of maintenance window

### **Deployment Sequence**

1. **Backup Database**
   ```bash
   # MongoDB Atlas - Create a snapshot
   # Or use mongodump
   mongodump --uri="YOUR_MONGODB_URI" --out=./backup-$(date +%Y%m%d)
   ```

2. **Deploy Code Changes**
   ```bash
   npm run build
   npm run hrms-build
   npm run hrms-tag
   npm run hrms-push
   npm run hrms-deploy
   ```

3. **Run Migration 1: Add Field**
   ```bash
   ts-node scripts/migrations/2025-10-08-add-travel-allowance-field.ts up
   ```
   
   **Expected Output:**
   ```
   ✅ Updated X salary assignments
   ✅ Total salary assignments with travelAllowance field: X
   ✅ Migration completed successfully
   ```

4. **Verify Migration 1**
   ```bash
   # Connect to MongoDB and verify
   db.salaryassignments.findOne({ travelAllowance: { $exists: true } })
   ```

5. **Run Migration 2: Convert Percentages (Optional)**
   ```bash
   ts-node scripts/migrations/2025-10-08-convert-travel-allowance-percentage.ts up
   ```
   
   **Expected Output:**
   ```
   📊 Found X UAE employees
   📊 Found X active salary assignments for UAE employees
   ✅ Migrated assignment...: Y% of Z = A AED
   📊 Migration Summary:
   ✅ Successfully migrated: X assignments
   ⏭️ Skipped: Y assignments
   ```

6. **Verify Migration 2**
   ```bash
   # Check migration logs
   db.migration_logs.find({ migration: '2025-10-08-convert-travel-allowance-percentage' })
   
   # Verify UAE employee assignments
   db.salaryassignments.aggregate([
     { $lookup: { from: 'users', localField: 'employeeId', foreignField: '_id', as: 'user' } },
     { $match: { 'user.country': 'AE', 'isActive': true } },
     { $project: { employeeId: 1, monthlyGross: 1, travelAllowance: 1 } }
   ])
   ```

7. **Test API Endpoints**
   ```bash
   # Test creating new salary assignment
   POST /salary-assignment
   {
     "employeeId": "...",
     "salaryStructureId": "...",
     "monthlyGross": 10000,
     "travelAllowance": 500,
     "reimbursement": 0,
     "monthlyInsurance": 0,
     "isActive": true,
     "effectiveFrom": "2025-01-01",
     "effectiveTo": "2025-12-31"
   }
   
   # Test retrieving active assignment
   GET /salary-assignment/user/:userId/active
   
   # Test payroll generation
   POST /payroll/generate
   ```

8. **Monitor Logs**
   ```bash
   # GCP Cloud Run logs
   gcloud run services logs read zuno-hr-uae --region=asia-south1 --limit=100
   ```

---

## 🔄 Rollback Procedure

If issues occur, follow these steps:

1. **Rollback Migration 2 (if run)**
   ```bash
   ts-node scripts/migrations/2025-10-08-convert-travel-allowance-percentage.ts down
   ```

2. **Rollback Migration 1**
   ```bash
   ts-node scripts/migrations/2025-10-08-add-travel-allowance-field.ts down
   ```

3. **Revert Code Deployment**
   ```bash
   # Deploy previous version
   git checkout <previous-commit>
   npm run build
   npm run hrms-build
   npm run hrms-tag
   npm run hrms-push
   npm run hrms-deploy
   ```

4. **Restore Database Backup (if necessary)**
   ```bash
   mongorestore --uri="YOUR_MONGODB_URI" --drop ./backup-YYYYMMDD
   ```

---

## 📊 Monitoring & Validation

### **Post-Deployment Checks**

1. **Database Verification**
   ```javascript
   // Check all salary assignments have travelAllowance field
   db.salaryassignments.countDocuments({ travelAllowance: { $exists: false } })
   // Should return 0
   
   // Check UAE employee assignments
   db.salaryassignments.aggregate([
     { $lookup: { from: 'users', localField: 'employeeId', foreignField: '_id', as: 'user' } },
     { $match: { 'user.country': 'AE' } },
     { $group: { 
       _id: null, 
       count: { $sum: 1 },
       avgTravelAllowance: { $avg: '$travelAllowance' },
       maxTravelAllowance: { $max: '$travelAllowance' }
     }}
   ])
   ```

2. **API Testing**
   - Create new salary assignment with travel allowance
   - Update existing salary assignment
   - Generate payroll and verify CTC includes travel allowance
   - Generate payslip and verify travel allowance is shown

3. **Application Logs**
   - Monitor for errors related to salary assignments
   - Check payroll calculation logs
   - Verify no undefined field errors

---

## 🐛 Troubleshooting

### **Issue: Migration fails with "Database connection not established"**
**Solution:** Verify MONGODB_URI environment variable is set correctly.

### **Issue: Some assignments not updated**
**Solution:** Run the migration again. The `updateMany` query uses `{ travelAllowance: { $exists: false } }` so it will only update missing records.

### **Issue: Travel allowance calculation seems incorrect**
**Solution:** 
1. Check the salary structure's `travelAllowancePercentage` value
2. Verify the employee's `monthlyGross` value
3. Check migration logs: `db.migration_logs.find()`

### **Issue: Payroll CTC is incorrect after migration**
**Solution:** 
1. Verify travel allowance is set correctly in salary assignment
2. Check that payroll calculation includes travel allowance
3. Regenerate payroll for affected employees

---

## 📝 Migration Logs

Migration logs are stored in the `migration_logs` collection:

```javascript
{
  migration: "2025-10-08-convert-travel-allowance-percentage",
  timestamp: ISODate("2025-10-08T10:00:00Z"),
  details: [
    {
      assignmentId: ObjectId("..."),
      employeeId: ObjectId("..."),
      monthlyGross: 10000,
      travelPercentage: 5,
      travelAmount: 500
    }
  ],
  summary: {
    migratedCount: 50,
    skippedCount: 10,
    totalProcessed: 60
  }
}
```

---

## 📞 Support

**For Issues:**
- Backend Team Lead
- Database Administrator
- DevOps Team

**Documentation:**
- `BACKEND_SALARY_STRUCTURE_UPDATES.md`
- `SALARY_STRUCTURE_UAE_CHANGES.md`
- API Documentation: `/documentation`

---

## ✅ Completion Checklist

After successful deployment:

- [ ] All migrations completed successfully
- [ ] Database verification passed
- [ ] API endpoints tested
- [ ] No errors in application logs
- [ ] Migration logs reviewed and archived
- [ ] Stakeholders notified of completion
- [ ] Documentation updated
- [ ] Backup verified and stored securely

---

**Last Updated:** October 8, 2025  
**Version:** 1.0  
**Author:** Development Team

