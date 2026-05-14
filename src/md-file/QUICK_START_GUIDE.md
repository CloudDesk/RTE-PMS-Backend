# Quick Start Guide - Travel Allowance Migration

**Last Updated:** October 8, 2025

---

## 🚀 Quick Deployment (Production)

### **Step 1: Backup Database**
```bash
# Create MongoDB backup
mongodump --uri="$MONGODB_URI" --out=./backup-$(date +%Y%m%d-%H%M%S)
```

### **Step 2: Deploy Code**
```bash
npm run build
npm run hrms-build
npm run hrms-tag
npm run hrms-push
npm run hrms-deploy
```

### **Step 3: Run Migrations**
```bash
# Migration 1: Add field (REQUIRED)
cd scripts/migrations
ts-node 2025-10-08-add-travel-allowance-field.ts up

# Migration 2: Convert percentages (OPTIONAL - only if you want to migrate existing data)
ts-node 2025-10-08-convert-travel-allowance-percentage.ts up
```

### **Step 4: Verify**
```bash
# Check GCP logs
gcloud run services logs read zuno-hr-uae --region=asia-south1 --limit=50

# Test API
curl -X GET "https://your-api-url/salary-assignment/user/:userId/active" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

---

## 📝 Quick Test

### **Create Salary Assignment with Travel Allowance**
```bash
curl -X POST "https://your-api-url/salary-assignment" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -d '{
    "employeeId": "507f1f77bcf86cd799439011",
    "salaryStructureId": "507f1f77bcf86cd799439012",
    "monthlyGross": 10000,
    "travelAllowance": 500,
    "reimbursement": 0,
    "monthlyInsurance": 0,
    "isActive": true,
    "effectiveFrom": "2025-01-01T00:00:00.000Z",
    "effectiveTo": "2025-12-31T00:00:00.000Z"
  }'
```

---

## 🔄 Quick Rollback (If Issues)

```bash
# Rollback migrations (reverse order)
ts-node 2025-10-08-convert-travel-allowance-percentage.ts down
ts-node 2025-10-08-add-travel-allowance-field.ts down

# Restore database
mongorestore --uri="$MONGODB_URI" --drop ./backup-YYYYMMDD-HHMMSS

# Revert code (if needed)
git checkout <previous-commit>
npm run build && npm run hrms-build && npm run hrms-tag && npm run hrms-push && npm run hrms-deploy
```

---

## 📊 Quick Verification

### **MongoDB Shell**
```javascript
// Check field exists
db.salaryassignments.countDocuments({ travelAllowance: { $exists: true } })

// Check UAE employee assignments
db.salaryassignments.aggregate([
  { $lookup: { from: 'users', localField: 'employeeId', foreignField: '_id', as: 'user' } },
  { $match: { 'user.country': 'AE', isActive: true } },
  { $project: { employeeId: 1, monthlyGross: 1, travelAllowance: 1 } }
])

// View migration logs
db.migration_logs.find().pretty()
```

---

## 🆘 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Migration fails | Check MONGODB_URI env variable |
| Field not showing | Verify migration 1 ran successfully |
| Wrong calculation | Re-run migration 2 |
| API error | Check GCP logs |

---

## 📚 Full Documentation

- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Migration Guide:** `scripts/migrations/README.md`
- **Original Requirements:** `BACKEND_SALARY_STRUCTURE_UPDATES.md`

---

## ✅ Quick Checklist

- [ ] Database backed up
- [ ] Code deployed
- [ ] Migration 1 run (add field)
- [ ] Migration 2 run (optional - convert data)
- [ ] API tested
- [ ] Logs checked
- [ ] Team notified

---

**Need Help?** Check `IMPLEMENTATION_SUMMARY.md` for detailed information.

